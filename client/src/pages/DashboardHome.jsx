import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

function severityBadge(sev) {
  if (sev === 'critical') return 'hmis-badge hmis-badge-critical';
  if (sev === 'warning') return 'hmis-badge hmis-badge-warn';
  return 'hmis-badge hmis-badge-info';
}

export default function DashboardHome() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [session, setSession] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/api/dashboard')
      .then(setData)
      .catch((e) => setErr(e.message));
    api('/api/auth/session')
      .then(setSession)
      .catch(() => {});
  }, []);

  const changePassword = async (e) => {
    e.preventDefault();
    setPwMsg('');
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
      });
      setPw({ current: '', next: '' });
      setPwMsg('Password updated. Use the new password on your next sign-in.');
    } catch (ex) {
      setPwMsg(ex.message);
    }
  };

  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>;
  if (!data)
    return (
      <div className="flex items-center gap-3 text-slate-600">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-clinical-700" />
        Loading workspace…
      </div>
    );

  const cards = [];
  if (data.patientsTotal != null) cards.push({ label: 'Registered patients', sub: 'Enterprise master index', value: data.patientsTotal });
  if (data.appointmentsUpcoming != null) cards.push({ label: 'Scheduled encounters', sub: 'From today forward', value: data.appointmentsUpcoming });
  if (data.myAppointmentsToday != null) cards.push({ label: 'My schedule', sub: 'Today and forward', value: data.myAppointmentsToday });
  if (data.pendingPrescriptions != null) cards.push({ label: 'Pharmacy queue', sub: 'Orders awaiting dispense', value: data.pendingPrescriptions });
  if (data.labOrdersOpen != null) cards.push({ label: 'Open laboratory work', sub: 'Ordered or in-progress requisitions', value: data.labOrdersOpen });
  if (data.lowStockItems != null) cards.push({ label: 'Low-stock alerts', sub: 'Below reorder point', value: data.lowStockItems });
  if (data.icuOccupied != null) cards.push({ label: 'ICU census', sub: 'Occupied critical-care beds', value: data.icuOccupied });

  const greet =
    user?.role === 'doctor'
      ? `Dr. ${user?.lastName || user?.firstName}`
      : [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Colleague';

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Home</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Welcome back, {greet}</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Role-aware snapshot from registration, scheduling, clinical, pharmacy, billing, and facility systems.
        </p>
      </header>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Key metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <div key={c.label} className="hmis-stat-card">
              <div className="hmis-stat-label">{c.label}</div>
              <div className="hmis-stat-value">{c.value}</div>
              <div className="mt-2 text-xs text-slate-500">{c.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="hmis-card overflow-hidden">
          <div className="hmis-card-h">Session</div>
          <div className="p-4 text-sm text-slate-700">
            <p>
              Signed in as <span className="font-mono text-slate-900">{session?.email || user?.email}</span> ({session?.role || user?.role}).
            </p>
            {session?.sessionExpiresAt ? (
              <p className="mt-2">
                Session expires at <span className="font-semibold text-slate-900">{new Date(session.sessionExpiresAt).toLocaleString()}</span>.
              </p>
            ) : (
              <p className="mt-2 text-slate-500">Session timing unavailable.</p>
            )}
            <p className="mt-3 text-xs text-slate-500">Sign out clears your token in this browser.</p>
          </div>
        </section>

        <section className="hmis-card overflow-hidden">
          <div className="hmis-card-h">Change password</div>
          <form onSubmit={changePassword} className="space-y-3 p-4">
            <div>
              <label className="hmis-label">Current password</label>
              <input type="password" autoComplete="current-password" className="hmis-input" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </div>
            <div>
              <label className="hmis-label">New password (min 8 characters)</label>
              <input type="password" autoComplete="new-password" className="hmis-input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </div>
            <button type="submit" className="hmis-btn-primary">
              Update password
            </button>
            {pwMsg ? <p className="text-xs text-slate-700">{pwMsg}</p> : null}
          </form>
        </section>
      </div>

      <section className="hmis-card overflow-hidden">
        <div className="hmis-card-h flex items-center justify-between">
          <span>System alerts</span>
          <span className="text-xs font-normal text-slate-500">Recent</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {(data.recentAlerts || []).length ? (
            data.recentAlerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                <div>
                  <div className="font-medium text-slate-900">{a.title}</div>
                  {a.message ? <div className="mt-0.5 text-sm text-slate-600">{a.message}</div> : null}
                </div>
                <span className={severityBadge(a.severity)}>{a.severity}</span>
              </li>
            ))
          ) : (
            <li className="px-4 py-8 text-center text-sm text-slate-500">No active alerts. All monitored thresholds within range.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
