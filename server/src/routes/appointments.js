import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

const router = Router();
router.use(authenticate);

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD HH:MM in server local time (matches clinic slot grid). */
function formatLocalSlot(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function dayBounds(dateStr) {
  const start = `${dateStr} 00:00:00`;
  const end = `${dateStr} 23:59:59`;
  return { start, end };
}

function normalizeScheduledInput(scheduledAt) {
  return String(scheduledAt).replace('T', ' ').trim();
}

function parseScheduledLocal(scheduledAt) {
  const s = normalizeScheduledInput(scheduledAt);
  const isoish = s.length <= 16 ? `${s.replace(' ', 'T')}:00` : s.replace(' ', 'T').slice(0, 19);
  return new Date(isoish);
}

/** Starts on the hour or half-hour, 08:00–16:30 inclusive. */
function isAlignedToPracticeGrid(d) {
  if (Number.isNaN(d.getTime())) return false;
  const h = d.getHours();
  const mi = d.getMinutes();
  const se = d.getSeconds();
  const ms = d.getMilliseconds();
  if (se !== 0 || ms !== 0) return false;
  if (mi !== 0 && mi !== 30) return false;
  if (h < 8 || h > 16) return false;
  if (h === 16 && mi === 30) return true;
  if (h === 16 && mi === 0) return true;
  if (h === 16) return false;
  return true;
}

function hasOverlap(slotStart, durationMins, booked) {
  const slotEnd = new Date(slotStart.getTime() + durationMins * 60 * 1000);
  return booked.some((row) => {
    const apStart = new Date(row.scheduled_at);
    const apEnd = new Date(apStart.getTime() + (Number(row.duration_minutes) || 30) * 60 * 1000);
    return slotStart < apEnd && slotEnd > apStart;
  });
}

/** Last appointment may end at 17:00. */
function extendsPastSessionEnd(slotStart, durationMins) {
  const slotEndMin = slotStart.getHours() * 60 + slotStart.getMinutes() + durationMins;
  return slotEndMin > 17 * 60;
}

async function fetchBookedForDay(pool, doctorId, dateStr, excludeAppointmentId) {
  const { start, end } = dayBounds(dateStr);
  let sql = `
    SELECT scheduled_at, duration_minutes FROM appointments
     WHERE doctor_id = ? AND status = 'scheduled' AND scheduled_at BETWEEN ? AND ?`;
  const params = [doctorId, start, end];
  if (excludeAppointmentId) {
    sql += ' AND id <> ?';
    params.push(excludeAppointmentId);
  }
  const [booked] = await pool.query(sql, params);
  return booked;
}

function computeSlotsAvailable(dateStr, booked) {
  const slots = [];
  for (let h = 8; h < 17; h++) {
    for (let m of [0, 30]) {
      const slotStart = new Date(`${dateStr}T${pad2(h)}:${m === 0 ? '00' : '30'}:00`);
      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
      const clash = booked.some((row) => {
        const apStart = new Date(row.scheduled_at);
        const apEnd = new Date(apStart.getTime() + (Number(row.duration_minutes) || 30) * 60 * 1000);
        return slotStart < apEnd && slotEnd > apStart;
      });
      if (!clash) {
        slots.push(formatLocalSlot(slotStart));
      }
    }
  }
  return slots;
}

async function requireBookableSlot(pool, { doctorId, scheduledAt, durationMinutes = 30, excludeAppointmentId }) {
  const normalized = normalizeScheduledInput(scheduledAt);
  const dateStr = normalized.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { ok: false, error: 'Invalid scheduled date' };
  }
  const slotStart = parseScheduledLocal(scheduledAt);
  if (Number.isNaN(slotStart.getTime())) {
    return { ok: false, error: 'Invalid scheduled time' };
  }
  if (!isAlignedToPracticeGrid(slotStart)) {
    return {
      ok: false,
      error: 'Appointments must start on the hour or half-hour between 08:00 and 16:30.',
    };
  }
  const dur = Number(durationMinutes) || 30;
  if (extendsPastSessionEnd(slotStart, dur)) {
    return { ok: false, error: 'Visit extends past clinic session end (17:00).' };
  }
  const booked = await fetchBookedForDay(pool, doctorId, dateStr, excludeAppointmentId);
  if (hasOverlap(slotStart, dur, booked)) {
    return { ok: false, error: 'Selected time is not an available slot for this physician.' };
  }
  return { ok: true };
}

/** Doctor availability — returns 30-minute slots without overlapping scheduled appointments. */
router.get('/availability', requireRole('admin', 'receptionist', 'doctor'), async (req, res) => {
  const doctorId = Number(req.query.doctorId);
  const dateStr = (req.query.date || '').trim();
  if (!doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return res.status(400).json({ error: 'doctorId and date (YYYY-MM-DD) required' });
  }
  try {
    const booked = await fetchBookedForDay(pool, doctorId, dateStr, null);
    const slots = computeSlotsAvailable(dateStr, booked);
    res.json({ doctorId, date: dateStr, slotsAvailable: slots });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Availability check failed' });
  }
});

