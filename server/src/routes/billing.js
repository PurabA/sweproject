import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { nextBillNumber } from '../utils/numbers.js';

const router = Router();
router.use(authenticate);

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
const TAX_RATE = 0.0; // no automatic tax in the simplified hospital billing flow
const ALLOWED_STATUSES = ['draft', 'pending', 'paid', 'void'];

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normaliseItems(rawItems) {
  return (rawItems || [])
    .map((it) => {
      const description = String(it?.description ?? '').trim();
      const quantity = Math.max(1, Math.floor(Number(it?.quantity ?? 1) || 1));
      const unitPrice = round2(it?.unitPrice ?? it?.price ?? 0);
      const consultationId = num(it?.consultationId);
      const appointmentId = num(it?.appointmentId);
      return { description, quantity, unitPrice, consultationId, appointmentId };
    })
    .filter((it) => it.description.length > 0);
}

function computeTotals(items, taxOverride) {
  const subtotal = round2(items.reduce((s, it) => s + it.quantity * it.unitPrice, 0));
  const taxNum = num(taxOverride);
  const tax = taxNum !== null ? round2(taxNum) : round2(subtotal * TAX_RATE);
  const total = round2(subtotal + tax);
  return { subtotal, tax, total };
}

// ---------------------------------------------------------------
// READ — payment history (paid bills, optional patient filter)
// ---------------------------------------------------------------
//This corresponds to the billing and reports pages
router.get('/billing/payment-history', requireRole('admin', 'receptionist', 'doctor', 'pharmacist'), async (req, res) => {
  const pid = num(req.query.patientId);
  let sql = `
    SELECT b.*, p.patient_number, p.first_name AS pf, p.last_name AS pl
      FROM bills b
      JOIN patients p ON p.id = b.patient_id
     WHERE b.status = 'paid'`;
  const params = [];
  if (pid) {
    sql += ' AND b.patient_id = ?';
    params.push(pid);
  }
  sql += ' ORDER BY b.paid_at DESC, b.created_at DESC LIMIT 300';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// ---------------------------------------------------------------
// READ — outstanding dues (open AR)
// ---------------------------------------------------------------
router.get('/billing/outstanding-dues', requireRole('admin', 'receptionist', 'doctor', 'pharmacist'), async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT b.*, p.patient_number, p.first_name AS pf, p.last_name AS pl
       FROM bills b
       JOIN patients p ON p.id = b.patient_id
      WHERE b.status IN ('pending','draft')
      ORDER BY b.created_at DESC LIMIT 300`
  );
  const [[agg]] = await pool.query(
    `SELECT COUNT(*) AS bill_count, COALESCE(SUM(total_amount),0) AS total_open
       FROM bills WHERE status IN ('pending','draft')`
  );
  res.json({ bills: rows, aggregate: agg });
});

// ---------------------------------------------------------------
// READ — global summary (status rollup + paid-this-month)
// ---------------------------------------------------------------
router.get('/billing/reports/summary', requireRole('admin', 'receptionist', 'doctor', 'pharmacist'), async (_req, res) => {
  const [byStatus] = await pool.query(
    `SELECT status, COUNT(*) AS cnt, COALESCE(SUM(total_amount),0) AS total_amount
       FROM bills GROUP BY status`
  );
  const [[month]] = await pool.query(
    `SELECT COALESCE(SUM(total_amount),0) AS paid_this_month
       FROM bills
      WHERE status = 'paid'
        AND paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`
  );
  const [[lifetime]] = await pool.query(
    `SELECT COALESCE(SUM(total_amount),0) AS paid_lifetime
       FROM bills WHERE status = 'paid'`
  );
  res.json({
    byStatus,
    paidThisMonth: month?.paid_this_month ?? 0,
    paidLifetime: lifetime?.paid_lifetime ?? 0,
  });
});

// ---------------------------------------------------------------
// READ — bills list (role-aware)
// admin/receptionist/pharmacist: every bill
// doctor: bills containing a line item attributed to one of their consultations
// ---------------------------------------------------------------
router.get('/bills', requireRole('admin', 'receptionist', 'doctor', 'pharmacist'), async (req, res) => {
  let sql;
  const params = [];
  if (req.user.role === 'doctor') {
    // Doctors only see bills that have already been paid AND that contain
    // a line item attributed to one of their consultations (= "their" patients).
    sql = `
      SELECT DISTINCT b.*, p.patient_number, p.first_name AS pf, p.last_name AS pl
        FROM bills b
        JOIN patients p ON p.id = b.patient_id
        JOIN bill_items bi ON bi.bill_id = b.id
        JOIN consultations c ON c.id = bi.consultation_id
       WHERE c.doctor_id = ?
         AND b.status = 'paid'
       ORDER BY b.paid_at DESC, b.created_at DESC LIMIT 200`;
    params.push(req.user.id);
  } else {
    sql = `
      SELECT b.*, p.patient_number, p.first_name AS pf, p.last_name AS pl
        FROM bills b
        JOIN patients p ON p.id = b.patient_id
       ORDER BY b.created_at DESC LIMIT 200`;
  }
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// ---------------------------------------------------------------
// READ — single bill with items
// ---------------------------------------------------------------
router.get('/bills/:id', requireRole('admin', 'receptionist', 'doctor', 'pharmacist'), async (req, res) => {
  const id = num(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid bill id' });
  const [bills] = await pool.query(
    `SELECT b.*, p.patient_number, p.first_name AS pf, p.last_name AS pl
       FROM bills b JOIN patients p ON p.id = b.patient_id WHERE b.id = ?`,
    [id]
  );
  const bill = bills[0];
  if (!bill) return res.status(404).json({ error: 'Bill not found' });
  const [items] = await pool.query('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id', [id]);
  res.json({ ...bill, items });
});

router.get('/bills/:id/items', requireRole('admin', 'receptionist', 'doctor', 'pharmacist'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id', [req.params.id]);
  res.json(rows);
});

// Server-rendered, print-ready invoice. The client opens this URL in a new
// tab; the user clicks browser Print and gets a PDF or paper copy.
router.get('/bills/:id/invoice.html', requireRole('admin', 'receptionist', 'doctor', 'pharmacist'), async (req, res) => {
  const id = num(req.params.id);
  if (!id) return res.status(400).send('Invalid bill id');
  const [bills] = await pool.query(
    `SELECT b.*, p.patient_number, p.first_name AS pf, p.last_name AS pl, p.phone, p.email, p.address,
            u.first_name AS uf, u.last_name AS ul
       FROM bills b
       JOIN patients p ON p.id = b.patient_id
       LEFT JOIN users u ON u.id = b.created_by
      WHERE b.id = ?`,
    [id]
  );
  const bill = bills[0];
  if (!bill) return res.status(404).send('Bill not found');
  const [items] = await pool.query('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id', [id]);
  const subtotal = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_price), 0);
  const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;
  const escape = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const created = new Date(bill.created_at).toLocaleString();
  const paidAt = bill.paid_at ? new Date(bill.paid_at).toLocaleString() : null;

  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escape(bill.bill_number)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, sans-serif; margin: 0; padding: 32px; color: #0f172a; }
    .actions { margin-bottom: 24px; display: flex; gap: 8px; }
    .actions button { padding: 8px 14px; border-radius: 6px; border: 1px solid #1e4a7d; background: #1e4a7d; color: white; font-weight: 600; cursor: pointer; }
    .actions button.secondary { background: white; color: #1e4a7d; }
    @media print { .actions { display: none; } body { padding: 0; } }
    h1 { margin: 0 0 4px 0; font-size: 28px; }
    .muted { color: #64748b; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
    .meta h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin: 0 0 6px 0; }
    .meta p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 28px; }
    th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; border-bottom: 2px solid #cbd5e1; padding: 10px 8px; }
    td { padding: 12px 8px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    td.right, th.right { text-align: right; }
    .totals { margin-top: 16px; margin-left: auto; width: 280px; }
    .totals div { display: flex; justify-content: space-between; padding: 6px 8px; font-size: 14px; }
    .totals div.grand { border-top: 2px solid #0f172a; margin-top: 6px; font-weight: 700; font-size: 16px; }
    .badge { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .badge.paid { background: #d1fae5; color: #064e3b; }
    .badge.pending { background: #fef3c7; color: #92400e; }
    .badge.void { background: #e2e8f0; color: #334155; }
    .badge.draft { background: #fef3c7; color: #92400e; }
  </style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">Print / Save as PDF</button>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>

  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
    <div>
      <h1>Invoice</h1>
      <p class="muted">Metropolitan General Hospital</p>
    </div>
    <div style="text-align: right;">
      <div style="font-family: monospace; font-size: 16px; font-weight: 700;">${escape(bill.bill_number)}</div>
      <div class="muted" style="font-size: 12px;">Issued ${escape(created)}</div>
      <div style="margin-top: 6px;"><span class="badge ${escape(bill.status)}">${escape(bill.status)}</span></div>
      ${paidAt ? `<div class="muted" style="font-size: 12px; margin-top: 4px;">Paid ${escape(paidAt)}</div>` : ''}
    </div>
  </div>

  <div class="meta">
    <div>
      <h2>Bill to</h2>
      <p style="font-weight: 600;">${escape(bill.pf)} ${escape(bill.pl)}</p>
      <p class="muted">MRN ${escape(bill.patient_number)}</p>
      ${bill.phone ? `<p class="muted">${escape(bill.phone)}</p>` : ''}
      ${bill.email ? `<p class="muted">${escape(bill.email)}</p>` : ''}
      ${bill.address ? `<p class="muted">${escape(bill.address)}</p>` : ''}
    </div>
    <div>
      <h2>Issued by</h2>
      <p>${bill.uf ? `${escape(bill.uf)} ${escape(bill.ul)}` : 'Hospital billing'}</p>
      ${bill.notes ? `<p class="muted">${escape(bill.notes)}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="right">Qty</th>
        <th class="right">Unit price</th>
        <th class="right">Line total</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((it) => `
        <tr>
          <td>${escape(it.description)}</td>
          <td class="right">${escape(it.quantity)}</td>
          <td class="right">${fmt(it.unit_price)}</td>
          <td class="right">${fmt(Number(it.quantity) * Number(it.unit_price))}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
    <div><span>Tax</span><span>${fmt(bill.tax_amount)}</span></div>
    <div class="grand"><span>Total</span><span>${fmt(bill.total_amount)}</span></div>
  </div>

  <p class="muted" style="margin-top: 48px; font-size: 11px;">Thank you. Please retain this invoice for your records.</p>
</body>
</html>`);
});

// ---------------------------------------------------------------
// READ — physician revenue summary (totals + counts)
// ---------------------------------------------------------------
router.get('/billing/doctor/summary', requireRole('admin', 'doctor'), async (req, res) => {
  const doctorId = req.user.role === 'doctor' ? req.user.id : num(req.query.doctorId);
  if (!doctorId) return res.status(400).json({ error: 'doctorId required' });
  const [[totals]] = await pool.query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN b.status IN ('pending','draft') THEN bi.quantity * bi.unit_price ELSE 0 END), 0) AS open_amount,
      COALESCE(SUM(CASE WHEN b.status = 'paid' THEN bi.quantity * bi.unit_price ELSE 0 END), 0) AS paid_amount,
      COALESCE(SUM(CASE WHEN b.status = 'paid' AND b.paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
                        THEN bi.quantity * bi.unit_price ELSE 0 END), 0) AS paid_this_month
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    JOIN consultations c ON c.id = bi.consultation_id
    WHERE c.doctor_id = ?
    `,
    [doctorId]
  );

  const [[counts]] = await pool.query(
    `
    SELECT COUNT(DISTINCT c.id) AS consultations_billed, COUNT(DISTINCT b.id) AS bills_touched
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    JOIN consultations c ON c.id = bi.consultation_id
    WHERE c.doctor_id = ?
    `,
    [doctorId]
  );

  res.json({ ...totals, ...counts });
});

router.get('/billing/doctor/encounters', requireRole('admin', 'doctor'), async (req, res) => {
  const doctorId = req.user.role === 'doctor' ? req.user.id : num(req.query.doctorId);
  if (!doctorId) return res.status(400).json({ error: 'doctorId required' });
  const limit = Math.min(num(req.query.limit) || 200, 500);
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

// ---------------------------------------------------------------
// CREATE — invoice
// admin/receptionist may bill any patient; doctors may bill their
// patients (with optional consultationId association).
// ---------------------------------------------------------------
router.post('/bills', requireRole('admin', 'receptionist', 'doctor'), async (req, res) => {
  const b = req.body || {};
  const patientId = num(b.patientId);
  if (!patientId) return res.status(400).json({ error: 'patientId required' });

  const items = normaliseItems(b.items);
  if (!items.length) {
    return res.status(400).json({ error: 'At least one valid line item (description + price) is required' });
  }
  if (items.some((it) => it.unitPrice < 0)) {
    return res.status(400).json({ error: 'Unit prices must be non-negative' });
  }

  const [[patient]] = await pool.query('SELECT id FROM patients WHERE id = ?', [patientId]);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const status = ALLOWED_STATUSES.includes(b.status) ? b.status : 'pending';
  const { subtotal, tax, total } = computeTotals(items, b.taxAmount);

  // Bill-level fallback associations (used if a line-item didn't carry its own).
  const fallbackConsultationId = num(b.consultationId);
  const fallbackAppointmentId = num(b.appointmentId);

  const billNumber = await nextBillNumber();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.execute(
      `INSERT INTO bills (patient_id, bill_number, total_amount, tax_amount, status, notes, created_by, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId,
        billNumber,
        total,
        tax,
        status,
        b.notes ? String(b.notes).slice(0, 4000) : null,
        req.user.id,
        status === 'paid' ? new Date() : null,
      ]
    );
    const billId = r.insertId;

    for (const it of items) {
      await conn.execute(
        `INSERT INTO bill_items (bill_id, description, quantity, unit_price, consultation_id, appointment_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          billId,
          it.description.slice(0, 255),
          it.quantity,
          it.unitPrice,
          it.consultationId ?? fallbackConsultationId,
          it.appointmentId ?? fallbackAppointmentId,
        ]
      );
    }
    await conn.commit();
    await audit(req, 'create', 'bill', billId, { billNumber, subtotal, tax, total, status });
    res.status(201).json({
      id: billId,
      billNumber,
      subtotal,
      tax,
      totalAmount: total,
      total,
      status,
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// ---------------------------------------------------------------
// UPDATE — change status (mark paid / void), edit notes, replace items.
// Setting status to 'paid' stamps paid_at; moving away from 'paid' clears it.
// ---------------------------------------------------------------
router.patch('/bills/:id', requireRole('admin', 'receptionist'), async (req, res) => {
  const id = num(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid bill id' });
  const b = req.body || {};

  const [[existing]] = await pool.query(
    'SELECT id, status, total_amount, tax_amount FROM bills WHERE id = ?',
    [id]
  );
  if (!existing) return res.status(404).json({ error: 'Bill not found' });

  const nextStatus = ALLOWED_STATUSES.includes(b.status) ? b.status : existing.status;

  let total = round2(existing.total_amount);
  let tax = round2(existing.tax_amount);
  let replaceItems = null;

  if (Array.isArray(b.items)) {
    const items = normaliseItems(b.items);
    if (!items.length) {
      return res.status(400).json({ error: 'A bill must keep at least one valid line item' });
    }
    const computed = computeTotals(items, b.taxAmount);
    tax = computed.tax;
    total = computed.total;
    replaceItems = items;
  } else if (b.taxAmount !== undefined && b.taxAmount !== null && b.taxAmount !== '') {
    const subtotal = round2(total - tax);
    tax = round2(num(b.taxAmount) || 0);
    total = round2(subtotal + tax);
  }

  // paid_at: stamp on transition into 'paid', clear on transition out of 'paid'.
  let paidAt;
  if (nextStatus === 'paid') {
    paidAt = new Date();
  } else if (existing.status === 'paid' && nextStatus !== 'paid') {
    paidAt = null;
  } else {
    paidAt = undefined; // leave unchanged
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (replaceItems) {
      await conn.execute('DELETE FROM bill_items WHERE bill_id = ?', [id]);
      for (const it of replaceItems) {
        await conn.execute(
          `INSERT INTO bill_items (bill_id, description, quantity, unit_price, consultation_id, appointment_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, it.description.slice(0, 255), it.quantity, it.unitPrice, it.consultationId, it.appointmentId]
        );
      }
    }

    if (paidAt === undefined) {
      await conn.execute(
        `UPDATE bills
            SET status = ?,
                notes = COALESCE(?, notes),
                total_amount = ?,
                tax_amount = ?
          WHERE id = ?`,
        [nextStatus, b.notes ?? null, total, tax, id]
      );
    } else {
      await conn.execute(
        `UPDATE bills
            SET status = ?,
                notes = COALESCE(?, notes),
                total_amount = ?,
                tax_amount = ?,
                paid_at = ?
          WHERE id = ?`,
        [nextStatus, b.notes ?? null, total, tax, paidAt, id]
      );
    }

    await conn.commit();
    await audit(req, 'update', 'bill', id, { from: existing.status, to: nextStatus, total, tax });
    res.json({ ok: true, id, status: nextStatus, total, tax });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// ---------------------------------------------------------------
// DELETE — admin only (cascades to bill_items) Authorized access
// ---------------------------------------------------------------
router.delete('/bills/:id', requireRole('admin'), async (req, res) => {
  const id = num(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid bill id' });
  const [r] = await pool.execute('DELETE FROM bills WHERE id = ?', [id]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Bill not found' });
  await audit(req, 'delete', 'bill', id);
  res.json({ ok: true });
});
export default router;
