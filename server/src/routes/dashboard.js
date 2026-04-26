import { Router } from 'express';
import pool from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const role = req.user.role;
  const base = {};

  if (['admin', 'receptionist', 'doctor'].includes(role)) {
    const [[p]] = await pool.query('SELECT COUNT(*) AS c FROM patients');
    const [[a]] = await pool.query(
      `SELECT COUNT(*) AS c FROM appointments WHERE status = 'scheduled' AND scheduled_at >= NOW()`
    );
    base.patientsTotal = p.c;
    base.appointmentsUpcoming = a.c;
  }

  if (['admin', 'lab'].includes(role)) {
    const [[lo]] = await pool.query(
      `SELECT COUNT(*) AS c FROM lab_orders WHERE status IN ('ordered','in_progress')`
    );
    base.labOrdersOpen = lo.c;
  }

  if (role === 'doctor') {
    const [[d]] = await pool.query(
      `SELECT COUNT(*) AS c FROM appointments WHERE doctor_id = ? AND status = 'scheduled' AND scheduled_at >= CURDATE()`,
      [req.user.id]
    );
    base.myAppointmentsToday = d.c;
  }

  if (['admin', 'pharmacist'].includes(role)) {
    const [[rx]] = await pool.query(`SELECT COUNT(*) AS c FROM prescriptions WHERE status = 'pending'`);
    base.pendingPrescriptions = rx.c;
  }

  if (['admin', 'pharmacist', 'doctor'].includes(role)) {
    const [low] = await pool.query(
      `SELECT COUNT(*) AS c FROM inventory_items WHERE quantity < reorder_threshold`
    );
    base.lowStockItems = low[0]?.c ?? 0;
  }

  if (['admin', 'doctor', 'receptionist'].includes(role)) {
    const [[icu]] = await pool.query(
      `SELECT COUNT(*) AS c FROM icu_beds WHERE status = 'occupied'`
    );
    base.icuOccupied = icu.c;
  }

  const [alerts] = await pool.query(
    `SELECT * FROM system_alerts WHERE acknowledged = 0 ORDER BY created_at DESC LIMIT 5`
  );
  base.recentAlerts = alerts;

  res.json(base);
});

router.get('/doctors', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, email, first_name, last_name, department FROM users WHERE role = 'doctor' AND is_active = 1 ORDER BY last_name`
  );
  res.json(rows);
});

export default router;
