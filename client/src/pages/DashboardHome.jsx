import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

function severityBadge(sev) {
  if (sev === 'critical') return 'hmis-badge hmis-badge-critical';
  if (sev === 'warning') return 'hmis-badge hmis-badge-warn';
  return 'hmis-badge hmis-badge-info';
}

function isSameDay(d, ref) {
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

export default function DashboardHome() {
  const { user, refreshUser } = useAuth();
  const role = user?.role;
  const isAdmin = role === 'admin';
  const isDoctor = role === 'doctor';

  const [data, setData] = useState(null);
  const [session, setSession] = useState(null);
  const [todayAppts, setTodayAppts] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [profile, setProfile] = useState({ firstName: '', lastName: '', phone: '', department: '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!user) return;
    api('/api/auth/session').then(setSession).catch(() => {});
    api('/api/auth/me').then((me) => setProfile({
      firstName: me.firstName || '',
      lastName: me.lastName || '',
      phone: me.phone || '',
      department: me.department || '',
    })).catch(() => {});
    api('/api/notifications').then((rows) => setNotifications((rows || []).slice(0, 5))).catch(() => {});
    if (isAdmin) {
      api('/api/dashboard').then(setData).catch((e) => setErr(e.message));
    } else {
      // Non-admins skip the metric dashboard entirely.
      setData({});
    }
    if (isDoctor) {
      api('/api/consultations/scheduled-appointments')
        .then((rows) => {
          const today = new Date();
          const filtered = (rows || [])
            .filter((a) => isSameDay(new Date(a.scheduled_at), today))
            .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
          setTodayAppts(filtered);
        })
        .catch(() => setTodayAppts([]));
    }
  }, [user, isAdmin, isDoctor]);

  const changePassword = async (e) => {
    e.preventDefault();
    setPwMsg('');
    if ((pw.next || '').length < 8) {
      setPwMsg('New password must be at least 8 characters.');
      return;
    }
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

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileMsg('');
    try {
      await api('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(profile),
      });
      await refreshUser();
      setProfileMsg('Profile updated.');
    } catch (ex) {
      setProfileMsg(ex.message);
    }
  };

  const ProfileCard = (
    <section className="hmis-card overflow-hidden">
      <div className="hmis-card-h">Personal details</div>
      <form onSubmit={saveProfile} className="grid gap-3 p-4 md:grid-cols-2">
        <div>
          <label className="hmis-label">First name</label>
          <input className="hmis-input" value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} required />
        </div>
        <div>
          <label className="hmis-label">Last name</label>
          <input className="hmis-input" value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} required />
        </div>
        <div>
          <label className="hmis-label">Phone</label>
          <input className="hmis-input" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
        </div>
        <div>
          <label className="hmis-label">Department</label>
          <input className="hmis-input" value={profile.department} onChange={(e) => setProfile({ ...profile, department: e.target.value })} />
        </div>
        <div className="md:col-span-2">
          <button type="submit" className="hmis-btn-primary">Save details</button>
          {profileMsg ? <span className="ml-3 text-xs text-slate-700">{profileMsg}</span> : null}
        </div>
      </form>
    </section>
  );

  const NotificationCard = (
    <section className="hmis-card overflow-hidden">
      <div className="hmis-card-h flex items-center justify-between">
        <span>Notifications</span>
        <Link to="/notifications" className="text-xs font-semibold text-clinical-700 hover:underline">View inbox</Link>
      </div>
      <ul className="divide-y divide-slate-100">
        {notifications.length ? notifications.map((n) => (
          <li key={n.id} className="px-4 py-3">
            <div className="text-sm font-medium text-slate-900">{n.subject}</div>
            <div className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.body}</div>
            <div className="mt-1 text-[11px] text-slate-500">{String(n.created_at || '').replace('T', ' ').slice(0, 16)}</div>
          </li>
        )) : (
          <li className="px-4 py-6 text-sm text-slate-500">No notifications yet.</li>
        )}
      </ul>
    </section>
  );

  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>;
  if (!data)
    return (
      <div className="flex items-center gap-3 text-slate-600">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-clinical-700" />
        Loading workspace…
      </div>
    );

  const greet = isDoctor
    ? `Dr. ${user?.lastName || user?.firstName}`
    : [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Colleague';

  // ---------- Non-admin layout ----------
  if (!isAdmin) {
    return (
      <div className="space-y-8">
        <header className="border-b border-slate-200 pb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Home</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Welcome back, {greet}</h1>
        </header>

        {isDoctor ? (
          <section className="hmis-card overflow-hidden">
            <div className="hmis-card-h">Today's upcoming consultations</div>
            {todayAppts === null ? (
              <p className="px-4 py-6 text-sm text-slate-600">Loading today's schedule…</p>
            ) : todayAppts.length ? (
              <ul className="divide-y divide-slate-100">
                {todayAppts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="font-mono text-xs text-slate-500">
                        {new Date(a.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="font-medium text-slate-900">
                        {a.pf} {a.pl}
                      </div>
                      <div className="text-xs text-slate-600">
                        {a.patient_number}
                        {a.reason ? ` · ${a.reason}` : ''}
                      </div>
                    </div>
                    <span className="hmis-badge hmis-badge-info capitalize">
                      {(a.visit_type || 'routine').replace(/_/g, ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-slate-500">No consultations scheduled for today.</p>
            )}
          </section>
        ) : null}

        {NotificationCard}

        {ProfileCard}

        <section className="hmis-card overflow-hidden">
          <div className="hmis-card-h">Change account password</div>
          <form onSubmit={changePassword} className="space-y-3 p-4">
            <div>
              <label className="hmis-label">Current password</label>
              <input type="password" autoComplete="current-password" className="hmis-input" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
            </div>
            <div>
              <label className="hmis-label">New password (min 8 characters)</label>
              <input type="password" autoComplete="new-password" className="hmis-input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={8} />
            </div>
            <button type="submit" className="hmis-btn-primary">
              Update password
            </button>
            {pwMsg ? <p className="text-xs text-slate-700">{pwMsg}</p> : null}
            <p className="text-xs text-slate-500">
              Signed in as <span className="font-mono text-slate-800">{session?.email || user?.email}</span>.
            </p>
          </form>
        </section>
      </div>
    );
  }

  // ---------- Admin layout (full dashboard) ----------
  const cards = [];
  if (data.patientsTotal != null) cards.push({ label: 'Registered patients', sub: 'Master patient index', value: data.patientsTotal });
  if (data.appointmentsUpcoming != null) cards.push({ label: 'Scheduled encounters', sub: 'From today forward', value: data.appointmentsUpcoming });
  if (data.pendingPrescriptions != null) cards.push({ label: 'Pharmacy queue', sub: 'Awaiting dispense', value: data.pendingPrescriptions });
  if (data.labOrdersOpen != null) cards.push({ label: 'Open lab work', sub: 'Ordered or in-progress', value: data.labOrdersOpen });
  if (data.lowStockItems != null) cards.push({ label: 'Low-stock alerts', sub: 'Below reorder point', value: data.lowStockItems });
  if (data.icuOccupied != null) cards.push({ label: 'ICU census', sub: 'Occupied beds', value: data.icuOccupied });

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Home</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Welcome back, {greet}</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Snapshot from registration, scheduling, clinical, pharmacy, billing, and facility systems.
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
        {NotificationCard}
        {ProfileCard}
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
            ) : null}
          </div>
        </section>

        <section className="hmis-card overflow-hidden">
          <div className="hmis-card-h">Change password</div>
          <form onSubmit={changePassword} className="space-y-3 p-4">
            <div>
              <label className="hmis-label">Current password</label>
              <input type="password" autoComplete="current-password" className="hmis-input" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
            </div>
            <div>
              <label className="hmis-label">New password (min 8 characters)</label>
              <input type="password" autoComplete="new-password" className="hmis-input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={8} />
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
