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
  const [ok, setOk] = useState('');
  const [form, setForm] = useState({ name: '', sku: '', quantity: 0, reorderThreshold: 10, expiryDate: '' });

  const flash = (text, kind = 'ok') => {
    if (kind === 'ok') {
      setOk(text);
      setMsg('');
      setTimeout(() => setOk(''), 3000);
    } else {
      setMsg(text);
      setOk('');
    }
  };

  const load = () => {
    api('/api/inventory/items').then(setItems).catch((e) => flash(e.message, 'err'));
    api('/api/inventory/items/expiring?withinDays=180').then((d) => setExpiring(d.items || [])).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const addItem = async (e) => {
    e.preventDefault();
    try {
      await api('/api/inventory/items', { method: 'POST', body: JSON.stringify(form) });
      flash(`Added ${form.name} to inventory.`);
      setForm({ name: '', sku: '', quantity: 0, reorderThreshold: 10, expiryDate: '' });
      load();
    } catch (ex) {
      flash(ex.message, 'err');
    }
  };

  const adjust = async (id, delta) => {
    try {
      await api(`/api/inventory/items/${id}/adjust`, { method: 'POST', body: JSON.stringify({ delta, reason: 'stock count' }) });
      load();
    } catch (ex) {
      flash(ex.message, 'err');
    }
  };

  const lowStock = (it) => it.quantity < it.reorder_threshold;

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pharmacy</p>
        <h1 className="hmis-page-title">Inventory</h1>
        <p className="hmis-page-desc">
          Maintain the medicine catalog, run signed quantity adjustments, and track items approaching expiry.
        </p>
      </header>

      {msg ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div> : null}
      {ok ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</div> : null}

      <PdfServiceBlock title="Expiry tracking" description="Monitor SKUs approaching expiration within the next 180 days.">
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

      {canManage ? (
        <PdfServiceBlock title="Add medicine to inventory" description="Catalog maintenance and signed quantity adjustments.">
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
              <label className="hmis-label">Reorder threshold</label>
              <input type="number" className="hmis-input" value={form.reorderThreshold} onChange={(e) => setForm({ ...form, reorderThreshold: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <label className="hmis-label">Expiry date</label>
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
          <span className="text-xs font-normal text-slate-500">Amber = below reorder threshold</span>
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
              {!items.length ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-500" colSpan={canManage ? 6 : 4}>
                    Inventory is empty. Add an item above to get started.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
