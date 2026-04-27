import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

async function runThresholdChecks() {
  const [low] = await pool.query(
    `SELECT id, name, quantity, reorder_threshold FROM inventory_items WHERE quantity < reorder_threshold`
  );
  for (const row of low) {
    await pool.execute(
      `INSERT INTO system_alerts (severity, category, title, message)
       VALUES ('warning', 'inventory', ?, ?)`,
      [`Low stock: ${row.name}`, `Current quantity ${row.quantity} is below threshold ${row.reorder_threshold}.`]
    );
  }
  const [[bed]] = await pool.query(
    `SELECT COUNT(*) AS occ FROM icu_beds WHERE status IN ('occupied','cleaning','reserved')`
  );
  const [[total]] = await pool.query(`SELECT COUNT(*) AS t FROM icu_beds`);
  const occ = bed.occ;
  const ratio = total.t ? occ / total.t : 0;
  if (ratio >= 0.85) {
    await pool.execute(
      `INSERT INTO system_alerts (severity, category, title, message)
       VALUES ('critical', 'beds', 'ICU capacity high', ?)`,
      [`${occ} of ${total.t} beds in use or unavailable (${Math.round(ratio * 100)}%).`]
    );
  }
}

router.get('/', requireRole('admin', 'doctor', 'receptionist', 'pharmacist', 'lab'), async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM system_alerts ORDER BY created_at DESC LIMIT 100`
  );
  res.json(rows);
});

router.post('/refresh', requireRole('admin'), async (_req, res) => {
  await runThresholdChecks();
  res.json({ ok: true });
});

router.patch('/:id/acknowledge', requireRole('admin', 'doctor', 'receptionist', 'pharmacist', 'lab'), async (req, res) => {
  await pool.execute('UPDATE system_alerts SET acknowledged = 1 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

export default router;
