import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { refreshSystemAlerts } from '../utils/systemAlerts.js';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('admin', 'doctor', 'receptionist', 'pharmacist', 'lab'), async (_req, res) => {
  await refreshSystemAlerts(pool);
  const [rows] = await pool.query(
    `SELECT * FROM system_alerts ORDER BY created_at DESC LIMIT 100`
  );
  res.json(rows);
});

router.post('/refresh', requireRole('admin'), async (req, res) => {
  await refreshSystemAlerts(pool);
  const [rows] = await pool.query(
    `SELECT * FROM system_alerts ORDER BY created_at DESC LIMIT 100`
  );
  await audit(req, 'refresh', 'system_alerts', null, { count: rows.length });
  res.json({ ok: true, alerts: rows, count: rows.length });
});

router.patch('/:id/acknowledge', requireRole('admin', 'doctor', 'receptionist', 'pharmacist', 'lab'), async (req, res) => {
  await pool.execute('UPDATE system_alerts SET acknowledged = 1 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

export default router;
