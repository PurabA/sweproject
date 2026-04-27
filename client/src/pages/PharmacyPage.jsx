import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PdfServiceBlock from '../components/PdfServiceBlock.jsx';

export default function PharmacyPage() {
  const { user } = useAuth();
  const canManage = ['admin', 'pharmacist'].includes(user?.role);
  const [items, setItems] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ name: '', sku: '', quantity: 0, reorderThreshold: 10, expiryDate: '' });
  const [reqForm, setReqForm] = useState({ itemId: '', quantity: 1, note: '' });

  const load = () => {
    api('/api/inventory/items').then(setItems).catch((e) => setMsg(e.message));
    api('/api/inventory/items/expiring?withinDays=180').then((d) => setExpiring(d.items || [])).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const addItem = async (e) => {
    e.preventDefault();
    await api('/api/inventory/items', { method: 'POST', body: JSON.stringify(form) });
    setForm({ name: '', sku: '', quantity: 0, reorderThreshold: 10, expiryDate: '' });
    load();
  };

  const adjust = async (id, delta) => {
    await api(`/api/inventory/items/${id}/adjust`, { method: 'POST', body: JSON.stringify({ delta, reason: 'stock count' }) });
    load();
  };

  const lowStock = (it) => it.quantity < it.reorder_threshold;

  const requestMore = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api('/api/inventory/requests', {
        method: 'POST',
        body: JSON.stringify({
          itemId: Number(reqForm.itemId),
          quantity: Number(reqForm.quantity),
          note: reqForm.note || undefined,
        }),
      });
      setReqForm({ itemId: '', quantity: 1, note: '' });
      setMsg('Request sent to pharmacy.');
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">HMIS — Pharmacy &amp; Inventory domain</p>
        <h1 className="hmis-page-title">Pharmacy &amp; inventory</h1>
        <p className="hmis-page-desc">
          Medicine inventory, transactional stock updates, low-stock alerting (see System Alerts), expiry tracking, and linkage to prescription fulfillment in Clinical.
        </p>
      </header>
      {msg ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div> : null}

      <PdfServiceBlock code="PI-3" title="Low stock alerts" description="Rows below par feed the automated alert engine (run from Security &amp; administration).">
        <p className="text-sm text-slate-700">
          Items highlighted amber in the stock table are below reorder threshold. Administrators can trigger <span className="font-semibold">Run threshold scan</span> on the admin console to create <span className="font-mono">system_alerts</span> rows.
        </p>
      </PdfServiceBlock>

      <PdfServiceBlock code="PI-4" title="Expiry tracking" description="Monitor SKUs approaching expiration within a configurable horizon.">
        {expiring.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {expiring.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium text-slate-900">{it.name}</span>
                <span className="font-mono text-xs text-slate-600">{it.sku || '—'}</span>
                <span className="text-amber-900">Expires {it.expiry_date?.slice?.(0, 10) || it.expiry_date}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">No expiring SKUs in the selected horizon.</p>
        )}
      </PdfServiceBlock>

      {user?.role === 'doctor' ? (
        <PdfServiceBlock
          code="PI (doctor)"
          title="Medicine availability (read-only) + request more"
          description="Physician view: see on-hand quantities and send a restock request to Pharmacists."
        >
          <form onSubmit={requestMore} className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="hmis-label">Medicine</label>
              <select required className="hmis-select" value={reqForm.itemId} onChange={(e) => setReqForm({ ...reqForm, itemId: e.target.value })}>
                <option value="">Select…</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name} (on hand: {it.quantity})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hmis-label">Quantity needed</label>
              <input type="number" min="1" className="hmis-input" value={reqForm.quantity} onChange={(e) => setReqForm({ ...reqForm, quantity: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <label className="hmis-label">Note (optional)</label>
              <input className="hmis-input" value={reqForm.note} onChange={(e) => setReqForm({ ...reqForm, note: e.target.value })} placeholder="e.g., for OR case tomorrow morning" />
            </div>
            <div className="md:col-span-3">
              <button type="submit" className="hmis-btn-secondary">
                Request restock from pharmacy
              </button>
            </div>
          </form>
        </PdfServiceBlock>
      ) : null}

      {canManage ? (
        <PdfServiceBlock code="PI-1 / PI-2" title="Medicine inventory &amp; stock updates" description="Catalog maintenance and signed quantity adjustments.">
          <form onSubmit={addItem} className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-3">
              <label className="hmis-label">Description</label>
              <input required className="hmis-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="hmis-label">SKU / item code</label>
              <input className="hmis-input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <label className="hmis-label">On-hand quantity</label>
              <input type="number" className="hmis-input" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div>
              <label className="hmis-label">Reorder at (par)</label>
              <input type="number" className="hmis-input" value={form.reorderThreshold} onChange={(e) => setForm({ ...form, reorderThreshold: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <label className="hmis-label">Expiry date (PI-4)</label>
              <input type="date" className="hmis-input max-w-xs" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
            </div>
            <div className="flex items-end md:col-span-3">
              <button type="submit" className="hmis-btn-primary">
                Save to inventory
              </button>
            </div>
          </form>
        </PdfServiceBlock>
      ) : null}

      <section className="hmis-table-wrap">
        <div className="hmis-card-h flex flex-wrap items-center justify-between gap-2">
          <span>Stock on hand</span>
          <span className="text-xs font-normal text-slate-500">Amber = below par (PI-3)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="hmis-table">
            <thead className="hmis-thead">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3 text-right">Qty</th>
                {canManage ? <th className="px-4 py-3 text-right">Par</th> : null}
                {canManage ? <th className="px-4 py-3"></th> : null}
              </tr>
            </thead>
            <tbody className="hmis-tbody">
              {items.map((it) => (
                <tr key={it.id} className={lowStock(it) ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-slate-50/80'}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-slate-600">{it.sku || '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{it.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{it.expiry_date ? String(it.expiry_date).slice(0, 10) : '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{it.quantity}</td>
                  {canManage ? <td className="px-4 py-3 text-right tabular-nums text-slate-600">{it.reorder_threshold}</td> : null}
                  {canManage ? (
                    <td className="space-x-2 px-4 py-3 text-right">
                      <button type="button" className="hmis-link text-sm" onClick={() => adjust(it.id, 10)}>
                        Receive +10
                      </button>
                      <button type="button" className="text-sm font-medium text-rose-700 hover:underline" onClick={() => adjust(it.id, -1)}>
                        −1
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
