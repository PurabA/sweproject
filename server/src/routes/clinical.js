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
// 1. Get all prescriptions (General list for Pharmacists & Admins)
router.get('/prescriptions', requireRole('admin', 'doctor', 'pharmacist', 'receptionist'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT pr.*, p.patient_number, p.first_name AS pf, p.last_name AS pl,
            u.first_name AS df, u.last_name AS dl
     FROM prescriptions pr 
     JOIN patients p ON p.id = pr.patient_id 
     JOIN users u ON u.id = pr.doctor_id
     ORDER BY pr.created_at DESC LIMIT 300`
  );
  res.json(rows);
});

// 2. Get specific prescription details (Header + Items)
router.get('/prescriptions/:id', requireRole('admin', 'doctor', 'pharmacist', 'receptionist'), async (req, res) => {
  // Fetch the parent prescription header
  const [presc] = await pool.query(
    `SELECT pr.*, p.patient_number, p.first_name AS pf, p.last_name AS pl,
            u.first_name AS df, u.last_name AS dl
     FROM prescriptions pr 
     JOIN patients p ON p.id = pr.patient_id
     JOIN users u ON u.id = pr.doctor_id
     WHERE pr.id = ?`, 
    [req.params.id]
  );
  
  if (!presc.length) return res.status(404).json({ error: 'Prescription not found' });

  // Fetch the child items (the specific drugs)
  const [items] = await pool.query(
    `SELECT pi.*, i.name as medicine_name 
     FROM prescription_items pi
     LEFT JOIN inventory i ON i.id = pi.medicine_id
     WHERE pi.prescription_id = ?`, 
    [req.params.id]
  );
  
  res.json({ ...presc[0], items });
});

// 3. Get all prescriptions for a specific patient
router.get('/prescriptions/patient/:patientId', requireRole('admin', 'doctor', 'pharmacist'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT pr.*, u.first_name AS df, u.last_name AS dl
     FROM prescriptions pr 
     JOIN users u ON u.id = pr.doctor_id
     WHERE pr.patient_id = ? 
     ORDER BY pr.created_at DESC`,
    [req.params.patientId]
  );
  res.json(rows);
});

// 4. Get audit logs for a specific prescription (only admins should see the full lifecycle audit trail)
router.get('/prescriptions/:id/audit', requireRole('admin'), async (req, res) => {
  const [logs] = await pool.query(
    `SELECT a.*, u.first_name, u.last_name, u.role 
     FROM audit_logs a
     JOIN users u ON u.id = a.user_id
     WHERE a.entity = 'prescription' AND a.entity_id = ?
     ORDER BY a.created_at ASC`,
    [req.params.id]
  );
  res.json(logs);
});

