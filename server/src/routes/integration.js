import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

const router = Router();
router.use(authenticate);

/** Insurance provider stub — stores mock API response */
router.post('/insurance/claims', requireRole('admin', 'receptionist'), async (req, res) => {
  const b = req.body || {};
  const mockResponse = {
    requestId: `INS-${Date.now()}`,
    status: 'pending_review',
    message: 'Claim received by stub provider API',
    estimatedProcessingDays: 14,
  };
  const [r] = await pool.execute(
    `INSERT INTO insurance_claims (patient_id, bill_id, external_reference, provider_name, claim_amount, status, raw_response)
     VALUES (?, ?, ?, ?, ?, 'submitted', ?)`,
    [
      b.patientId,
      b.billId || null,
      mockResponse.requestId,
      b.providerName || 'Default Payer',
      b.claimAmount,
      JSON.stringify(mockResponse),
    ]
  );
  await audit(req, 'insurance_submit', 'insurance_claim', r.insertId);
  res.status(201).json({ id: r.insertId, providerResponse: mockResponse });
});

router.get('/insurance/claims', requireRole('admin', 'receptionist', 'doctor'), async (_req, res) => {
  const [rows] = await pool.query(`SELECT ic.*, p.patient_number FROM insurance_claims ic JOIN patients p ON p.id = ic.patient_id ORDER BY ic.created_at DESC`);
  res.json(rows);
});

router.get('/telemedicine', requireRole('admin', 'doctor', 'receptionist'), async (req, res) => {
  let sql = `SELECT t.*, p.patient_number, p.first_name AS pf, p.last_name AS pl FROM telemedicine_sessions t
    JOIN patients p ON p.id = t.patient_id`;
  const params = [];
  if (req.user.role === 'doctor') {
    sql += ' WHERE t.doctor_id = ?';
    params.push(req.user.id);
  }
  sql += ' ORDER BY t.scheduled_at DESC';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

router.post('/telemedicine', requireRole('admin', 'doctor', 'receptionist'), async (req, res) => {
  const b = req.body || {};
  const doctorId = req.user.role === 'doctor' ? req.user.id : b.doctorId;
  if (!doctorId) return res.status(400).json({ error: 'doctorId required' });
  const url = b.meetingUrl || `https://meet.jit.si/hmis-${Date.now()}`;
  const [r] = await pool.execute(
    `INSERT INTO telemedicine_sessions (patient_id, doctor_id, scheduled_at, meeting_url, status, notes)
     VALUES (?, ?, ?, ?, 'scheduled', ?)`,
    [b.patientId, doctorId, b.scheduledAt, url, b.notes || null]
  );
  await audit(req, 'create', 'telemedicine', r.insertId);
  res.status(201).json({ id: r.insertId, meetingUrl: url });
});

router.patch('/telemedicine/:id', requireRole('admin', 'doctor', 'receptionist'), async (req, res) => {
  const b = req.body || {};
  if (req.user.role === 'doctor') {
    const [t] = await pool.query('SELECT doctor_id FROM telemedicine_sessions WHERE id = ?', [req.params.id]);
    if (!t[0] || t[0].doctor_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  }
  await pool.execute(
    `UPDATE telemedicine_sessions SET status = COALESCE(?, status), meeting_url = COALESCE(?, meeting_url), notes = COALESCE(?, notes) WHERE id = ?`,
    [b.status ?? null, b.meetingUrl ?? null, b.notes ?? null, req.params.id]
  );
  res.json({ ok: true });
});

export default router;
