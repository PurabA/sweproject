import { useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PdfServiceBlock from '../components/PdfServiceBlock.jsx';

const TAX_RATE = 0;
const STATUS_OPTIONS = ['draft', 'pending'];

const blankLine = () => ({ description: '', quantity: '1', unitPrice: '0.00' });
const blankForm = () => ({ patientId: '', notes: '', status: 'pending', items: [blankLine()] });

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const fmt = (n) => `Rs. ${round2(n).toFixed(2)}`;

export default function BillingPage() {
  const { user } = useAuth();
  const role = user?.role;
  const canCreate = ['admin', 'receptionist'].includes(role);
  const canPostPayment = ['admin', 'receptionist'].includes(role);
  const canDelete = role === 'admin';

  const [bills, setBills] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctorSummary, setDoctorSummary] = useState(null);
  const [doctorLines, setDoctorLines] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState(blankForm());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');

  // ---------- helpers ----------
  const flash = (text, kind = 'ok') => {
    if (kind === 'ok') {
      setOk(text);
      setMsg('');
      setTimeout(() => setOk(''), 3500);
    } else {
      setMsg(text);
      setOk('');
    }
  };

  const loadShared = () => {
    api('/api/billing/reports/summary').then(setSummary).catch(() => {});
    api('/api/bills').then(setBills).catch((e) => flash(e.message, 'err'));
  };

  const loadDoctor = () => {
    api('/api/billing/doctor/summary').then(setDoctorSummary).catch((e) => flash(e.message, 'err'));
    api('/api/billing/doctor/encounters?limit=250').then(setDoctorLines).catch(() => {});
  };

  // ---------- initial fetch ----------
  useEffect(() => {
    if (!user) return;
    const patientsPath = role === 'doctor' ? '/api/patients/assigned' : '/api/patients';
    api(patientsPath).then(setPatients).catch(() => {});
    loadShared();
    if (role === 'doctor') loadDoctor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ---------- form helpers ----------
  const setLine = (idx, key, value) => {
    setForm((f) => {
      const items = f.items.map((it, i) => (i === idx ? { ...it, [key]: value } : it));
      return { ...f, items };
    });
  };
  const addLine = () => setForm((f) => ({ ...f, items: [...f.items, blankLine()] }));
  const removeLine = (idx) =>
    setForm((f) => ({
      ...f,
      items: f.items.length > 1 ? f.items.filter((_, i) => i !== idx) : f.items,
    }));

  const totals = useMemo(() => {
    const subtotal = round2(
      form.items.reduce(
        (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
        0
      )
    );
    const tax = round2(subtotal * TAX_RATE);
    const total = round2(subtotal + tax);
    return { subtotal, tax, total };
  }, [form.items]);

  // ---------- actions ----------
  const createBill = async (e) => {
    e.preventDefault();
    if (!form.patientId) return flash('Choose a patient.', 'err');
    const items = form.items
      .map((it) => ({
        description: it.description.trim(),
        quantity: Math.max(1, Math.floor(Number(it.quantity) || 1)),
        unitPrice: round2(it.unitPrice),
      }))
      .filter((it) => it.description.length > 0);
    if (!items.length) return flash('Add at least one line with a description.', 'err');
    if (items.some((it) => it.unitPrice < 0)) return flash('Prices must be non-negative.', 'err');
    setBusy(true);
    try {
      const created = await api('/api/bills', {
        method: 'POST',
        body: JSON.stringify({
          patientId: Number(form.patientId),
          status: form.status,
          notes: form.notes || undefined,
          items,
        }),
      });
      flash(`Bill ${created.billNumber} created — total ${fmt(created.totalAmount ?? created.total)}.`);
      setForm(blankForm());
      loadShared();
      if (role === 'doctor') loadDoctor();
    } catch (ex) {
      flash(ex.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const patchBill = async (id, payload, successText) => {
    setBusy(true);
    try {
      await api(`/api/bills/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      flash(successText);
      loadShared();
      if (role === 'doctor') loadDoctor();
    } catch (ex) {
      flash(ex.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const markPaid = (id, billNumber) => patchBill(id, { status: 'paid' }, `Posted payment on ${billNumber}.`);
  const deleteBill = async (id, billNumber) => {
    if (!window.confirm(`Delete ${billNumber}? This is permanent.`)) return;
    setBusy(true);
    try {
      await api(`/api/bills/${id}`, { method: 'DELETE' });
      flash(`${billNumber} deleted.`);
      loadShared();
    } catch (ex) {
      flash(ex.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const openInvoice = async (id, billNumber) => {
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      flash('Allow pop-ups for this site to view the invoice PDF/print page.', 'err');
      return;
    }
    popup.document.write('<!doctype html><title>Loading invoice</title><p style="font-family: system-ui, sans-serif; padding: 24px;">Loading invoice...</p>');
    setBusy(true);
    try {
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/bills/${id}/invoice.html`, { headers });
      if (!res.ok) throw new Error(`Could not open invoice ${billNumber}.`);
      const html = await res.text();
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
    } catch (ex) {
      popup.document.open();
      popup.document.write(`<!doctype html><title>Invoice error</title><p style="font-family: system-ui, sans-serif; padding: 24px;">${ex.message}</p>`);
      popup.document.close();
      flash(ex.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const visibleBills = bills.filter((b) => b.status !== 'paid');

  const PatientBillsTable = (
    <section className="hmis-table-wrap">
      <div className="hmis-card-h">Patient bills</div>
      <div className="overflow-x-auto">
        <table className="hmis-table">
          <thead className="hmis-thead">
            <tr>
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Patient</th>
              <th className="px-4 py-3 text-right">Tax</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="hmis-tbody">
            {visibleBills.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50/80">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-clinical-800">{b.bill_number}</td>
                <td className="px-4 py-3 text-slate-800">
                  {b.patient_number} — {b.pf} {b.pl}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">{fmt(b.tax_amount)}</td>
                <td className="px-4 py-3 text-right font-medium tabular-nums">{fmt(b.total_amount)}</td>
                <td className="px-4 py-3">
                  <span
                    className={[
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                      'bg-amber-100 text-amber-900',
                    ].join(' ')}
                  >
                    {b.status}
                  </span>
                </td>
                <td className="space-x-3 px-4 py-3 text-sm">
                  <button type="button" className="hmis-link font-medium" onClick={() => openInvoice(b.id, b.bill_number)} disabled={busy}>
                    PDF / print
                  </button>
                  {canPostPayment ? (
                    <button type="button" className="hmis-link font-medium" onClick={() => markPaid(b.id, b.bill_number)} disabled={busy}>
                      Post payment
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button type="button" className="text-sm font-medium text-rose-700 hover:underline" onClick={() => deleteBill(b.id, b.bill_number)} disabled={busy}>
                      Delete
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!visibleBills.length ? (
              <tr>
                <td className="px-4 py-6 text-sm text-slate-500" colSpan={6}>
                  No active patient bills.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );

  // ---------- render ----------
  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">HMIS — Billing &amp; Financial domain</p>
        <h1 className="hmis-page-title">Billing &amp; financial</h1>
        <p className="hmis-page-desc">
          Patient bills, payment posting, and doctor-wise paid receipts.
        </p>
      </header>

      {msg ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div> : null}
      {ok ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</div> : null}

      {PatientBillsTable}

      {/* Doctor sees their own revenue summary first */}
      {role === 'doctor' ? (
        <PdfServiceBlock
          code="BF (doctor)"
          title="My billed revenue (from encounters)"
          description="Money tied to bill line-items linked to your consultations."
        >
          {doctorSummary ? (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open (draft/pending)</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-amber-900">{fmt(doctorSummary.open_amount)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid (lifetime)</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-900">{fmt(doctorSummary.paid_amount)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid (this month)</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{fmt(doctorSummary.paid_this_month)}</div>
                <div className="mt-2 text-xs text-slate-600">
                  {doctorSummary.consultations_billed || 0} consultations · {doctorSummary.bills_touched || 0} bills
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Loading physician finance…</p>
          )}
        </PdfServiceBlock>
      ) : null}

      <PdfServiceBlock code="BF-4" title="Billing summary" description="Simple status totals for active patient bills.">
        {summary ? (
          <ul className="space-y-2 text-sm">
            {(summary.byStatus || [])
              .filter((row) => row.status !== 'paid')
              .map((row) => (
                <li key={row.status} className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="capitalize text-slate-700">{row.status}</span>
                  <span className="font-medium tabular-nums text-slate-900">
                    {row.cnt} · {fmt(row.total_amount)}
                  </span>
                </li>
              ))}
            {!(summary.byStatus || []).some((row) => row.status !== 'paid') ? <li className="text-slate-500">No active bills yet.</li> : null}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">Loading financial summary…</p>
        )}
      </PdfServiceBlock>

      {/* Invoice creation (admin / receptionist) */}
      {canCreate ? (
        <PdfServiceBlock
          code="BF-1 / BF-2"
          title="Invoice generation &amp; payment processing"
          description="Create bills with one or more line items. Hospital service tax is not auto-applied in this simplified flow."
        >
          <form onSubmit={createBill} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="hmis-label">Guarantor / patient account</label>
                <select
                  required
                  className="hmis-select"
                  value={form.patientId}
                  onChange={(e) => setForm({ ...form, patientId: e.target.value })}
                >
                  <option value="">Select…</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.patient_number} — {p.first_name} {p.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="hmis-label">Initial status</label>
                <select className="hmis-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Line items</span>
                <button type="button" className="text-sm font-medium text-clinical-700 hover:underline" onClick={addLine}>
                  + Add line
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {form.items.map((it, idx) => (
                  <div key={idx} className="grid items-end gap-3 p-3 md:grid-cols-12">
                    <div className="md:col-span-6">
                      <label className="hmis-label">Description</label>
                      <input
                        className="hmis-input"
                        required
                        value={it.description}
                        onChange={(e) => setLine(idx, 'description', e.target.value)}
                        placeholder="e.g., Consultation visit"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="hmis-label">Qty</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="hmis-input"
                        value={it.quantity}
                        onChange={(e) => setLine(idx, 'quantity', e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="hmis-label">Unit price (Rs.)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="hmis-input"
                        value={it.unitPrice}
                        onChange={(e) => setLine(idx, 'unitPrice', e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-1 md:text-right">
                      <button
                        type="button"
                        className="text-sm font-medium text-rose-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                        onClick={() => removeLine(idx)}
                        disabled={form.items.length === 1}
                        title={form.items.length === 1 ? 'At least one line is required' : 'Remove line'}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-6 border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-600">
                  Subtotal: <span className="font-semibold tabular-nums text-slate-900">{fmt(totals.subtotal)}</span>
                </span>
                <span className="text-slate-600">
                  Tax: <span className="font-semibold tabular-nums text-slate-900">{fmt(totals.tax)}</span>
                </span>
                <span className="text-slate-700">
                  Total: <span className="text-base font-bold tabular-nums text-slate-900">{fmt(totals.total)}</span>
                </span>
              </div>
            </div>

            <div>
              <label className="hmis-label">Notes (optional)</label>
              <input
                className="hmis-input"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Free-text memo for this invoice"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="submit" className="hmis-btn-primary" disabled={busy}>
                {busy ? 'Working…' : 'Generate bill'}
              </button>
              <button type="button" className="hmis-btn-secondary" onClick={() => setForm(blankForm())} disabled={busy}>
                Reset
              </button>
            </div>
          </form>
        </PdfServiceBlock>
      ) : null}

      {/* Doctor encounter lines */}
      {role === 'doctor' ? (
        <section className="hmis-table-wrap">
          <div className="hmis-card-h">My billed encounter lines</div>
          <div className="overflow-x-auto">
            <table className="hmis-table">
              <thead className="hmis-thead">
                <tr>
                  <th className="px-4 py-3">Consultation</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Bill</th>
                  <th className="px-4 py-3">Line</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="hmis-tbody">
                {doctorLines.map((r, idx) => (
                  <tr key={`${r.bill_id}-${r.consultation_id}-${idx}`} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">
                      C{r.consultation_id} · {new Date(r.consultation_created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-clinical-800">{r.patient_number}</span>
                      <span className="block text-sm text-slate-600">
                        {r.pf} {r.pl}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-800">
                      <span className="font-mono text-xs">{r.bill_number}</span>
                      <span className="ml-2 capitalize text-slate-600">{r.bill_status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-800">
                      {r.description} · {r.quantity} × {fmt(r.unit_price)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {fmt(r.line_total)}
                    </td>
                  </tr>
                ))}
                {!doctorLines.length ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-slate-500" colSpan={5}>
                      No billed lines linked to your consultations yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

    </div>
  );
}
