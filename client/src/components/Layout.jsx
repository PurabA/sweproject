import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const iconCls = 'h-[1.125rem] w-[1.125rem] shrink-0 stroke-[2] text-current';

const icons = {
  dashboard: (
    <svg className={iconCls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 8.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25A2.25 2.25 0 0113.5 8.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  patients: (
    <svg className={iconCls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm5.25 0a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z" />
    </svg>
  ),
  calendar: (
    <svg className={iconCls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5" />
    </svg>
  ),
  clinical: (
    <svg className={iconCls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.571.393a9.065 9.065 0 01-6.59 0L10.5 15.3m9.3-9.3l1.036 2.864a9.065 9.065 0 01-6.59 0L5.25 15.3" />
    </svg>
  ),
  billing: (
    <svg className={iconCls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125H18.75v-.75m0 7.5h2.25m-3.75-3.75h.375c.621 0 1.125-.504 1.125-1.125v-9.75c0-.621-.504-1.125-1.125-1.125h-.375m0 12.75h.375c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-.375m-1.5 0H18.75m-12 0h.375c.621 0 1.125-.504 1.125-1.125v-9.75c0-.621-.504-1.125-1.125-1.125h-.375m0 12.75H5.25m-3.75-12h9.75m-9.75 9h9m-9-4.5h4.5M9.75 18h7.5" />
    </svg>
  ),
  pharmacy: (
    <svg className={iconCls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  ),
  facility: (
    <svg className={iconCls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  notifications: (
    <svg className={iconCls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9a6 6 0 00-12 0v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  ),
  admin: (
    <svg className={iconCls} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

/** Explicit colors: active = dark text on white (never inherit `text-white` from parent). */
const linkClass = ({ isActive }) =>
  [
    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] leading-snug transition-colors duration-150',
    isActive
      ? 'bg-white font-semibold text-slate-900 shadow-md ring-1 ring-slate-200'
      : 'font-medium text-[#e2e8f0] hover:bg-white/10 hover:text-white',
  ].join(' ');

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;

  const nav = [
    { to: '/', label: 'Dashboard', icon: 'dashboard', show: true },
    { to: '/patients', label: 'Patient management', icon: 'patients', show: ['admin', 'receptionist', 'pharmacist', 'lab'].includes(role) },
    { to: '/appointments', label: 'Appointments & scheduling', icon: 'calendar', show: ['admin', 'receptionist'].includes(role) },
    { to: '/clinical', label: 'Clinical workflow', icon: 'clinical', show: ['admin', 'doctor', 'pharmacist', 'lab'].includes(role) },
    { to: '/billing', label: 'Billing & financial', icon: 'billing', show: ['admin', 'receptionist', 'doctor'].includes(role) },
    { to: '/pharmacy', label: 'Pharmacy & inventory', icon: 'pharmacy', show: ['admin', 'pharmacist', 'doctor'].includes(role) },
    { to: '/facility', label: 'Emergency & care', icon: 'facility', show: ['admin', 'doctor', 'receptionist'].includes(role) },
    { to: '/notifications', label: 'Notifications', icon: 'notifications', show: ['admin', 'doctor', 'receptionist', 'pharmacist', 'lab'].includes(role) },
    { to: '/admin', label: 'Security & administration', icon: 'admin', show: role === 'admin' },
  ];

  const roleLabel = {
    admin: 'Administrator',
    doctor: 'Physician',
    receptionist: 'Registration',
    pharmacist: 'Pharmacy',
    lab: 'Laboratory',
  };

  return (
    <div className="flex h-screen min-h-0 overflow-hidden">
      {/* Viewport-height shell: main scrolls; aside always full height (no gap when content is tall). */}
      <aside className="flex h-full min-h-0 w-72 shrink-0 flex-col border-r border-slate-600/90 bg-[#0b1628] shadow-[4px_0_24px_rgba(8,25,49,0.35)]">
        <div className="shrink-0 border-b border-white/10 bg-[#081222] px-5 py-5">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#0f172a] shadow-md">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="min-w-0 pt-0.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#bae6fd]">Metropolitan General</div>
              <div className="mt-0.5 text-lg font-bold leading-tight tracking-tight text-white">HMIS</div>
              <p className="mt-1 text-[13px] leading-snug text-[#cbd5e1]">Hospital Management Information System</p>
            </div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-3" aria-label="Main navigation">
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#93c5fd]">Menu</p>
          {nav
            .filter((n) => n.show)
            .map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={linkClass}>
                {icons[n.icon]}
                <span className="min-w-0 flex-1">{n.label}</span>
              </NavLink>
            ))}
        </nav>

        <div className="shrink-0 border-t border-white/10 bg-[#081222] p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="truncate text-xs text-[#cbd5e1]">{user?.department || '—'}</div>
            </div>
            <span className="shrink-0 rounded-md border border-white/25 bg-[#1e3a5f] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#f1f5f9]">
              {roleLabel[role] || role}
            </span>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="mt-3 w-full rounded-lg border border-white/30 bg-[#1e3a5f] py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#254a75]"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[3.25rem] shrink-0 items-center justify-between border-b border-slate-200/90 bg-white px-6 shadow-[0_1px_0_rgba(15,41,66,0.06)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]" aria-hidden />
            <span className="hidden sm:inline">Session active</span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto bg-[#eef1f5] p-6 text-slate-900 lg:p-9">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
