import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import DashboardHome from './pages/DashboardHome.jsx';
import PatientsPage from './pages/PatientsPage.jsx';
import AppointmentsPage from './pages/AppointmentsPage.jsx';
import ClinicalPage from './pages/ClinicalPage.jsx';
import BillingPage from './pages/BillingPage.jsx';
import PharmacyPage from './pages/PharmacyPage.jsx';
import FacilityPage from './pages/FacilityPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100">
        <span className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-clinical-700" aria-hidden />
        <p className="text-sm font-medium text-slate-800">Loading clinical workspace…</p>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/**
 * Route-level RBAC. Centralizing this here means individual pages no longer carry
 * dead role-guard code (which previously caused React hooks-rules violations
 * because the early `return` ran before the page's other useState/useEffect calls).
 */
function RoleGate({ allow, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<DashboardHome />} />

        {/* Patients & appointments are not part of the doctor workflow — they're handled
            by Registration. Doctors get redirected home if they hit these URLs directly. */}
        <Route
          path="patients"
          element={
            <RoleGate allow={['admin', 'receptionist', 'pharmacist', 'lab']}>
              <PatientsPage />
            </RoleGate>
          }
        />
        <Route
          path="appointments"
          element={
            <RoleGate allow={['admin', 'receptionist']}>
              <AppointmentsPage />
            </RoleGate>
          }
        />

        <Route
          path="clinical"
          element={
            <RoleGate allow={['admin', 'doctor', 'pharmacist', 'lab']}>
              <ClinicalPage />
            </RoleGate>
          }
        />
        <Route
          path="billing"
          element={
            <RoleGate allow={['admin', 'receptionist', 'doctor']}>
              <BillingPage />
            </RoleGate>
          }
        />
        <Route
          path="pharmacy"
          element={
            <RoleGate allow={['admin', 'pharmacist', 'doctor']}>
              <PharmacyPage />
            </RoleGate>
          }
        />
        <Route
          path="facility"
          element={
            <RoleGate allow={['admin', 'doctor', 'receptionist']}>
              <FacilityPage />
            </RoleGate>
          }
        />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route
          path="admin"
          element={
            <RoleGate allow={['admin']}>
              <AdminPage />
            </RoleGate>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
