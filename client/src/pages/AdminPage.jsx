import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [form, setForm] = useState({ email: '', password: '', role: 'receptionist', firstName: '', lastName: '', department: '' });
  const [msg, setMsg] = useState('');

  const load = () => {
    api('/api/admin/users').then(setUsers).catch((e) => setMsg(e.message));
    api('/api/admin/audit-logs?limit=50').then(setLogs).catch(() => {});
    api('/api/admin/payroll').then(setPayroll).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const createUser = async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/users', { method: 'POST', body: JSON.stringify(form) });
      setForm({ email: '', password: '', role: 'receptionist', firstName: '', lastName: '', department: '' });
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const refreshAlerts = async () => {
    await api('/api/alerts/refresh', { method: 'POST', body: '{}' });
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">HMIS — Authentication &amp; Security domain</p>
        <h1 className="hmis-page-title">Security &amp; administration</h1>
        <p className="hmis-page-desc">
          RBAC provisioning (AS-3), payroll extracts, activity logging (AS-6), and automated alert sweeps for inventory and ICU capacity (AN-3).
        </p>
      </header>

      <section className="hmis-card overflow-hidden">
        <div className="hmis-card-h">AS-3 Role-based access control (matrix)</div>
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
                ['Patient registration / profile', '✓', 'R', '✓', '—', '—'],
                ['Scheduling & cancellations', '✓', '✓*', '✓', '—', '—'],
                ['Clinical documentation', '✓', '✓', '—', '—', '—'],
                ['Lab orders & results', '✓', '✓', 'R', 'R', '✓'],
                ['Prescriptions / dispense', '✓', '✓', '—', '✓', '—'],
                ['Billing & payments', '✓', 'R', '✓', '—', '—'],
                ['Inventory & expiry', '✓', 'R', '—', '✓', '—'],
                ['ICU / emergency workflows', '✓', '✓', '✓', '—', '—'],
                ['Analytics & notifications', '✓', '✓', '✓', '—', '✓'],
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
          <p className="mt-3 text-xs text-slate-500">Legend: ✓ full write access · R read-only or limited workflow · * physician may modify own panel only.</p>
        </div>
      </section>
      {msg ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div> : null}

      <section className="hmis-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Alert engine</h2>
          <p className="mt-1 text-sm text-slate-600">Re-evaluate inventory par levels and ICU census rules (batch job).</p>
        </div>
        <button type="button" onClick={refreshAlerts} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700">
          Run threshold scan
        </button>
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
            <label className="hmis-label">Realm</label>
            <select className="hmis-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="receptionist">Patient access / registration</option>
              <option value="doctor">Licensed independent practitioner</option>
              <option value="pharmacist">Pharmacy</option>
              <option value="lab">Laboratory (results entry)</option>
              <option value="admin">Application administrator</option>
            </select>
          </div>
          <div>
            <label className="hmis-label">Cost center / dept</label>
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
                <th className="px-4 py-3">User ID (email)</th>
                <th className="px-4 py-3">Persona</th>
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

      <section className="hmis-table-wrap">
        <div className="hmis-card-h">Payroll interface (extract)</div>
        <div className="overflow-x-auto">
          <table className="hmis-table">
            <thead className="hmis-thead">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Pay period</th>
                <th className="px-4 py-3 text-right">Net pay</th>
              </tr>
            </thead>
            <tbody className="hmis-tbody">
              {payroll.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {p.first_name} {p.last_name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {String(p.period_start).slice(0, 10)} – {String(p.period_end).slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">${Number(p.net_amount).toFixed(2)}</td>
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
        </ul>
      </section>
    </div>
  );
}
