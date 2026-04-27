import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import { nextPatientNumber } from '../utils/numbers.js';

const router = Router();
router.use(authenticate);

router.get('/assigned', requireRole('doctor'), async (req, res) => {
  const q = (req.query.q || '').trim();
  let sql = `
    SELECT DISTINCT p.id, p.patient_number, p.first_name, p.last_name, p.date_of_birth, p.gender, p.phone, p.email, p.created_at
      FROM patients p
      JOIN appointments a ON a.patient_id = p.id
     WHERE a.doctor_id = ?`;
  const params = [req.user.id];
  if (q) {
    sql += ` AND (p.patient_number LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ? OR p.phone LIKE ?)`;
    const term = `%${q}%`;
    params.push(term, term, term, term);
  }
  sql += ` ORDER BY p.last_name, p.first_name LIMIT 200`;
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

router.get('/', requireRole('admin', 'doctor', 'receptionist', 'pharmacist', 'lab'), async (req, res) => {
  const q = (req.query.q || '').trim();
  let sql = `SELECT id, patient_number, first_name, last_name, date_of_birth, gender, phone, email, created_at FROM patients`;
  const params = [];
  if (q) {
    sql += ` WHERE patient_number LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?`;
    const term = `%${q}%`;
    params.push(term, term, term, term);
  }
  sql += ` ORDER BY created_at DESC LIMIT 200`;
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

router.get('/:id/history', requireRole('admin', 'doctor', 'receptionist', 'pharmacist', 'lab'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid patient id' });
  const [cons] = await pool.query(
    `SELECT c.*, u.first_name AS doctor_first, u.last_name AS doctor_last
     FROM consultations c JOIN users u ON u.id = c.doctor_id WHERE c.patient_id = ? ORDER BY c.created_at DESC`,
    [id]
  );
  const [labs] = await pool.query(
    `SELECT lo.*, u.first_name AS ordered_by_first, u.last_name AS ordered_by_last
     FROM lab_orders lo JOIN users u ON u.id = lo.ordered_by WHERE lo.patient_id = ? ORDER BY lo.ordered_at DESC`,
    [id]
  );
  const [rx] = await pool.query(
    `SELECT pr.*, u.first_name AS rx_first, u.last_name AS rx_last
     FROM prescriptions pr JOIN users u ON u.id = pr.prescribed_by WHERE pr.patient_id = ? ORDER BY pr.created_at DESC`,
    [id]
  );
  const [appts] = await pool.query(
    `SELECT a.*, u.first_name AS doc_first, u.last_name AS doc_last
     FROM appointments a JOIN users u ON u.id = a.doctor_id WHERE a.patient_id = ? ORDER BY a.scheduled_at DESC LIMIT 100`,
    [id]
  );
  res.json({ consultations: cons, labOrders: labs, prescriptions: rx, appointments: appts });
});

router.get('/:id', requireRole('admin', 'doctor', 'receptionist', 'pharmacist', 'lab'), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM patients WHERE id = ?', [req.params.id]);
  const p = rows[0];
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  res.json(p);
});

router.post('/', requireRole('admin', 'receptionist'), async (req, res) => {
  const b = req.body || {};
  const patientNumber = await nextPatientNumber();
  const [result] = await pool.execute(
    `INSERT INTO patients (patient_number, first_name, last_name, date_of_birth, gender, phone, email, address,
      blood_group, emergency_contact_name, emergency_contact_phone, insurance_provider, insurance_policy_number, insurance_group_number, registered_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      patientNumber,
      b.firstName,
      b.lastName,
      b.dateOfBirth,
      b.gender || 'unknown',
      b.phone || null,
      b.email || null,
      b.address || null,
      b.bloodGroup || null,
      b.emergencyContactName || null,
      b.emergencyContactPhone || null,
      b.insuranceProvider || null,
      b.insurancePolicyNumber || null,
      b.insuranceGroupNumber || null,
      req.user.id,
    ]
  );
  await audit(req, 'create', 'patient', result.insertId, { patientNumber });
  res.status(201).json({ id: result.insertId, patientNumber });
});

router.patch('/:id', requireRole('admin', 'receptionist'), async (req, res) => {
  const b = req.body || {};
  await pool.execute(
    `UPDATE patients SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name),
      date_of_birth = COALESCE(?, date_of_birth), gender = COALESCE(?, gender), phone = COALESCE(?, phone),
      email = COALESCE(?, email), address = COALESCE(?, address), blood_group = COALESCE(?, blood_group),
      emergency_contact_name = COALESCE(?, emergency_contact_name), emergency_contact_phone = COALESCE(?, emergency_contact_phone),
      insurance_provider = COALESCE(?, insurance_provider), insurance_policy_number = COALESCE(?, insurance_policy_number),
      insurance_group_number = COALESCE(?, insurance_group_number)
     WHERE id = ?`,
    [
      b.firstName ?? null,
      b.lastName ?? null,
      b.dateOfBirth ?? null,
      b.gender ?? null,
      b.phone ?? null,
      b.email ?? null,
      b.address ?? null,
      b.bloodGroup ?? null,
      b.emergencyContactName ?? null,
      b.emergencyContactPhone ?? null,
      b.insuranceProvider ?? null,
      b.insurancePolicyNumber ?? null,
      b.insuranceGroupNumber ?? null,
      req.params.id,
    ]
  );
  await audit(req, 'update', 'patient', req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  await pool.execute('DELETE FROM patients WHERE id = ?', [req.params.id]);
  await audit(req, 'delete', 'patient', req.params.id);
  res.json({ ok: true });
});

export default router;
