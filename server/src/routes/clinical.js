import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

const router = Router();
router.use(authenticate);

// --- Consultations ---
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
  const doctorId = req.user.role === 'doctor' ? req.user.id : b.doctorId;
  if (!doctorId) return res.status(400).json({ error: 'doctorId required' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let appointmentId = b.appointmentId || null;
    if (!appointmentId) {
      const [[row]] = await conn.query(
        `SELECT id FROM appointments
          WHERE patient_id = ? AND doctor_id = ? AND status = 'scheduled'
          ORDER BY scheduled_at DESC
          LIMIT 1`,
        [b.patientId, doctorId]
      );
      appointmentId = row?.id || null;
    }

    const [r] = await conn.execute(
      `INSERT INTO consultations (patient_id, doctor_id, appointment_id, chief_complaint, diagnosis, clinical_notes, triage_level)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        b.patientId,
        doctorId,
        appointmentId,
        b.chiefComplaint || null,
        b.diagnosis || null,
        b.clinicalNotes || null,
        b.triageLevel || null,
      ]
    );
    const consultationId = r.insertId;

    if (appointmentId) {
      await conn.execute(
        `UPDATE appointments
            SET status = 'completed'
          WHERE id = ? AND status = 'scheduled'`,
        [appointmentId]
      );
    }

    let surgeryRequestId = null;
    const sr = b.surgeryRequest && typeof b.surgeryRequest === 'object' ? b.surgeryRequest : null;
    if (sr?.request === true) {
      const scheduledAt = String(sr.scheduledAt || '').trim();
      if (!scheduledAt) {
        return res.status(400).json({ error: 'surgeryRequest.scheduledAt required when requesting surgery' });
      }
      const icuRequired = sr.icuRequired !== false;
      const notes = sr.notes ? String(sr.notes) : null;
      const [ins] = await conn.execute(
        `INSERT INTO surgery_requests (consultation_id, patient_id, doctor_id, status, surgery_scheduled_at, surgery_notes, icu_required)
         VALUES (?, ?, ?, 'requested', ?, ?, ?)`,
        [consultationId, b.patientId, doctorId, scheduledAt, notes, icuRequired ? 1 : 0]
      );
      surgeryRequestId = ins.insertId;

      // Notify receptionists so they can book ICU (and coordination).
      const [rec] = await conn.query(`SELECT id FROM users WHERE role = 'receptionist' AND is_active = 1 ORDER BY id`);
      const subject = `Surgery request (ICU booking needed)`;
      const body = [
        `Doctor: ${req.user?.email || doctorId}`,
        `Consultation ID: ${consultationId}`,
        `Patient ID: ${b.patientId}`,
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

    await conn.commit();
    await audit(req, 'create', 'consultation', consultationId, { appointmentId, surgeryRequestId });
    res.status(201).json({ id: consultationId, appointmentId, surgeryRequestId });
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
router.get('/lab-orders', requireRole('admin', 'doctor', 'receptionist', 'pharmacist', 'lab'), async (req, res) => {
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
router.get('/prescriptions', requireRole('admin', 'doctor', 'pharmacist'), async (req, res) => {
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
