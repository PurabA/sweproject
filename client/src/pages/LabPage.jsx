import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PdfServiceBlock from '../components/PdfServiceBlock.jsx';

const STATUS = ['ordered', 'in_progress', 'completed', 'cancelled'];

function statusPill(s) {
  if (s === 'completed') return 'hmis-pill hmis-pill-emerald';
  if (s === 'in_progress') return 'hmis-pill hmis-pill-sky';
  if (s === 'cancelled') return 'hmis-pill hmis-pill-rose';
  return 'hmis-pill hmis-pill-amber';
}

export default function LabPage() {
  const { user } = useAuth();
  const canResolve = ['admin', 'lab'].includes(user?.role);
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('open');
  const [resultEditor, setResultEditor] = useState({}); // id -> text
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');

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

  const load = () => api('/api/lab-orders').then(setOrders).catch((e) => flash(e.message, 'err'));
  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'open') return orders.filter((o) => o.status === 'ordered' || o.status === 'in_progress');
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const setStatus = async (id, status) => {
    setBusy(true);
    try {
      await api(`/api/lab-orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, resultNotes: resultEditor[id] || undefined }),
      });
      flash(`Order #${id} → ${status.replace('_', ' ')}.`);
      setResultEditor((prev) => ({ ...prev, [id]: '' }));
      load();
    } catch (ex) {
      flash(ex.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Laboratory</p>
        <h1 className="hmis-page-title">Lab requests</h1>
        <p className="hmis-page-desc">
          Tests ordered by physicians. Mark each as in-progress, complete with results, or cancel — completed and cancelled
          requests drop out of the open queue automatically.
        </p>
      </header>

      {msg ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div> : null}
      {ok ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</div> : null}

      <PdfServiceBlock title="Filter" description="Switch which orders are displayed.">
        <div className="flex flex-wrap gap-2">
          {[
            { v: 'open', label: 'Open queue' },
            { v: 'completed', label: 'Completed' },
            { v: 'cancelled', label: 'Cancelled' },
            { v: 'all', label: 'All' },
          ].map((f) => (
            <button
              key={f.v}
              type="button"
              className={[
                'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                filter === f.v ? 'border-clinical-700 bg-clinical-50 text-clinical-900' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              ].join(' ')}
              onClick={() => setFilter(f.v)}
            >
              {f.label}
            </button>
          ))}
          <button type="button" className="hmis-btn-secondary" onClick={load}>
            Refresh
          </button>
        </div>
      </PdfServiceBlock>

      <section className="hmis-table-wrap">
        <div className="hmis-card-h">Lab orders</div>
        <div className="overflow-x-auto">
          <table className="hmis-table">
            <thead className="hmis-thead">
              <tr>
                <th className="px-4 py-3">Ordered</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Test</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Result / actions</th>
              </tr>
            </thead>
            <tbody className="hmis-tbody">
              {visible.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/80 align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                    {new Date(o.ordered_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm text-clinical-800">{o.patient_number}</span>
                    <span className="block text-sm text-slate-600">
                      {o.pf} {o.pl}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{o.test_name}</td>
                  <td className="px-4 py-3 text-xs capitalize text-slate-700">{o.priority}</td>
                  <td className="px-4 py-3">
                    <span className={statusPill(o.status)}>{o.status.replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {o.status === 'completed' || o.status === 'cancelled' ? (
                      <div className="space-y-1">
                        {o.result_notes ? <p className="text-slate-700">{o.result_notes}</p> : <p className="text-slate-500">—</p>}
                        {o.completed_at ? (
                          <p className="text-xs text-slate-500">Resolved {new Date(o.completed_at).toLocaleString()}</p>
                        ) : null}
                      </div>
                    ) : canResolve ? (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          className="hmis-input min-h-[3rem] font-sans text-sm"
                          placeholder="Result notes (optional but recommended for completion)…"
                          value={resultEditor[o.id] || ''}
                          onChange={(e) => setResultEditor((prev) => ({ ...prev, [o.id]: e.target.value }))}
                        />
                        <div className="flex flex-wrap gap-2">
                          {o.status === 'ordered' ? (
                            <button type="button" disabled={busy} className="hmis-link text-sm font-medium" onClick={() => setStatus(o.id, 'in_progress')}>
                              Start
                            </button>
                          ) : null}
                          <button type="button" disabled={busy} className="text-sm font-medium text-emerald-800 hover:underline" onClick={() => setStatus(o.id, 'completed')}>
                            Complete
                          </button>
                          <button type="button" disabled={busy} className="text-sm font-medium text-rose-700 hover:underline" onClick={() => setStatus(o.id, 'cancelled')}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-500">View only</span>
                    )}
                  </td>
                </tr>
              ))}
              {!visible.length ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-500" colSpan={6}>
                    No orders match this filter.
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
