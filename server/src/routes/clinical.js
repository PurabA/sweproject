import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { nextBillNumber } from '../utils/numbers.js';

const router = Router();
router.use(authenticate);

const CONSULTATION_FEE = 300.0; // ₹
const SURGERY_FEE = 2000.0; // ₹
const TAX_RATE = 0.0; // No GST applied to clinical services in this build
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const LAB_PRIORITIES = new Set(['routine', 'urgent', 'stat']);

// --- Consultations ---

// Scheduled appointments dropdown for the consultation form.
// Doctors see only their own scheduled appointments.
// Admins/receptionists see every scheduled appointment.
router.get('/consultations/scheduled-appointments', requireRole('admin', 'doctor', 'receptionist'), async (req, res) => {
  let sql = `
    SELECT a.id, a.scheduled_at, a.reason, a.visit_type,
           p.id AS patient_id, p.patient_number, p.first_name AS pf, p.last_name AS pl,
           u.id AS doctor_id, u.first_name AS df, u.last_name AS dl
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      JOIN users u ON u.id = a.doctor_id
     WHERE a.status = 'scheduled'`;
  const params = [];
  if (req.user.role === 'doctor') {
    sql += ' AND a.doctor_id = ?';
    params.push(req.user.id);
  }
  sql += ' ORDER BY a.scheduled_at ASC LIMIT 200';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

router.get('/consultations', requireRole('admin', 'doctor', 'receptionist', 'pharmacist', 'lab'), async (req, res) => {
  let sql = `
    SELECT c.*, p.patient_number, p.first_name AS pf, p.last_name AS pl,
           u.first_name AS df, u.last_name AS dl
    FROM consultations c
    JOIN patients p ON p.id = c.patient_id
    JOIN users u ON u.id = c.doctor_id`;
  const params = [];
  if (req.user.role === 'doctor') {
    sql += ' WHERE c.doctor_id = ?';
    params.push(req.user.id);
  }
  sql += ' ORDER BY c.created_at DESC LIMIT 200';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

router.post('/consultations', requireRole('admin', 'doctor'), async (req, res) => {
  const b = req.body || {};
  let doctorId = req.user.role === 'doctor' ? req.user.id : (b.doctorId ? Number(b.doctorId) : null);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Resolve the appointment.  If the caller passed appointmentId, use it
    //    after verifying it belongs to this doctor + patient + is still scheduled.
    //    Otherwise, fall back to the most recent scheduled appointment for that pair.
    let appointmentId = b.appointmentId ? Number(b.appointmentId) : null;
    let patientId = b.patientId ? Number(b.patientId) : null;

    if (appointmentId) {
      const [[appt]] = await conn.query(
        `SELECT id, patient_id, doctor_id, status FROM appointments WHERE id = ?`,
        [appointmentId]
      );
      if (!appt) {
        await conn.rollback();
        return res.status(404).json({ error: 'Appointment not found' });
      }
      if (appt.status !== 'scheduled') {
        await conn.rollback();
        return res.status(400).json({ error: 'Appointment is no longer scheduled' });
      }
      if (req.user.role === 'doctor' && appt.doctor_id !== req.user.id) {
        await conn.rollback();
        return res.status(403).json({ error: 'Not your appointment' });
      }
      patientId = appt.patient_id;
      doctorId = appt.doctor_id;
    } else if (patientId) {
      if (!doctorId) {
        await conn.rollback();
        return res.status(400).json({ error: 'doctorId required when no appointment is selected' });
      }
      const [[row]] = await conn.query(
        `SELECT id FROM appointments
          WHERE patient_id = ? AND doctor_id = ? AND status = 'scheduled'
          ORDER BY scheduled_at DESC
          LIMIT 1`,
        [patientId, doctorId]
      );
      appointmentId = row?.id || null;
    } else {
      await conn.rollback();
      return res.status(400).json({ error: 'patientId or appointmentId required' });
    }

    if (!doctorId) {
      await conn.rollback();
      return res.status(400).json({ error: 'doctorId required' });
    }

    // 2. Create the consultation.
    const [r] = await conn.execute(
      `INSERT INTO consultations (patient_id, doctor_id, appointment_id, chief_complaint, diagnosis, clinical_notes, triage_level)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId,
        doctorId,
        appointmentId,
        b.chiefComplaint || null,
        b.diagnosis || null,
        b.clinicalNotes || null,
        b.triageLevel || null,
      ]
    );
    const consultationId = r.insertId;

    // 3. Mark the appointment completed (it's now "done", not "scheduled" → drops out of the dropdown).
    if (appointmentId) {
      await conn.execute(
        `UPDATE appointments SET status = 'completed' WHERE id = ? AND status = 'scheduled'`,
        [appointmentId]
      );
    }

    // 4. Optional lab orders. They are linked to this consultation so the lab
    //    team sees them in its request queue immediately after sign-off.
    const labOrders = Array.isArray(b.labOrders)
      ? b.labOrders
          .map((lo) => ({
            testName: String(lo?.testName || '').trim(),
            priority: LAB_PRIORITIES.has(String(lo?.priority || '').trim()) ? String(lo.priority).trim() : 'routine',
          }))
          .filter((lo) => lo.testName.length > 0)
      : [];
    const labOrderIds = [];
    for (const lo of labOrders) {
      const [labResult] = await conn.execute(
        `INSERT INTO lab_orders (patient_id, ordered_by, consultation_id, test_name, priority, status)
         VALUES (?, ?, ?, ?, ?, 'ordered')`,
        [patientId, doctorId, consultationId, lo.testName.slice(0, 200), lo.priority]
      );
      labOrderIds.push(labResult.insertId);
    }

    // 5. Optional surgery request.
    let surgeryRequestId = null;
    const sr = b.surgeryRequest && typeof b.surgeryRequest === 'object' ? b.surgeryRequest : null;
    if (sr?.request === true) {
      const scheduledAt = String(sr.scheduledAt || '').trim();
      if (!scheduledAt) {
        await conn.rollback();
        return res.status(400).json({ error: 'surgeryRequest.scheduledAt required when requesting surgery' });
      }
      const icuRequired = sr.icuRequired !== false;
      const notes = sr.notes ? String(sr.notes) : null;
      const [ins] = await conn.execute(
        `INSERT INTO surgery_requests (consultation_id, patient_id, doctor_id, status, surgery_scheduled_at, surgery_notes, icu_required)
         VALUES (?, ?, ?, 'requested', ?, ?, ?)`,
        [consultationId, patientId, doctorId, scheduledAt, notes, icuRequired ? 1 : 0]
      );
      surgeryRequestId = ins.insertId;

      const [rec] = await conn.query(`SELECT id FROM users WHERE role = 'receptionist' AND is_active = 1 ORDER BY id`);
      const subject = `Surgery request (ICU booking needed)`;
      const body = [
        `Doctor: ${req.user?.email || doctorId}`,
        `Consultation ID: ${consultationId}`,
        `Patient ID: ${patientId}`,
        `Scheduled surgery time: ${scheduledAt}`,
        `ICU required: ${icuRequired ? 'yes' : 'no'}`,
        notes ? `Notes: ${notes}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      for (const u of rec) {
        await conn.execute(
          `INSERT INTO notifications (user_id, channel, subject, body)
           VALUES (?, 'in_app', ?, ?)`,
          [u.id, subject, body]
        );
      }
    }

    // 6. Auto-generate a pending bill for this consultation.  Line items are
    //    linked to the consultation so the doctor sees them on their billing
    //    view, and so the row appears in Accounts Receivable on the billing
    //    page until the receptionist/admin posts payment.
    //
    //    Default lines:
    //      • Appointment / consultation fee — ₹300
    //      • Surgery (only if the doctor requested one)         — ₹2000
    const lines = [
      { description: 'Consultation visit', quantity: 1, unitPrice: CONSULTATION_FEE },
    ];
    if (surgeryRequestId) {
      lines.push({ description: 'Surgery procedure (advance booking)', quantity: 1, unitPrice: SURGERY_FEE });
    }
    const subtotal = round2(lines.reduce((s, it) => s + it.quantity * it.unitPrice, 0));
    const tax = round2(subtotal * TAX_RATE);
    const total = round2(subtotal + tax);
    const billNumber = await nextBillNumber();
    const [billResult] = await conn.execute(
      `INSERT INTO bills (patient_id, bill_number, total_amount, tax_amount, status, notes, created_by)
       VALUES (?, ?, ?, ?, 'pending', 'Auto-generated at consultation sign-off', ?)`,
      [patientId, billNumber, total, tax, req.user.id]
    );
    const billId = billResult.insertId;
    for (const ln of lines) {
      await conn.execute(
        `INSERT INTO bill_items (bill_id, description, quantity, unit_price, consultation_id, appointment_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [billId, ln.description, ln.quantity, ln.unitPrice, consultationId, appointmentId]
      );
    }

    await conn.commit();
    await audit(req, 'create', 'consultation', consultationId, {
      appointmentId,
      labOrderIds,
      surgeryRequestId,
      autoBillId: billId,
      autoBillNumber: billNumber,
      total,
    });
    res.status(201).json({
      id: consultationId,
      appointmentId,
      labOrderIds,
      surgeryRequestId,
      bill: { id: billId, billNumber, total, status: 'pending' },
    });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.patch('/consultations/:id', requireRole('admin', 'doctor'), async (req, res) => {
  const b = req.body || {};
  if (req.user.role === 'doctor') {
    const [c] = await pool.query('SELECT doctor_id FROM consultations WHERE id = ?', [req.params.id]);
    if (!c[0] || c[0].doctor_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  }
  await pool.execute(
    `UPDATE consultations SET chief_complaint = COALESCE(?, chief_complaint), diagnosis = COALESCE(?, diagnosis),
      clinical_notes = COALESCE(?, clinical_notes), triage_level = COALESCE(?, triage_level) WHERE id = ?`,
    [
      b.chiefComplaint ?? null,
      b.diagnosis ?? null,
      b.clinicalNotes ?? null,
      b.triageLevel ?? null,
      req.params.id,
    ]
  );
  await audit(req, 'update', 'consultation', req.params.id);
  res.json({ ok: true });
});

// --- Lab orders ---
router.get('/lab-orders', requireRole('admin', 'doctor', 'receptionist', 'pharmacist', 'lab'), async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT lo.*, p.patient_number, p.first_name AS pf, p.last_name AS pl
     FROM lab_orders lo JOIN patients p ON p.id = lo.patient_id ORDER BY lo.ordered_at DESC LIMIT 300`
  );
  res.json(rows);
});

router.post('/lab-orders', requireRole('admin', 'doctor'), async (req, res) => {
  const b = req.body || {};
  const orderedBy = req.user.role === 'doctor' ? req.user.id : b.orderedBy;
  const [r] = await pool.execute(
    `INSERT INTO lab_orders (patient_id, ordered_by, consultation_id, test_name, priority, status)
     VALUES (?, ?, ?, ?, COALESCE(?, 'routine'), 'ordered')`,
    [b.patientId, orderedBy, b.consultationId || null, b.testName, b.priority || 'routine']
  );
  await audit(req, 'create', 'lab_order', r.insertId);
  res.status(201).json({ id: r.insertId });
});

router.patch('/lab-orders/:id', requireRole('admin', 'doctor', 'pharmacist', 'lab'), async (req, res) => {
  const b = req.body || {};
  const completedAt = b.status === 'completed' ? new Date() : null;
  await pool.execute(
    `UPDATE lab_orders SET status = COALESCE(?, status), priority = COALESCE(?, priority),
      result_notes = COALESCE(?, result_notes), completed_at = COALESCE(?, completed_at) WHERE id = ?`,
    [b.status ?? null, b.priority ?? null, b.resultNotes ?? null, completedAt, req.params.id]
  );
  await audit(req, 'update', 'lab_order', req.params.id);
  res.json({ ok: true });
});

// --- Prescriptions ---
router.get('/prescriptions', requireRole('admin', 'doctor', 'pharmacist'), async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT pr.*, p.patient_number, p.first_name AS pf, p.last_name AS pl
     FROM prescriptions pr JOIN patients p ON p.id = pr.patient_id ORDER BY pr.created_at DESC LIMIT 300`
  );
  res.json(rows);
});

router.post('/prescriptions', requireRole('admin', 'doctor'), async (req, res) => {
  const b = req.body || {};
  const prescribedBy = req.user.role === 'doctor' ? req.user.id : b.prescribedBy;
  const [r] = await pool.execute(
    `INSERT INTO prescriptions (consultation_id, patient_id, prescribed_by, medication_name, dosage, quantity, instructions, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [b.consultationId, b.patientId, prescribedBy, b.medicationName, b.dosage || null, b.quantity || 1, b.instructions || null]
  );
  await audit(req, 'create', 'prescription', r.insertId);
  res.status(201).json({ id: r.insertId });
});

router.patch('/prescriptions/:id', requireRole('admin', 'doctor', 'pharmacist'), async (req, res) => {
  const b = req.body || {};
  await pool.execute(
    `UPDATE prescriptions SET status = COALESCE(?, status), dosage = COALESCE(?, dosage), instructions = COALESCE(?, instructions)
     WHERE id = ?`,
    [b.status ?? null, b.dosage ?? null, b.instructions ?? null, req.params.id]
  );
  await audit(req, 'update', 'prescription', req.params.id);
  res.json({ ok: true });
});

export default router;
