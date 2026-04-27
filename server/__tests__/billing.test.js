import { jest } from '@jest/globals';

/**
 * In-memory mock of mysql2/promise's pool.
 * It just exists so we can drive billing.js's code paths in pure JS without
 * requiring a real MySQL instance.  We verify the auto-computed totals + tax.
 */
const state = {
  bills: new Map(),
  billItems: [],
  patients: new Map([[1, { id: 1, patient_number: 'P-2026-00001', first_name: 'Test', last_name: 'Patient' }]]),
  consultations: new Map(),
  nextBillId: 1,
  nextItemId: 1,
};

function fakeConn() {
  return {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async (sql, params = []) => fakeQuery(sql, params),
    query: async (sql, params = []) => fakeQuery(sql, params),
  };
}

async function fakeQuery(sql, params = []) {
  const s = String(sql).replace(/\s+/g, ' ').trim();

  if (s.startsWith('SELECT id FROM patients WHERE id = ?')) {
    const p = state.patients.get(Number(params[0]));
    return [p ? [p] : [], []];
  }

  if (s.startsWith('SELECT bill_number FROM bills WHERE bill_number LIKE')) {
    return [[], []];
  }

  if (s.startsWith('INSERT INTO bills')) {
    const id = state.nextBillId++;
    const [patient_id, bill_number, total_amount, tax_amount, status, notes, created_by, paid_at] = params;
    state.bills.set(id, { id, patient_id, bill_number, total_amount, tax_amount, status, notes, created_by, paid_at });
    return [{ insertId: id, affectedRows: 1 }, []];
  }

  if (s.startsWith('INSERT INTO bill_items')) {
    const id = state.nextItemId++;
    const [bill_id, description, quantity, unit_price, consultation_id, appointment_id] = params;
    state.billItems.push({ id, bill_id, description, quantity, unit_price, consultation_id, appointment_id });
    return [{ insertId: id, affectedRows: 1 }, []];
  }

  if (s.startsWith('SELECT id, status, total_amount, tax_amount FROM bills WHERE id')) {
    const b = state.bills.get(Number(params[0]));
    return [b ? [b] : [], []];
  }

  if (s.startsWith('DELETE FROM bill_items WHERE bill_id')) {
    const id = Number(params[0]);
    state.billItems = state.billItems.filter((it) => it.bill_id !== id);
    return [{ affectedRows: 1 }, []];
  }

  if (s.startsWith('UPDATE bills SET status =')) {
    const id = Number(params[params.length - 1]);
    const b = state.bills.get(id);
    if (!b) return [{ affectedRows: 0 }, []];
    if (params.length === 5) {
      // no paid_at column in this query
      const [status, notes, total_amount, tax_amount] = params;
      Object.assign(b, { status, notes: notes ?? b.notes, total_amount, tax_amount });
    } else {
      // includes paid_at
      const [status, notes, total_amount, tax_amount, paid_at] = params;
      Object.assign(b, { status, notes: notes ?? b.notes, total_amount, tax_amount, paid_at });
    }
    return [{ affectedRows: 1 }, []];
  }

  if (s.startsWith('DELETE FROM bills WHERE id')) {
    const id = Number(params[0]);
    const existed = state.bills.delete(id);
    return [{ affectedRows: existed ? 1 : 0 }, []];
  }

  // Read endpoints
  if (s.startsWith('SELECT b.*, p.patient_number, p.first_name AS pf, p.last_name AS pl FROM bills b JOIN patients p ON p.id = b.patient_id WHERE b.id = ?')) {
    const b = state.bills.get(Number(params[0]));
    if (!b) return [[], []];
    const p = state.patients.get(b.patient_id);
    return [[{ ...b, patient_number: p?.patient_number, pf: p?.first_name, pl: p?.last_name }], []];
  }

  if (s.startsWith('SELECT * FROM bill_items WHERE bill_id = ?')) {
    const id = Number(params[0]);
    return [state.billItems.filter((it) => it.bill_id === id), []];
  }

  if (s.startsWith('SELECT b.*, p.patient_number, p.first_name AS pf, p.last_name AS pl FROM bills b JOIN patients p ON p.id = b.patient_id ORDER BY')) {
    const out = [...state.bills.values()].map((b) => {
      const p = state.patients.get(b.patient_id);
      return { ...b, patient_number: p?.patient_number, pf: p?.first_name, pl: p?.last_name };
    });
    return [out, []];
  }

  if (s.includes('FROM bills WHERE status IN (\'pending\',\'draft\')')) {
    if (s.startsWith('SELECT COUNT(*)')) {
      const open = [...state.bills.values()].filter((b) => ['pending', 'draft'].includes(b.status));
      const total = open.reduce((sum, b) => sum + Number(b.total_amount), 0);
      return [[{ bill_count: open.length, total_open: total }], []];
    }
  }

  if (s.startsWith('SELECT status, COUNT(*) AS cnt')) {
    const groups = new Map();
    for (const b of state.bills.values()) {
      const g = groups.get(b.status) || { status: b.status, cnt: 0, total_amount: 0 };
      g.cnt++;
      g.total_amount += Number(b.total_amount);
      groups.set(b.status, g);
    }
    return [[...groups.values()], []];
  }

  if (s.startsWith('SELECT COALESCE(SUM(total_amount),0) AS paid_this_month')) {
    return [[{ paid_this_month: 0 }], []];
  }
  if (s.startsWith('SELECT COALESCE(SUM(total_amount),0) AS paid_lifetime')) {
    return [[{ paid_lifetime: 0 }], []];
  }

  // Default no-op
  return [[], []];
}

