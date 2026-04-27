import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [form, setForm] = useState({ email: '', password: '', role: 'receptionist', firstName: '', lastName: '', department: '' });
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [scanning, setScanning] = useState(false);

  const flash = (text, kind = 'ok') => {
    if (kind === 'ok') {
      setOk(text);
      setMsg('');
      setTimeout(() => setOk(''), 4000);
    } else {
      setMsg(text);
      setOk('');
    }
  };

  const load = () => {
    api('/api/admin/users').then(setUsers).catch((e) => flash(e.message, 'err'));
    api('/api/admin/audit-logs?limit=50').then(setLogs).catch(() => {});
    api('/api/alerts').then(setAlerts).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const createUser = async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/users', { method: 'POST', body: JSON.stringify(form) });
      flash(`Created account for ${form.email}.`);
      setForm({ email: '', password: '', role: 'receptionist', firstName: '', lastName: '', department: '' });
      load();
    } catch (ex) {
      flash(ex.message, 'err');
    }
  };

  const refreshAlerts = async () => {
    setScanning(true);
    try {
      const res = await api('/api/alerts/refresh', { method: 'POST', body: '{}' });
      flash(`Threshold scan complete · ${res.count ?? 0} alert(s) recorded.`);
      load();
    } catch (ex) {
      flash(ex.message, 'err');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Authentication &amp; security</p>
        <h1 className="hmis-page-title">Security &amp; administration</h1>
        <p className="hmis-page-desc">
          User provisioning, role-based access control, activity audit log, and the alert engine for inventory and ICU capacity.
        </p>
      </header>

      {msg ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div> : null}
      {ok ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</div> : null}

      <section className="hmis-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Alert engine</h2>
          <p className="mt-1 text-sm text-slate-600">
            Re-evaluates inventory par levels, ICU census, and outstanding bills. Each scan replaces the previous alert snapshot, so resolved issues drop off automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAlerts}
          disabled={scanning}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
        >
          {scanning ? 'Scanning…' : 'Run threshold scan'}
        </button>
      </section>

      <section className="hmis-card overflow-hidden">
        <div className="hmis-card-h">Current alert snapshot</div>
        <ul className="divide-y divide-slate-100">
          {alerts.length ? (
            alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                <div>
                  <div className="font-medium text-slate-900">{a.title}</div>
                  {a.message ? <div className="mt-0.5 text-sm text-slate-600">{a.message}</div> : null}
                </div>
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                    a.severity === 'critical' ? 'bg-rose-100 text-rose-900' :
                    a.severity === 'warning' ? 'bg-amber-100 text-amber-900' :
                    'bg-sky-100 text-sky-900',
                  ].join(' ')}
                >
                  {a.severity}
                </span>
              </li>
            ))
          ) : (
            <li className="px-4 py-6 text-center text-sm text-slate-500">No active alerts. Run the scan to refresh.</li>
          )}
        </ul>
      </section>

      <section className="hmis-card overflow-hidden">
        <div className="hmis-card-h">Role-based access control</div>
        <div className="overflow-x-auto p-4 text-sm">
          <table className="hmis-table">
            <thead className="hmis-thead">
              <tr>
                <th className="px-3 py-2">Capability</th>
                <th className="px-3 py-2">Admin</th>
                <th className="px-3 py-2">Physician</th>
                <th className="px-3 py-2">Registration</th>
                <th className="px-3 py-2">Pharmacy</th>
                <th className="px-3 py-2">Laboratory</th>
              </tr>
            </thead>
            <tbody className="hmis-tbody">
              {[
                ['Patient registration / profile', '✓', 'R', '✓', 'R', 'R'],
                ['Scheduling & cancellations', '✓', '✓*', '✓', '—', '—'],
                ['Clinical documentation', '✓', '✓', 'R', 'R', 'R'],
                ['Lab orders & results', '✓', '✓', 'R', 'R', '✓'],
                ['Prescriptions / dispense', '✓', '✓', '—', '✓', '—'],
                ['Billing & payments', '✓', 'R', '✓', 'R', '—'],
                ['Inventory & expiry', '✓', 'R', '—', '✓', '—'],
                ['ICU / emergency workflows', '✓', '✓', '✓', '—', '—'],
                ['Notifications', '✓', '✓', '✓', '✓', '✓'],
                ['Security / audit / users', '✓', '—', '—', '—', '—'],
              ].map(([cap, a, d, r, p, l]) => (
                <tr key={cap}>
                  <td className="px-3 py-2 font-medium text-slate-800">{cap}</td>
                  <td className="px-3 py-2 text-center">{a}</td>
                  <td className="px-3 py-2 text-center">{d}</td>
                  <td className="px-3 py-2 text-center">{r}</td>
                  <td className="px-3 py-2 text-center">{p}</td>
                  <td className="px-3 py-2 text-center">{l}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">
            Legend: ✓ create + edit · R read-only or limited workflow · — no access · * physicians may modify only their own appointments.
          </p>
        </div>
      </section>

      <section className="hmis-card overflow-hidden">
        <div className="hmis-card-h">Provision staff identity</div>
        <form onSubmit={createUser} className="grid gap-4 p-4 md:grid-cols-2">
          <div>
            <label className="hmis-label">Work email</label>
            <input required className="hmis-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="hmis-label">Initial password</label>
            <input required type="password" className="hmis-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="hmis-label">Given name</label>
            <input required className="hmis-input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </div>
          <div>
            <label className="hmis-label">Family name</label>
            <input required className="hmis-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <div>
            <label className="hmis-label">Role</label>
            <select className="hmis-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="receptionist">Registration / front desk</option>
              <option value="doctor">Physician</option>
              <option value="pharmacist">Pharmacy</option>
              <option value="lab">Laboratory</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <div>
            <label className="hmis-label">Department</label>
            <input className="hmis-input" placeholder="Optional" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="hmis-btn-primary">
              Create account
            </button>
          </div>
        </form>
      </section>

      <section className="hmis-table-wrap">
        <div className="hmis-card-h">Directory</div>
        <div className="overflow-x-auto">
          <table className="hmis-table">
            <thead className="hmis-thead">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Department</th>
              </tr>
            </thead>
            <tbody className="hmis-tbody">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono text-sm text-slate-800">{u.email}</td>
                  <td className="px-4 py-3 capitalize text-slate-700">{u.role}</td>
                  <td className="px-4 py-3 text-slate-600">{u.department || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="hmis-card p-4">
        <h3 className="text-sm font-semibold text-slate-900">Audit stream (most recent)</h3>
        <ul className="mt-3 max-h-72 space-y-1.5 overflow-auto rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-700">
          {logs.map((l) => (
            <li key={l.id} className="border-b border-slate-200/80 pb-1.5 last:border-0">
              <span className="text-slate-500">{new Date(l.created_at).toISOString()}</span> — {l.action} {l.resource} {l.resource_id || ''}{' '}
              <span className="text-slate-500">{l.user_email || 'system'}</span>
            </li>
          ))}
          {!logs.length ? <li className="text-slate-500">No recent activity.</li> : null}
        </ul>
      </section>
    </div>
  );
}
