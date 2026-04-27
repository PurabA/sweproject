import { Router } from 'express';
import pool from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

const router = Router();
router.use(authenticate);

const ROLES = ['admin', 'doctor', 'receptionist', 'pharmacist', 'lab'];

router.get('/', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json(rows);
});

router.get('/recipients', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, email, role, first_name, last_name FROM users WHERE is_active = 1 ORDER BY role, last_name, first_name`
  );
  res.json(rows);
});

router.patch('/:id/read', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  await pool.execute(
    `UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ?`,
    [id, req.user.id]
  );
  res.json({ ok: true });
});

/**
 * Anyone authenticated may send a notification. Three modes:
 *   target: "all"          → broadcast to every active user
 *   target: <role>         → all active users with that role
 *   target: "user"  + userId → a single named user
 */
router.post('/send', async (req, res) => {
  const target = String(req.body?.target || '').trim().toLowerCase();
  const subject = String(req.body?.subject || '').trim();
  const body = String(req.body?.body || '').trim();

  if (!subject || !body) return res.status(400).json({ error: 'subject and body are required' });

  let recipientIds = [];

  if (target === 'all') {
    const [rows] = await pool.query(`SELECT id FROM users WHERE is_active = 1 AND id <> ? ORDER BY id`, [req.user.id]);
    recipientIds = rows.map((r) => r.id);
  } else if (ROLES.includes(target)) {
    const [rows] = await pool.query(
      `SELECT id FROM users WHERE is_active = 1 AND role = ? AND id <> ? ORDER BY id`,
      [target, req.user.id]
    );
    recipientIds = rows.map((r) => r.id);
  } else if (target === 'user') {
    const userId = Number(req.body?.userId);
    if (!userId) return res.status(400).json({ error: 'userId required when target=user' });
    if (userId === req.user.id) return res.status(400).json({ error: 'Cannot send to yourself' });
    const [[u]] = await pool.query(`SELECT id FROM users WHERE id = ? AND is_active = 1`, [userId]);
    if (!u) return res.status(404).json({ error: 'Recipient not found' });
    recipientIds = [u.id];
  } else {
    return res.status(400).json({
      error: `target must be "all", "user", or one of: ${ROLES.join(', ')}`,
    });
  }

  if (!recipientIds.length) return res.status(409).json({ error: 'No recipients matched' });

  const senderLabel = req.user?.email || `User #${req.user.id}`;
  const fullSubject = `[From ${senderLabel}] ${subject}`;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const userId of recipientIds) {
      await conn.execute(
        `INSERT INTO notifications (user_id, channel, subject, body)
         VALUES (?, 'in_app', ?, ?)`,
        [userId, fullSubject, body]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  await audit(req, 'notify_send', 'notification', null, { target, recipients: recipientIds.length });
  res.status(201).json({ ok: true, recipients: recipientIds.length });
});

export default router;