const fakePool = {
  query: (sql, params) => fakeQuery(sql, params),
  execute: (sql, params) => fakeQuery(sql, params),
  getConnection: async () => fakeConn(),
};

jest.unstable_mockModule('../src/db.js', () => ({ default: fakePool }));
jest.unstable_mockModule('../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 99, role: 'admin', email: 'admin@test' };
    next();
  },
  requireRole:
    (...roles) =>
    (req, res, next) => {
      if (roles.includes(req.user?.role)) return next();
      return res.status(403).json({ error: 'Forbidden' });
    },
}));
jest.unstable_mockModule('../src/middleware/audit.js', () => ({ audit: async () => {} }));

const request = (await import('supertest')).default;
const express = (await import('express')).default;
await import('express-async-errors');
const billingRouter = (await import('../src/routes/billing.js')).default;

const app = express();
app.use(express.json());
app.use('/api', billingRouter);
app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ error: err.message }));

beforeEach(() => {
  state.bills.clear();
  state.billItems.length = 0;
  state.nextBillId = 1;
  state.nextItemId = 1;
});

describe('Billing routes', () => {
  it('rejects creation with no items', async () => {
    const res = await request(app).post('/api/bills').send({ patientId: 1, items: [] });
    expect(res.status).toBe(400);
  });

  it('rejects unknown patient', async () => {
    const res = await request(app)
      .post('/api/bills')
      .send({ patientId: 999, items: [{ description: 'x', quantity: 1, unitPrice: 5 }] });
    expect(res.status).toBe(404);
  });

  it('creates a bill with no automatic tax in the simplified billing flow', async () => {
    const res = await request(app)
      .post('/api/bills')
      .send({
        patientId: 1,
        items: [
          { description: 'Consult', quantity: 1, unitPrice: 100 },
          { description: 'Lab', quantity: 2, unitPrice: 50 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.subtotal).toBe(200);
    expect(res.body.tax).toBe(0);
    expect(res.body.totalAmount).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(state.billItems.length).toBe(2);
  });

  it('honors taxAmount override', async () => {
    const res = await request(app)
      .post('/api/bills')
      .send({
        patientId: 1,
        taxAmount: 0,
        items: [{ description: 'Charity care', quantity: 1, unitPrice: 75 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.tax).toBe(0);
    expect(res.body.totalAmount).toBe(75);
  });

  it('marks a bill paid with paid_at stamp', async () => {
    await request(app)
      .post('/api/bills')
      .send({ patientId: 1, items: [{ description: 'x', quantity: 1, unitPrice: 100 }] });
    const billId = [...state.bills.keys()][0];

    const res = await request(app).patch(`/api/bills/${billId}`).send({ status: 'paid' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paid');
    expect(state.bills.get(billId).paid_at).toBeInstanceOf(Date);
  });

  it('reverting from paid clears paid_at', async () => {
    await request(app)
      .post('/api/bills')
      .send({ patientId: 1, status: 'paid', items: [{ description: 'x', quantity: 1, unitPrice: 50 }] });
    const billId = [...state.bills.keys()][0];
    expect(state.bills.get(billId).paid_at).toBeInstanceOf(Date);

    const res = await request(app).patch(`/api/bills/${billId}`).send({ status: 'pending' });
    expect(res.status).toBe(200);
    expect(state.bills.get(billId).paid_at).toBeNull();
  });

  it('replaces line items and recomputes totals', async () => {
    await request(app)
      .post('/api/bills')
      .send({ patientId: 1, items: [{ description: 'orig', quantity: 1, unitPrice: 100 }] });
    const billId = [...state.bills.keys()][0];

    const res = await request(app)
      .patch(`/api/bills/${billId}`)
      .send({ items: [{ description: 'replaced', quantity: 2, unitPrice: 25 }] });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(50);
    const remaining = state.billItems.filter((it) => it.bill_id === billId);
    expect(remaining.length).toBe(1);
    expect(remaining[0].description).toBe('replaced');
  });

  it('voids a bill without altering its history', async () => {
    await request(app)
      .post('/api/bills')
      .send({ patientId: 1, items: [{ description: 'x', quantity: 1, unitPrice: 30 }] });
    const billId = [...state.bills.keys()][0];

    const res = await request(app).patch(`/api/bills/${billId}`).send({ status: 'void' });
    expect(res.status).toBe(200);
    expect(state.bills.get(billId).status).toBe('void');
  });

  it('returns 404 patching a non-existent bill', async () => {
    const res = await request(app).patch('/api/bills/999').send({ status: 'paid' });
    expect(res.status).toBe(404);
  });
});