router.get('/', requireRole('admin', 'doctor', 'receptionist', 'lab'), async (req, res) => {
  const doctorId = req.query.doctorId;
  let sql = `
    SELECT a.*, p.patient_number, p.first_name AS patient_first_name, p.last_name AS patient_last_name,
           u.first_name AS doc_first_name, u.last_name AS doc_last_name
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN users u ON u.id = a.doctor_id
    WHERE 1=1`;
  const params = [];
  if (doctorId) {
    sql += ' AND a.doctor_id = ?';
    params.push(doctorId);
  }
  if (req.user.role === 'doctor') {
    sql += ' AND a.doctor_id = ?';
    params.push(req.user.id);
  }
  sql += ' ORDER BY a.scheduled_at DESC LIMIT 300';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

router.post('/follow-up', requireRole('admin', 'receptionist', 'doctor'), async (req, res) => {
  const b = req.body || {};
  const doctorId = req.user.role === 'doctor' ? req.user.id : b.doctorId;
  if (!doctorId || !b.patientId || !b.scheduledAt || !b.parentAppointmentId) {
    return res.status(400).json({ error: 'patientId, doctorId (if not physician), scheduledAt, parentAppointmentId required' });
  }
  const durationMinutes = b.durationMinutes || 30;
  const slotCheck = await requireBookableSlot(pool, {
    doctorId,
    scheduledAt: b.scheduledAt,
    durationMinutes,
    excludeAppointmentId: null,
  });
  if (!slotCheck.ok) {
    return res.status(400).json({ error: slotCheck.error });
  }
  const [r] = await pool.execute(
    `INSERT INTO appointments (patient_id, doctor_id, scheduled_at, duration_minutes, status, reason, visit_type, rescheduled_from_id, created_by)
     VALUES (?, ?, ?, ?, 'scheduled', ?, 'follow_up', ?, ?)`,
    [
      b.patientId,
      doctorId,
      String(b.scheduledAt).replace('T', ' ').slice(0, 19),
      durationMinutes,
      b.reason || 'Follow-up visit',
      b.parentAppointmentId,
      req.user.id,
    ]
  );
  await audit(req, 'create', 'appointment', r.insertId, { followUpFrom: b.parentAppointmentId });
  res.status(201).json({ id: r.insertId });
});

router.post('/', requireRole('admin', 'receptionist'), async (req, res) => {
  const b = req.body || {};
  const durationMinutes = b.durationMinutes || 30;
  const slotCheck = await requireBookableSlot(pool, {
    doctorId: b.doctorId,
    scheduledAt: b.scheduledAt,
    durationMinutes,
    excludeAppointmentId: null,
  });
  if (!slotCheck.ok) {
    return res.status(400).json({ error: slotCheck.error });
  }
  const [r] = await pool.execute(
    `INSERT INTO appointments (patient_id, doctor_id, scheduled_at, duration_minutes, status, reason, visit_type, created_by)
     VALUES (?, ?, ?, ?, 'scheduled', ?, COALESCE(?, 'routine'), ?)`,
    [
      b.patientId,
      b.doctorId,
      String(b.scheduledAt).replace('T', ' ').slice(0, 19),
      durationMinutes,
      b.reason || null,
      b.visitType || 'routine',
      req.user.id,
    ]
  );
  await audit(req, 'create', 'appointment', r.insertId);
  res.status(201).json({ id: r.insertId });
});

router.patch('/:id', requireRole('admin', 'receptionist', 'doctor'), async (req, res) => {
  const b = req.body || {};
  if (req.user.role === 'doctor') {
    const [appt] = await pool.query('SELECT doctor_id FROM appointments WHERE id = ?', [req.params.id]);
    if (!appt[0] || appt[0].doctor_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your appointment' });
    }
  }
  if (b.scheduledAt != null && String(b.scheduledAt).trim() !== '') {
    const [[row]] = await pool.query(
      'SELECT doctor_id, duration_minutes FROM appointments WHERE id = ?',
      [req.params.id]
    );
    if (!row) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    const durationMinutes = b.durationMinutes ?? row.duration_minutes ?? 30;
    const slotCheck = await requireBookableSlot(pool, {
      doctorId: row.doctor_id,
      scheduledAt: b.scheduledAt,
      durationMinutes,
      excludeAppointmentId: Number(req.params.id),
    });
    if (!slotCheck.ok) {
      return res.status(400).json({ error: slotCheck.error });
    }
  }
  await pool.execute(
    `UPDATE appointments SET scheduled_at = COALESCE(?, scheduled_at), duration_minutes = COALESCE(?, duration_minutes),
      status = COALESCE(?, status), reason = COALESCE(?, reason), cancellation_reason = COALESCE(?, cancellation_reason),
      visit_type = COALESCE(?, visit_type) WHERE id = ?`,
    [
      b.scheduledAt != null && String(b.scheduledAt).trim() !== ''
        ? String(b.scheduledAt).replace('T', ' ').slice(0, 19)
        : null,
      b.durationMinutes ?? null,
      b.status ?? null,
      b.reason ?? null,
      b.cancellationReason !== undefined ? b.cancellationReason : null,
      b.visitType ?? null,
      req.params.id,
    ]
  );
  await audit(req, 'update', 'appointment', req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requireRole('admin', 'receptionist'), async (req, res) => {
  await pool.execute('DELETE FROM appointments WHERE id = ?', [req.params.id]);
  await audit(req, 'delete', 'appointment', req.params.id);
  res.json({ ok: true });
});

export default router;
