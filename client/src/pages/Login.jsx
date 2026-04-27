import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@hmis.local');
  const [password, setPassword] = useState('password');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (ex) {
      setErr(ex.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#eef1f5] lg:flex-row">
      {/* Left: dark panel — all text explicit (no white-on-white). */}
      <div className="relative flex flex-1 flex-col justify-center bg-gradient-to-br from-[#0f3d6b] via-[#0c2744] to-[#050d18] px-8 py-12 lg:max-w-[46%] lg:px-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M0 38.59l2.83-2.83 1.41 1.41L1.41 40H0v-1.41zM0 1.4l1.41 1.41-1.41 1.41V1.41zM0 20.4l1.41-1.41 1.41 1.41L0 22.82V20.4z'/%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        <div className="relative">
          <div className="mb-8 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#0f172a] shadow-lg ring-2 ring-white/30">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#bae6fd]">Metropolitan General Hospital</div>
              <div className="mt-0.5 text-xl font-bold tracking-tight text-white">HMIS — G3 services</div>
            </div>
          </div>
          <h1 className="max-w-md text-3xl font-bold leading-tight tracking-tight text-white lg:text-[2rem]">
            Secure access to the Hospital Management Information System.
          </h1>
          <ul className="mt-8 space-y-4 text-[15px] leading-relaxed text-[#e2e8f0]">
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4ade80]" aria-hidden />
              JWT-based sign-in with role-based access control (RBAC) across 38 modular services.
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4ade80]" aria-hidden />
              Centralized activity logging and audit trails for compliance and non-repudiation.
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4ade80]" aria-hidden />
              For authorized staff only — protect credentials as you would an ID badge.
            </li>
          </ul>
          <p className="mt-10 text-xs text-[#94a3b8]">© {new Date().getFullYear()} Metropolitan General Hospital. Internal use.</p>
        </div>
      </div>

      {/* Right: light card — dark text on white/off-white only. */}
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <div className="hmis-card w-full max-w-md border-slate-200 p-8 shadow-lg">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Staff sign in</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Use your HMIS credentials. Demo password:{' '}
              <code className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-sm font-semibold text-slate-900">password</code>
            </p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="hmis-label" htmlFor="email">
                Email or network ID
              </label>
              <input id="email" className="hmis-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </div>
            <div>
              <label className="hmis-label" htmlFor="password">
                Password
              </label>
              <input id="password" type="password" className="hmis-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            {err ? (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900" role="alert">
                {err}
              </div>
            ) : null}
            <button type="submit" disabled={busy} className="hmis-btn-primary w-full py-3 text-base text-white">
              {busy ? 'Authenticating…' : 'Continue to HMIS'}
            </button>
          </form>
            <p className="mt-6 border-t border-slate-200 pt-4 text-center text-xs text-slate-600">
            Demo accounts include <span className="font-mono">lab@hmis.local</span> (laboratory technician) — password as shown above. Trouble signing in? Contact IT Service Desk.
          </p>
        </div>
      </div>
    </div>
  );
}
