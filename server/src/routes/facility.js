import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

const router = Router();
router.use(authenticate);

/** Rapid emergency encounter + optional ICU assignment (PDF Emergency Admission + Triage). */
router.post('/emergency-admissions', requireRole('admin', 'doctor', 'receptionist'), async (req, res) => {
  const b = req.body || {};
  if (!b.patientId || !b.chiefComplaint) {
    return res.status(400).json({ error: 'patientId and chiefComplaint required' });
  }
  const doctorId = req.user.role === 'doctor' ? req.user.id : b.doctorId;
  if (!doctorId) return res.status(400).json({ error: 'doctorId required when not a physician caller' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.execute(
      `INSERT INTO consultations (patient_id, doctor_id, chief_complaint, diagnosis, clinical_notes, triage_level)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        b.patientId,
        doctorId,
        b.chiefComplaint,
        b.diagnosis || 'Emergency — pending full evaluation',
        b.clinicalNotes || 'Created from emergency admission workflow.',
        b.triageLevel || 'urgent',
      ]
    );
    const consultationId = r.insertId;
    if (b.icuBedId) {
      await conn.execute(
        `UPDATE icu_beds SET status = 'occupied', patient_id = ?, notes = COALESCE(?, notes) WHERE id = ?`,
        [b.patientId, b.bedNotes || 'Emergency admission', b.icuBedId]
      );
    }
    await conn.commit();
    await audit(req, 'create', 'emergency_consultation', consultationId);
    res.status(201).json({ consultationId, icuBedUpdated: Boolean(b.icuBedId) });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.get('/icu-beds', requireRole('admin', 'doctor', 'receptionist'), async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT b.*, p.patient_number, p.first_name AS pf, p.last_name AS pl FROM icu_beds b
     LEFT JOIN patients p ON p.id = b.patient_id ORDER BY b.bed_code`
  );
  res.json(rows);
});

router.patch('/icu-beds/:id', requireRole('admin', 'doctor', 'receptionist'), async (req, res) => {
  const b = req.body || {};
  await pool.execute(
    `UPDATE icu_beds SET status = COALESCE(?, status), patient_id = COALESCE(?, patient_id), notes = COALESCE(?, notes) WHERE id = ?`,
    [b.status ?? null, b.patientId ?? null, b.notes ?? null, req.params.id]
  );
  await audit(req, 'update', 'icu_bed', req.params.id);
  res.json({ ok: true });
});

router.get('/emergency-team', requireRole('admin', 'doctor', 'receptionist'), async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM emergency_team ORDER BY name');
  res.json(rows);
});

router.get('/surgeries', requireRole('admin', 'doctor', 'receptionist'), async (req, res) => {
  const status = (req.query.status || '').trim();
  const upcoming = String(req.query.upcoming || '') === '1';
  let sql = `
    SELECT sr.*, p.patient_number, p.first_name AS pf, p.last_name AS pl,
           b.bed_code
      FROM surgery_requests sr
      JOIN patients p ON p.id = sr.patient_id
      LEFT JOIN icu_beds b ON b.id = sr.icu_bed_id
     WHERE 1=1`;
  const params = [];
  if (req.user.role === 'doctor') {
    sql += ' AND sr.doctor_id = ?';
    params.push(req.user.id);
  }
  if (status) {
    sql += ' AND sr.status = ?';
    params.push(status);
  }
  if (upcoming) {
    sql += ' AND sr.surgery_scheduled_at >= NOW()';
  }
  sql += ' ORDER BY sr.surgery_scheduled_at ASC LIMIT 300';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

router.patch('/surgeries/:id/book-icu', requireRole('admin', 'receptionist'), async (req, res) => {
  const id = Number(req.params.id);
  const icuBedId = Number(req.body?.icuBedId);
  if (!id || Number.isNaN(id) || !icuBedId || Number.isNaN(icuBedId)) {
    return res.status(400).json({ error: 'icuBedId required' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[sr]] = await conn.query(
      `SELECT * FROM surgery_requests WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!sr) return res.status(404).json({ error: 'Surgery request not found' });
    if (sr.status !== 'requested') return res.status(400).json({ error: 'Surgery request is not in requested state' });

    const [[bed]] = await conn.query(`SELECT * FROM icu_beds WHERE id = ? FOR UPDATE`, [icuBedId]);
    if (!bed) return res.status(404).json({ error: 'ICU bed not found' });
    if (bed.status !== 'available') return res.status(400).json({ error: 'ICU bed not available' });

    await conn.execute(
      `UPDATE icu_beds SET status = 'reserved', patient_id = ?, notes = COALESCE(notes, 'Reserved for upcoming surgery') WHERE id = ?`,
      [sr.patient_id, icuBedId]
    );

    await conn.execute(
      `UPDATE surgery_requests
          SET status = 'icu_booked', icu_bed_id = ?, booked_at = NOW(), booked_by = ?
        WHERE id = ?`,
      [icuBedId, req.user.id, id]
    );

    // Notify doctor
    const subject = `ICU booked for scheduled surgery`;
    const body = `Surgery request #${id} has ICU bed ${bed.bed_code} reserved. Scheduled: ${sr.surgery_scheduled_at}`;
    await conn.execute(
      `INSERT INTO notifications (user_id, channel, subject, body)
       VALUES (?, 'in_app', ?, ?)`,
      [sr.doctor_id, subject, body]
    );

    await conn.commit();
    await audit(req, 'icu_book', 'surgery_request', String(id), { icuBedId });
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

router.post('/emergency-team', requireRole('admin'), async (req, res) => {
  const b = req.body || {};
  const [r] = await pool.execute(
    `INSERT INTO emergency_team (name, role_title, phone, is_on_call, shift_notes) VALUES (?, ?, ?, ?, ?)`,
    [b.name, b.roleTitle, b.phone || null, b.isOnCall ? 1 : 0, b.shiftNotes || null]
  );
  await audit(req, 'create', 'emergency_team', r.insertId);
  res.status(201).json({ id: r.insertId });
});

router.patch('/emergency-team/:id', requireRole('admin'), async (req, res) => {
  const b = req.body || {};
  await pool.execute(
    `UPDATE emergency_team SET name = COALESCE(?, name), role_title = COALESCE(?, role_title),
      phone = COALESCE(?, phone), is_on_call = COALESCE(?, is_on_call), shift_notes = COALESCE(?, shift_notes) WHERE id = ?`,
    [b.name ?? null, b.roleTitle ?? null, b.phone ?? null, b.isOnCall != null ? (b.isOnCall ? 1 : 0) : null, b.shiftNotes ?? null, req.params.id]
  );
  await audit(req, 'update', 'emergency_team', req.params.id);
  res.json({ ok: true });
});

export default router;
