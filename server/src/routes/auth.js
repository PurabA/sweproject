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
    'SELECT id, email, role, first_name, last_name, department FROM users WHERE id = ?',
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
    department: u.department,
  });
});

export default router;
