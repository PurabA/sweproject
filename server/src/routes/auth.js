import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const [users] = await pool.query(
    'SELECT id, email, password_hash, role, first_name, last_name, department, is_active FROM users WHERE email = ?',
    [email.trim().toLowerCase()]
  );
  const user = users[0];
  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'Server misconfiguration' });

  const token = jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
  await audit(req, 'login', 'user', user.id, { email: user.email });
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      department: user.department,
    },
  });
});

router.get('/session', authenticate, (req, res) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const decoded = token ? jwt.decode(token) : null;
  const expSec = decoded?.exp;
  res.json({
    userId: req.user.id,
    role: req.user.role,
    email: req.user.email,
    sessionExpiresAt: expSec ? new Date(expSec * 1000).toISOString() : null,
  });
});

router.patch('/me', authenticate, async (req, res) => {
  const b = req.body || {};
  const firstName = b.firstName !== undefined ? String(b.firstName).trim() : null;
  const lastName = b.lastName !== undefined ? String(b.lastName).trim() : null;
  const phone = b.phone !== undefined ? (b.phone === '' ? null : String(b.phone).trim()) : undefined;
  const department = b.department !== undefined ? (b.department === '' ? null : String(b.department).trim()) : undefined;

  if (firstName !== null && firstName.length === 0) return res.status(400).json({ error: 'firstName cannot be empty' });
  if (lastName !== null && lastName.length === 0) return res.status(400).json({ error: 'lastName cannot be empty' });

  await pool.execute(
    `UPDATE users
        SET first_name = COALESCE(?, first_name),
            last_name = COALESCE(?, last_name),
            phone = ${phone === undefined ? 'phone' : '?'},
            department = ${department === undefined ? 'department' : '?'}
      WHERE id = ?`,
    [
      firstName,
      lastName,
      ...(phone === undefined ? [] : [phone]),
      ...(department === undefined ? [] : [department]),
      req.user.id,
    ]
  );

  const [rows] = await pool.query(
    'SELECT id, email, role, first_name, last_name, phone, department FROM users WHERE id = ?',
    [req.user.id]
  );
  const u = rows[0];
  await audit(req, 'update', 'user', req.user.id, { firstName, lastName });
  res.json({
    id: u.id,
    email: u.email,
    role: u.role,
    firstName: u.first_name,
    lastName: u.last_name,
    phone: u.phone,
    department: u.department,
  });
});

router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'currentPassword and newPassword (min 8 chars) required' });
  }
  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'User not found' });
  const ok = await bcrypt.compare(currentPassword, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password incorrect' });
  const hash = await bcrypt.hash(String(newPassword), 10);
  await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
  await audit(req, 'password_change', 'user', req.user.id);
  res.json({ ok: true });
});

router.post('/logout', authenticate, async (req, res) => {
  await audit(req, 'logout', 'user', req.user.id);
  res.json({ ok: true });
});

router.get('/me', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, email, role, first_name, last_name, phone, department FROM users WHERE id = ?',
    [req.user.id]
  );
  const u = rows[0];
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: u.id,
    email: u.email,
    role: u.role,
    firstName: u.first_name,
    lastName: u.last_name,
    phone: u.phone,
    department: u.department,
  });
});

export default router;
