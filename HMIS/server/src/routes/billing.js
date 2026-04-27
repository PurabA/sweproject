import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { nextBillNumber } from '../utils/numbers.js';

const router = Router();
router.use(authenticate);

router.get('/billing/payment-history', requireRole('admin', 'receptionist', 'doctor'), async (req, res) => {
  const pid = req.query.patientId ? Number(req.query.patientId) : null;
  let sql = `SELECT b.*, p.patient_number, p.first_name AS pf, p.last_name AS pl FROM bills b
     JOIN patients p ON p.id = b.patient_id WHERE b.status = 'paid'`;
  const params = [];
  if (pid) {
    sql += ' AND b.patient_id = ?';
    params.push(pid);
  }
  sql += ' ORDER BY b.paid_at DESC, b.created_at DESC LIMIT 300';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

router.get('/billing/outstanding-dues', requireRole('admin', 'receptionist', 'doctor'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT b.*, p.patient_number, p.first_name AS pf, p.last_name AS pl FROM bills b
     JOIN patients p ON p.id = b.patient_id WHERE b.status IN ('pending','draft') ORDER BY b.created_at DESC LIMIT 300`
  );
  const [[agg]] = await pool.query(
    `SELECT COUNT(*) AS bill_count, COALESCE(SUM(total_amount),0) AS total_open FROM bills WHERE status IN ('pending','draft')`
  );
  res.json({ bills: rows, aggregate: agg });
});

router.get('/billing/reports/summary', requireRole('admin', 'receptionist', 'doctor'), async (_req, res) => {
  const [byStatus] = await pool.query(
    `SELECT status, COUNT(*) AS cnt, COALESCE(SUM(total_amount),0) AS total_amount FROM bills GROUP BY status`
  );
  const [[month]] = await pool.query(
    `SELECT COALESCE(SUM(total_amount),0) AS paid_this_month FROM bills WHERE status = 'paid'
     AND paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`
  );
  res.json({ byStatus, paidThisMonth: month.paid_this_month });
});

router.get('/bills', requireRole('admin', 'receptionist', 'doctor'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT b.*, p.patient_number, p.first_name AS pf, p.last_name AS pl FROM bills b
     JOIN patients p ON p.id = b.patient_id ORDER BY b.created_at DESC LIMIT 200`
  );
  res.json(rows);
});

router.get('/bills/:id/items', requireRole('admin', 'receptionist', 'doctor'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM bill_items WHERE bill_id = ?', [req.params.id]);
  res.json(rows);
});

router.get('/billing/doctor/summary', requireRole('doctor'), async (req, res) => {
  const doctorId = req.user.id;
  const [[totals]] = await pool.query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN b.status IN ('pending','draft') THEN (bi.quantity * bi.unit_price) ELSE 0 END), 0) AS open_amount,
      COALESCE(SUM(CASE WHEN b.status = 'paid' THEN (bi.quantity * bi.unit_price) ELSE 0 END), 0) AS paid_amount,
      COALESCE(SUM(CASE WHEN b.status = 'paid' AND b.paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01') THEN (bi.quantity * bi.unit_price) ELSE 0 END), 0) AS paid_this_month
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    JOIN consultations c ON c.id = bi.consultation_id
    WHERE c.doctor_id = ?
    `,
    [doctorId]
  );

  const [[counts]] = await pool.query(
    `
    SELECT
      COUNT(DISTINCT c.id) AS consultations_billed,
      COUNT(DISTINCT b.id) AS bills_touched
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    JOIN consultations c ON c.id = bi.consultation_id
    WHERE c.doctor_id = ?
    `,
    [doctorId]
  );

  res.json({ ...totals, ...counts });
});

router.get('/billing/doctor/encounters', requireRole('doctor'), async (req, res) => {
  const doctorId = req.user.id;
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const [rows] = await pool.query(
    `
    SELECT
      c.id AS consultation_id,
      c.created_at AS consultation_created_at,
      p.patient_number,
      p.first_name AS pf,
      p.last_name AS pl,
      b.id AS bill_id,
      b.bill_number,
      b.status AS bill_status,
      b.paid_at,
      bi.description,
      bi.quantity,
      bi.unit_price,
      (bi.quantity * bi.unit_price) AS line_total
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    JOIN consultations c ON c.id = bi.consultation_id
    JOIN patients p ON p.id = c.patient_id
    WHERE c.doctor_id = ?
    ORDER BY c.created_at DESC, b.created_at DESC
    LIMIT ?
    `,
    [doctorId, limit]
  );
  res.json(rows);
});

router.post('/bills', requireRole('admin', 'receptionist'), async (req, res) => {
  const b = req.body || {};
  const billNumber = await nextBillNumber();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const items = Array.isArray(b.items) ? b.items : [];
    let subtotal = 0;
    for (const it of items) {
      const line = (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1);
      subtotal += line;
    }
    const tax = b.taxAmount != null ? Number(b.taxAmount) : Math.round(subtotal * 0.08 * 100) / 100;
    const total = subtotal + tax;
    const [r] = await conn.execute(
      `INSERT INTO bills (patient_id, bill_number, total_amount, tax_amount, status, notes, created_by)
       VALUES (?, ?, ?, ?, COALESCE(?, 'pending'), ?, ?)`,
      [b.patientId, billNumber, total, tax, b.status || 'pending', b.notes || null, req.user.id]
    );
    const billId = r.insertId;
    const consultationId = b.consultationId ? Number(b.consultationId) : null;
    const appointmentId = b.appointmentId ? Number(b.appointmentId) : null;
    for (const it of items) {
      await conn.execute(
        `INSERT INTO bill_items (bill_id, description, quantity, unit_price, consultation_id, appointment_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [billId, it.description, it.quantity || 1, it.unitPrice, consultationId, appointmentId]
      );
    }
    await conn.commit();
    await audit(req, 'create', 'bill', billId, { billNumber, consultationId, appointmentId });
    res.status(201).json({ id: billId, billNumber, totalAmount: total });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.patch('/bills/:id', requireRole('admin', 'receptionist'), async (req, res) => {
  const b = req.body || {};
  const paidAt = b.status === 'paid' ? new Date() : null;
  await pool.execute(
    `UPDATE bills SET status = COALESCE(?, status), notes = COALESCE(?, notes), paid_at = COALESCE(?, paid_at) WHERE id = ?`,
    [b.status ?? null, b.notes ?? null, paidAt, req.params.id]
  );
  await audit(req, 'update', 'bill', req.params.id);
  res.json({ ok: true });
});

export default router;