// insert into prescriptions database transaction
router.post('/prescriptions', requireRole('admin', 'doctor'), async (req, res) => {
  const b = req.body || {};
  const prescribedBy = req.user.role === 'doctor' ? req.user.id : b.prescribedBy;
  const items = b.items || []; // Array of { medicineId, dosage, frequency, duration, quantity }

  if (!items.length) {
    return res.status(400).json({ error: 'A prescription must contain at least one item.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Validate Inventory
    for (const item of items) {
      const [stock] = await conn.query('SELECT stock_quantity FROM inventory WHERE id = ?', [item.medicineId]);
      if (!stock.length || stock[0].stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for medicine ID ${item.medicineId}`);
      }
    }

    // 2. Insert Parent Prescription
    const [prescResult] = await conn.execute(
      `INSERT INTO prescriptions (consultation_id, patient_id, doctor_id, status, notes)
       VALUES (?, ?, ?, 'ACTIVE', ?)`,
      [b.consultationId, b.patientId, prescribedBy, b.notes || null]
    );
    const prescriptionId = prescResult.insertId;

    // 3. Insert Child Items
    for (const item of items) {
      await conn.execute(
        `INSERT INTO prescription_items (prescription_id, medicine_id, dosage, frequency, duration_days, quantity, special_instructions)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          prescriptionId, 
          item.medicineId, 
          item.dosage, 
          item.frequency, 
          item.duration, 
          item.quantity, 
          item.specialInstructions || null
        ]
      );
    }

    await conn.commit();
    await audit(req, 'create', 'prescription', prescriptionId);
    res.status(201).json({ id: prescriptionId, status: 'ACTIVE' });

  } catch (e) {
    await conn.rollback();
    // Return 422 Unprocessable Entity for inventory failures as per UML
    res.status(422).json({ error: e.message }); 
  } finally {
    conn.release();
  }
});

// The Update Route
router.patch('/prescriptions/:id', requireRole('doctor'), async (req, res) => {
  const b = req.body || {};
  
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Verify it is still active
    const [current] = await conn.query('SELECT status, doctor_id FROM prescriptions WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!current.length || current[0].status !== 'ACTIVE') {
      throw new Error('Only ACTIVE prescriptions can be updated.');
    }
    
    // 2. Ensure only the prescribing doctor updates it
    if (current[0].doctor_id !== req.user.id) {
       throw new Error('You can only update your own prescriptions.');
    }

    // 3. Update the parent prescription (e.g., general notes)
    await conn.execute(
      `UPDATE prescriptions SET notes = COALESCE(?, notes) WHERE id = ?`,
      [b.notes ?? null, req.params.id]
    );

    // 4. Update the items (handle multi-drug updates by deleting the old items and inserting the new ones)
    if (b.items && b.items.length > 0) {
      await conn.execute(`DELETE FROM prescription_items WHERE prescription_id = ?`, [req.params.id]);
      
      for (const item of b.items) {
        await conn.execute(
          `INSERT INTO prescription_items (prescription_id, medicine_id, dosage, frequency, duration_days, quantity, special_instructions)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [req.params.id, item.medicineId, item.dosage, item.frequency, item.duration, item.quantity, item.specialInstructions || null]
        );
      }
    }

    await conn.commit();
    await audit(req, 'update', 'prescription', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// The Revoke Route (Doctor/Admin)
router.patch('/prescriptions/:id/revoke', requireRole('admin', 'doctor'), async (req, res) => {
  const [current] = await pool.query('SELECT doctor_id, status FROM prescriptions WHERE id = ?', [req.params.id]);
  
  if (!current.length || current[0].status !== 'ACTIVE') {
     return res.status(400).json({ error: 'Only ACTIVE prescriptions can be revoked.' });
  }
  
  if (req.user.role === 'doctor' && current[0].doctor_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only revoke your own prescriptions.' });
  }

  await pool.execute(
    `UPDATE prescriptions SET status = 'REVOKED', revoked_by = ?, revoked_at = NOW() WHERE id = ?`,
    [req.user.id, req.params.id]
  );
  
  await audit(req, 'update', 'prescription', req.params.id, { action: 'REVOKE' });
  res.json({ ok: true });
});

// The Dispense Route (Pharmacist)
router.patch('/prescriptions/:id/dispense', requireRole('pharmacist'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [current] = await conn.query('SELECT status FROM prescriptions WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!current.length || current[0].status !== 'ACTIVE') {
      throw new Error('Prescription is not ACTIVE.');
    }

    // 1. Update status
    await conn.execute(`UPDATE prescriptions SET status = 'DISPENSED' WHERE id = ?`, [req.params.id]);

    // 2. Decrement Inventory Stock
    const [items] = await conn.query('SELECT medicine_id, quantity FROM prescription_items WHERE prescription_id = ?', [req.params.id]);
    for (const item of items) {
       await conn.execute('UPDATE inventory SET stock_quantity = stock_quantity - ? WHERE id = ?', [item.quantity, item.medicine_id]);
    }

    await conn.commit();
    await audit(req, 'update', 'prescription', req.params.id, { action: 'DISPENSE' });
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: e.message });
  } finally {
    conn.release();
  }
});

export default router;
