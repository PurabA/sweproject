import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

async function runThresholdChecks() {
    try {
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
    } catch (error) {
          console.error('Error running threshold checks:', error);
          throw error;
    }
}

router.get('/', requireRole('admin', 'doctor', 'receptionist', 'pharmacist', 'lab'), async (_req, res) => {
    try {
          const [rows] = await pool.query(
                  `SELECT * FROM system_alerts ORDER BY created_at DESC LIMIT 100`
                );
          res.json(rows);
    } catch (error) {
          console.error('Error fetching alerts:', error);
          res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

router.post('/refresh', requireRole('admin'), async (_req, res) => {
    try {
          await runThresholdChecks();
          res.json({ ok: true });
    } catch (error) {
          console.error('Error refreshing alerts:', error);
          res.status(500).json({ error: 'Failed to refresh alerts' });
    }
});

router.patch('/:id/acknowledge', requireRole('admin', 'doctor', 'receptionist', 'pharmacist', 'lab'), async (req, res) => {
    try {
          const [result] = await pool.execute('UPDATE system_alerts SET acknowledged = 1 WHERE id = ?', [req.params.id]);
          if (result.affectedRows === 0) {
                  return res.status(404).json({ error: 'Alert not found' });
          }
          res.json({ ok: true });
    } catch (error) {
          console.error('Error acknowledging alert:', error);
          res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
});

export default router;
