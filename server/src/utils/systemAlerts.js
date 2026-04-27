export async function runThresholdChecks(conn) {
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

export async function refreshSystemAlerts(pool) {
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
}

export async function getRecentActiveAlerts(pool, limit = 5) {
  const [rows] = await pool.query(
    `SELECT * FROM system_alerts WHERE acknowledged = 0 ORDER BY created_at DESC LIMIT ?`,
    [Number(limit)]
  );
  return rows;
}