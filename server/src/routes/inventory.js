import { Router } from 'express';
import pool from '../db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';

const router = Router();
router.use(authenticate);
router.use(requireRole('admin', 'pharmacist', 'doctor'));

router.get('/items', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM inventory_items ORDER BY name');
  res.json(rows);
});

router.post('/requests', requireRole('doctor', 'admin'), async (req, res) => {
  const itemId = Number(req.body?.itemId);
  const quantity = Number(req.body?.quantity);
  const note = String(req.body?.note || '').trim();
  if (!itemId || Number.isNaN(itemId) || !quantity || Number.isNaN(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'itemId and quantity (> 0) required' });
  }

  const [[item]] = await pool.query('SELECT id, name, sku, quantity AS on_hand FROM inventory_items WHERE id = ?', [itemId]);
  if (!item) return res.status(404).json({ error: 'Inventory item not found' });

  const [pharmacists] = await pool.query(`SELECT id FROM users WHERE role = 'pharmacist' AND is_active = 1 ORDER BY id`);
  const targets = pharmacists.map((p) => p.id).filter(Boolean);
  if (!targets.length) return res.status(409).json({ error: 'No active pharmacist accounts to receive requests' });

  const subject = `Medication request: ${item.name}`;
  const body = [
    `Requested by Dr. ${req.user?.email || req.user?.id}`,
    `Item: ${item.name}${item.sku ? ` (SKU ${item.sku})` : ''}`,
    `Requested quantity: ${quantity}`,
    `On-hand at request time: ${item.on_hand}`,
    note ? `Note: ${note}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const userId of targets) {
      await conn.execute(
        `INSERT INTO notifications (user_id, channel, subject, body)
         VALUES (?, 'in_app', ?, ?)`,
        [userId, subject, body]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  await audit(req, 'med_request', 'inventory_item', String(itemId), { quantity, note });
  res.status(201).json({ ok: true, notifiedPharmacists: targets.length });
});

router.get('/items/expiring', async (req, res) => {
  const days = Math.min(Number(req.query.withinDays) || 120, 730);
  const [rows] = await pool.query(
    `SELECT * FROM inventory_items WHERE expiry_date IS NOT NULL AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY) ORDER BY expiry_date`,
    [days]
  );
  res.json({ withinDays: days, items: rows });
});

router.post('/items', requireRole('admin', 'pharmacist'), async (req, res) => {
  const b = req.body || {};
  const [r] = await pool.execute(
    `INSERT INTO inventory_items (sku, name, category, quantity, unit, reorder_threshold, location, expiry_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      b.sku || null,
      b.name,
      b.category || null,
      b.quantity ?? 0,
      b.unit || 'unit',
      b.reorderThreshold ?? 10,
      b.location || null,
      b.expiryDate || null,
    ]
  );
  await audit(req, 'create', 'inventory_item', r.insertId);
  res.status(201).json({ id: r.insertId });
});

router.patch('/items/:id', requireRole('admin', 'pharmacist'), async (req, res) => {
  const b = req.body || {};
  await pool.execute(
    `UPDATE inventory_items SET name = COALESCE(?, name), category = COALESCE(?, category),
      quantity = COALESCE(?, quantity), unit = COALESCE(?, unit), reorder_threshold = COALESCE(?, reorder_threshold),
      location = COALESCE(?, location), expiry_date = COALESCE(?, expiry_date) WHERE id = ?`,
    [
      b.name ?? null,
      b.category ?? null,
      b.quantity ?? null,
      b.unit ?? null,
      b.reorderThreshold ?? null,
      b.location ?? null,
      b.expiryDate !== undefined ? b.expiryDate : null,
      req.params.id,
    ]
  );
  await audit(req, 'update', 'inventory_item', req.params.id);
  res.json({ ok: true });
});

router.post('/items/:id/adjust', requireRole('admin', 'pharmacist'), async (req, res) => {
  const delta = Number(req.body?.delta);
  if (Number.isNaN(delta)) return res.status(400).json({ error: 'delta required' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`UPDATE inventory_items SET quantity = quantity + ? WHERE id = ?`, [delta, req.params.id]);
    await conn.execute(
      `INSERT INTO inventory_transactions (item_id, delta, reason, performed_by) VALUES (?, ?, ?, ?)`,
      [req.params.id, delta, req.body?.reason || 'adjustment', req.user.id]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  await audit(req, 'inventory_adjust', 'inventory_item', req.params.id, { delta });
  res.json({ ok: true });
});

export default router;
