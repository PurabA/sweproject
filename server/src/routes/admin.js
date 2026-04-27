import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('admin'));

router.get('/users', async (_req, res) => {
  const [rows] = await pool.query(
    'SELECT id, email, role, first_name, last_name, phone, department, is_active, created_at FROM users ORDER BY id'
  );
  res.json(rows);
});

router.post('/users', async (req, res) => {
  const b = req.body || {};
  if (!b.email || !b.password || !b.role || !b.firstName || !b.lastName) {
    return res.status(400).json({ error: 'email, password, role, firstName, lastName required' });
  }
  const hash = await bcrypt.hash(b.password, 10);
  const [r] = await pool.execute(
    `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, department)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [b.email.trim().toLowerCase(), hash, b.role, b.firstName, b.lastName, b.phone || null, b.department || null]
  );
  await audit(req, 'create', 'user', r.insertId, { email: b.email });
  res.status(201).json({ id: r.insertId });
});

router.get('/payroll', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT pr.*, u.email, u.first_name, u.last_name FROM payroll_records pr
     JOIN users u ON u.id = pr.staff_id ORDER BY pr.period_start DESC`
  );
  res.json(rows);
});

router.post('/payroll', async (req, res) => {
  const b = req.body || {};
  const net = Number(b.grossAmount) - Number(b.deductions || 0);
  const [r] = await pool.execute(
    `INSERT INTO payroll_records (staff_id, period_start, period_end, gross_amount, deductions, net_amount, paid_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [b.staffId, b.periodStart, b.periodEnd, b.grossAmount, b.deductions || 0, net, b.paidAt || null, b.notes || null]
  );
  await audit(req, 'create', 'payroll', r.insertId);
  res.status(201).json({ id: r.insertId });
});

router.get('/audit-logs', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const [rows] = await pool.query(
    `SELECT a.*, u.email AS user_email FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT ?`,
    [limit]
  );
  res.json(rows);
});

export default router;
