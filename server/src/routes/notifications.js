import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json(rows);
});

router.post('/demo-email', async (req, res) => {
  const b = req.body || {};
  await pool.execute(
    `INSERT INTO notifications (user_id, channel, subject, body, sent_at)
     VALUES (?, 'email', ?, ?, NOW())`,
    [req.user.id, b.subject || 'HMIS notification', b.body || '(no body)']
  );
  res.status(201).json({ ok: true, message: 'Logged as notification record (demo — no real email sent)' });
});

router.post('/demo-sms', async (req, res) => {
  const b = req.body || {};
  await pool.execute(
    `INSERT INTO notifications (user_id, channel, subject, body, sent_at)
     VALUES (?, 'sms', ?, ?, NOW())`,
    [req.user.id, b.subject || 'HMIS SMS', b.body || '(no body)']
  );
  res.status(201).json({ ok: true, message: 'Logged as SMS notification record (demo — no carrier send)' });
});

router.post('/send', requireRole('doctor', 'admin'), async (req, res) => {
  const target = String(req.body?.target || '').trim().toLowerCase();
  const subject = String(req.body?.subject || '').trim();
  const body = String(req.body?.body || '').trim();

  if (!subject || !body) return res.status(400).json({ error: 'subject and body are required' });

  let roles;
  if (target === 'all') roles = null;
  else if (target === 'pharmacist') roles = ['pharmacist'];
  else if (target === 'lab') roles = ['lab'];
  else if (target === 'admin') roles = ['admin'];
  else return res.status(400).json({ error: "target must be one of: all, pharmacist, lab, admin" });

  const senderLabel = req.user?.role === 'doctor' ? `Dr. ${req.user?.email || req.user?.id}` : `${req.user?.email || req.user?.id}`;
  const fullSubject = `[From ${senderLabel}] ${subject}`;
  const fullBody = body;

  const sql = roles
    ? `SELECT id FROM users WHERE is_active = 1 AND role IN (${roles.map(() => '?').join(',')}) ORDER BY id`
    : `SELECT id FROM users WHERE is_active = 1 ORDER BY id`;
  const [users] = await pool.query(sql, roles || []);
  const targets = users.map((u) => u.id).filter(Boolean);
  if (!targets.length) return res.status(409).json({ error: 'No recipients matched' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const userId of targets) {
      await conn.execute(
        `INSERT INTO notifications (user_id, channel, subject, body)
         VALUES (?, 'in_app', ?, ?)`,
        [userId, fullSubject, fullBody]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  await audit(req, 'notify_send', 'notification', null, { target, recipients: targets.length });
  res.status(201).json({ ok: true, recipients: targets.length });
});

export default router;
