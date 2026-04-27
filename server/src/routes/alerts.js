import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

const router = Router();
router.use(authenticate);

/**
 * Re-evaluate alert rules.  We treat system_alerts as a derived table:
 * the truth lives in inventory_items / icu_beds / etc., and `system_alerts`
 * is a snapshot.  Each scan TRUNCATEs the previous snapshot then re-emits
 * the current set, so stale alerts disappear once the underlying problem
 * is resolved.
 */
async function runThresholdChecks(conn) {
  await conn.execute(`DELETE FROM system_alerts`);

  const [low] = await conn.query(
    `SELECT id, name, quantity, reorder_threshold FROM inventory_items WHERE quantity < reorder_threshold`
  );
  for (const row of low) {
    await conn.execute(
      `INSERT INTO system_alerts (severity, category, title, message)
       VALUES ('warning', 'inventory', ?, ?)`,
      [`Low stock: ${row.name}`, `Current quantity ${row.quantity} is below threshold ${row.reorder_threshold}.`]
    );
  }

  const [[expiring]] = await conn.query(
    `SELECT COUNT(*) AS c FROM inventory_items
      WHERE expiry_date IS NOT NULL AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)`
  );
  if (expiring.c > 0) {
    await conn.execute(
      `INSERT INTO system_alerts (severity, category, title, message)
       VALUES ('warning', 'inventory', 'Items expiring within 30 days', ?)`,
      [`${expiring.c} SKU(s) expire within 30 days. Review the pharmacy expiry tracker.`]
    );
  }

  const [[bed]] = await conn.query(
    `SELECT COUNT(*) AS occ FROM icu_beds WHERE status IN ('occupied','reserved')`
  );
  const [[total]] = await conn.query(`SELECT COUNT(*) AS t FROM icu_beds`);
  const occ = bed.occ;
  const ratio = total.t ? occ / total.t : 0;
  if (ratio >= 0.85 && total.t > 0) {
    await conn.execute(
      `INSERT INTO system_alerts (severity, category, title, message)
       VALUES ('critical', 'beds', 'ICU capacity high', ?)`,
      [`${occ} of ${total.t} beds occupied or reserved (${Math.round(ratio * 100)}%).`]
    );
  }

  const [[outstanding]] = await conn.query(
    `SELECT COUNT(*) AS c, COALESCE(SUM(total_amount),0) AS amt
       FROM bills WHERE status IN ('pending','draft')`
  );
  if (outstanding.c > 0) {
    await conn.execute(
      `INSERT INTO system_alerts (severity, category, title, message)
       VALUES ('info', 'billing', 'Outstanding invoices', ?)`,
      [`${outstanding.c} pending invoice(s) totaling $${Number(outstanding.amt).toFixed(2)}.`]
    );
  }
}

router.get('/', requireRole('admin', 'doctor', 'receptionist', 'pharmacist', 'lab'), async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT * FROM system_alerts ORDER BY created_at DESC LIMIT 100`
  );
  res.json(rows);
});

router.post('/refresh', requireRole('admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await runThresholdChecks(conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
