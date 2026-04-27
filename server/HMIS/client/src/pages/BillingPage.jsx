import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PdfServiceBlock from '../components/PdfServiceBlock.jsx';

export default function BillingPage() {
  const { user } = useAuth();
  const canCreate = ['admin', 'receptionist'].includes(user?.role);
  const [bills, setBills] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctorSummary, setDoctorSummary] = useState(null);
  const [doctorLines, setDoctorLines] = useState([]);
  const [form, setForm] = useState({ patientId: '', lineDesc: '', lineQty: 1, linePrice: 0 });
  const [paid, setPaid] = useState([]);
  const [outstanding, setOutstanding] = useState(null);
  const [summary, setSummary] = useState(null);
  const [phFilter, setPhFilter] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => {
    api('/api/bills').then(setBills).catch((e) => setMsg(e.message));
    api('/api/billing/outstanding-dues').then(setOutstanding).catch(() => {});
    api('/api/billing/reports/summary').then(setSummary).catch(() => {});
  };

  const loadPaid = () => {
    const q = phFilter ? `?patientId=${encodeURIComponent(phFilter)}` : '';
    api(`/api/billing/payment-history${q}`).then(setPaid).catch((e) => setMsg(e.message));
  };

  useEffect(() => {
    const patientsPath = user?.role === 'doctor' ? '/api/patients/assigned' : '/api/patients';
    api(patientsPath).then(setPatients).catch(() => {});
    if (user?.role === 'doctor') {
      api('/api/billing/doctor/summary').then(setDoctorSummary).catch((e) => setMsg(e.message));
      api('/api/billing/doctor/encounters?limit=250').then(setDoctorLines).catch((e) => setMsg(e.message));
    } else {
      load();
      loadPaid();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createBill = async (e) => {
    e.preventDefault();
    try {
      await api('/api/bills', {
        method: 'POST',
        body: JSON.stringify({
          patientId: Number(form.patientId),
          items: [{ description: form.lineDesc, quantity: Number(form.lineQty), unitPrice: Number(form.linePrice) }],
        }),
      });
      setForm({ patientId: '', lineDesc: '', lineQty: 1, linePrice: 0 });
      load();
      loadPaid();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const markPaid = async (id) => {
    await api(`/api/bills/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) });
    load();
    loadPaid();
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">HMIS — Billing &amp; Financial domain</p>
        <h1 className="hmis-page-title">Billing &amp; financial</h1>
        <p className="hmis-page-desc">
          Invoice generation, payment posting, outstanding balances, billing analytics, and paid transaction history per the G3 financial module.
        </p>
      </header>
      {msg ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div> : null}

      {user?.role === 'doctor' ? (
        <>
          <PdfServiceBlock
            code="BF (doctor)"
            title="My billed revenue (from encounters)"
            description="Physician view: money is computed from bill line-items linked to your consultations in the database."
          >
            {doctorSummary ? (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open (draft/pending)</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-amber-900">${Number(doctorSummary.open_amount || 0).toFixed(2)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid (lifetime)</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-900">${Number(doctorSummary.paid_amount || 0).toFixed(2)}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid (this month)</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">${Number(doctorSummary.paid_this_month || 0).toFixed(2)}</div>
                  <div className="mt-2 text-xs text-slate-600">
                    {doctorSummary.consultations_billed || 0} consultations · {doctorSummary.bills_touched || 0} bills
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">Loading physician finance…</p>
            )}
          </PdfServiceBlock>

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
                        {r.description} · {r.quantity} × ${Number(r.unit_price).toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                        ${Number(r.line_total).toFixed(2)}
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
        </>
      ) : (
        <>
          <PdfServiceBlock code="BF-3" title="Outstanding dues tracking" description="Open AR on pending and draft invoices with enterprise rollup.">
            {outstanding ? (
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Open invoices</div>
                  <div className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{outstanding.aggregate?.bill_count ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">Total open balance</div>
                  <div className="mt-1 text-3xl font-semibold tabular-nums text-amber-900">
                    ${Number(outstanding.aggregate?.total_open || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">Loading receivables…</p>
            )}
          </PdfServiceBlock>

          <PdfServiceBlock code="BF-4" title="Billing reports" description="Rollups by ledger status and month-to-date cash recognition.">
            {summary ? (
              <div className="grid gap-4 md:grid-cols-2">
                <ul className="space-y-2 text-sm">
                  {(summary.byStatus || []).map((row) => (
                    <li key={row.status} className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="capitalize text-slate-700">{row.status}</span>
                      <span className="font-medium tabular-nums text-slate-900">
                        {row.cnt} · ${Number(row.total_amount).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="text-xs font-semibold uppercase text-slate-500">Paid this month</div>
                  <div className="mt-2 text-2xl font-bold tabular-nums text-emerald-900">${Number(summary.paidThisMonth || 0).toFixed(2)}</div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">Loading financial summary…</p>
            )}
          </PdfServiceBlock>

          <PdfServiceBlock code="BF-5" title="Payment history viewer" description="Settled invoices (optionally filter by patient identifier).">
            <div className="mb-3 flex flex-wrap gap-2">
              <select className="hmis-select max-w-xs" value={phFilter} onChange={(e) => setPhFilter(e.target.value)}>
                <option value="">All patients</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.patient_number} — {p.first_name} {p.last_name}
                  </option>
                ))}
              </select>
              <button type="button" className="hmis-btn-secondary" onClick={loadPaid}>
                Refresh paid ledger
              </button>
            </div>
            <ul className="max-h-56 divide-y divide-slate-100 overflow-auto text-sm">
              {paid.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-mono text-xs text-clinical-800">{b.bill_number}</span>
                  <span className="text-slate-700">
                    {b.patient_number} — {b.pf} {b.pl}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">${Number(b.total_amount).toFixed(2)}</span>
                </li>
              ))}
              {!paid.length ? <li className="py-4 text-slate-500">No paid invoices in scope.</li> : null}
            </ul>
          </PdfServiceBlock>

          {canCreate ? (
            <PdfServiceBlock code="BF-1 / BF-2" title="Invoice generation &amp; payment processing" description="Create bills with line items; post payment to mark invoices paid.">
              <form onSubmit={createBill} className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="hmis-label">Guarantor / patient account</label>
                  <select required className="hmis-select" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
                    <option value="">Select…</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.patient_number} — {p.first_name} {p.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="hmis-label">Charge description</label>
                  <input className="hmis-input" value={form.lineDesc} onChange={(e) => setForm({ ...form, lineDesc: e.target.value })} required />
                </div>
                <div>
                  <label className="hmis-label">Units</label>
                  <input type="number" min="1" className="hmis-input" value={form.lineQty} onChange={(e) => setForm({ ...form, lineQty: e.target.value })} />
                </div>
                <div>
                  <label className="hmis-label">Unit price (USD)</label>
                  <input type="number" step="0.01" className="hmis-input" value={form.linePrice} onChange={(e) => setForm({ ...form, linePrice: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <button type="submit" className="hmis-btn-primary">
                    Generate bill
                  </button>
                </div>
              </form>
            </PdfServiceBlock>
          ) : null}

          <section className="hmis-table-wrap">
            <div className="hmis-card-h">Accounts receivable (BF-2 status workflow)</div>
            <div className="overflow-x-auto">
              <table className="hmis-table">
                <thead className="hmis-thead">
                  <tr>
                    <th className="px-4 py-3">Invoice #</th>
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="hmis-tbody">
                  {bills.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-clinical-800">{b.bill_number}</td>
                      <td className="px-4 py-3 text-slate-800">
                        {b.patient_number} — {b.pf} {b.pl}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">${Number(b.total_amount).toFixed(2)}</td>
                      <td className="px-4 py-3 capitalize text-slate-700">{b.status}</td>
                      <td className="px-4 py-3">
                        {canCreate && b.status !== 'paid' ? (
                          <button type="button" className="hmis-link text-sm font-medium" onClick={() => markPaid(b.id)}>
                            Post payment
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
