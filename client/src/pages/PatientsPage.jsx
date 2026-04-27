import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PdfServiceBlock from '../components/PdfServiceBlock.jsx';

const SEARCH_PREVIEW_ROWS = 3;

function emptyEditForm() {
  return {
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: 'unknown',
    phone: '',
    email: '',
    address: '',
    bloodGroup: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    insuranceProvider: '',
    insurancePolicyNumber: '',
    insuranceGroupNumber: '',
  };
}

function mapPatientToEditForm(p) {
  if (!p) return emptyEditForm();
  return {
    firstName: p.first_name ?? '',
    lastName: p.last_name ?? '',
    dateOfBirth: p.date_of_birth ? String(p.date_of_birth).slice(0, 10) : '',
    gender: p.gender ?? 'unknown',
    phone: p.phone ?? '',
    email: p.email ?? '',
    address: p.address ?? '',
    bloodGroup: p.blood_group ?? '',
    emergencyContactName: p.emergency_contact_name ?? '',
    emergencyContactPhone: p.emergency_contact_phone ?? '',
    insuranceProvider: p.insurance_provider ?? '',
    insurancePolicyNumber: p.insurance_policy_number ?? '',
    insuranceGroupNumber: p.insurance_group_number ?? '',
  };
}

/** API may return camelCase keys; rows use snake_case from MySQL. */
function normalizeHistoryPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return { consultations: [], labOrders: [], prescriptions: [], appointments: [] };
  }
  const consultations = Array.isArray(raw.consultations) ? raw.consultations : [];
  const labOrders = Array.isArray(raw.labOrders) ? raw.labOrders : Array.isArray(raw.lab_orders) ? raw.lab_orders : [];
  const prescriptions = Array.isArray(raw.prescriptions)
    ? raw.prescriptions
    : Array.isArray(raw.prescription)
      ? raw.prescription
      : [];
  const appointments = Array.isArray(raw.appointments) ? raw.appointments : [];
  return { consultations, labOrders, prescriptions, appointments };
}

export default function PatientsPage() {
  const { user } = useAuth();
  const canEdit = ['admin', 'receptionist'].includes(user?.role);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyEditForm());
  const [editPatientId, setEditPatientId] = useState('');
  const [editForm, setEditForm] = useState(emptyEditForm());
  const [editLoading, setEditLoading] = useState(false);
  const [historyId, setHistoryId] = useState('');
  const [history, setHistory] = useState(null);
  const [msg, setMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const load = () => {
    setMsg('');
    const url = q ? `/api/patients?q=${encodeURIComponent(q)}` : '/api/patients';
    api(url)
      .then(setRows)
      .catch((e) => setMsg(e.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editPatientId) {
      setEditForm(emptyEditForm());
      setEditLoading(false);
      return;
    }
    let cancelled = false;
    setEditLoading(true);
    setMsg('');
    api(`/api/patients/${editPatientId}`)
      .then((p) => {
        if (!cancelled) {
          setEditForm(mapPatientToEditForm(p));
          setEditLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setMsg(e.message);
          setEditLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [editPatientId]);

  const create = async (e) => {
    e.preventDefault();
    setMsg('');
    setSuccessMsg('');
    try {
      await api('/api/patients', { method: 'POST', body: JSON.stringify(form) });
      setForm(emptyEditForm());
      setSuccessMsg('Patient registered.');
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setMsg('');
    setSuccessMsg('');
    if (!editPatientId) {
      setMsg('Select a patient to edit.');
      return;
    }
    try {
      await api(`/api/patients/${editPatientId}`, { method: 'PATCH', body: JSON.stringify(editForm) });
      setSuccessMsg('Patient updated.');
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const loadHistory = async () => {
    setMsg('');
    setSuccessMsg('');
    if (!historyId) {
      setMsg('Select a patient for history.');
      return;
    }
    try {
      const raw = await api(`/api/patients/${encodeURIComponent(historyId)}/history`);
      setHistory(normalizeHistoryPayload(raw));
    } catch (ex) {
      setMsg(ex.message);
      setHistory(null);
    }
  };

  const previewRows = rows.slice(0, SEARCH_PREVIEW_ROWS);
  const othersCount = Math.max(0, rows.length - SEARCH_PREVIEW_ROWS);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Patient access</p>
          <h1 className="hmis-page-title">Patient management</h1>
          <p className="hmis-page-desc">Search the master index, register new patients, update existing records, and view clinical history.</p>
        </div>
        <div className="flex gap-2">
          <input
            className="hmis-input w-56 sm:w-64"
            placeholder="MRN, name, or phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <button type="button" onClick={load} className="hmis-btn-primary">
            Search
          </button>
        </div>
      </header>

      {msg ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div> : null}
      {successMsg ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{successMsg}</div> : null}

      <section className="hmis-table-wrap">
        <div className="hmis-card-h">Search results</div>
        <div className="overflow-x-auto">
          <table className="hmis-table">
            <thead className="hmis-thead">
              <tr>
                <th className="px-4 py-3">MRN</th>
                <th className="px-4 py-3">Patient name</th>
                <th className="px-4 py-3">DOB</th>
                <th className="px-4 py-3">Phone</th>
              </tr>
            </thead>
            <tbody className="hmis-tbody">
              {previewRows.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-sm font-medium text-clinical-800">{p.patient_number}</td>
                  <td className="px-4 py-3 font-medium">
                    {p.first_name} {p.last_name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.date_of_birth?.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-slate-600">{p.phone || '—'}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    No patients match. Try another search or clear filters and search again.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {rows.length > SEARCH_PREVIEW_ROWS ? (
          <p className="border-t border-slate-100 px-4 py-3 text-center text-sm text-slate-600">
            And <span className="font-semibold tabular-nums text-slate-900">{othersCount}</span> other{' '}
            {othersCount === 1 ? 'patient' : 'patients'} not shown in this preview — narrow your search to see them here, or use the dropdowns below
            (edit / history) which list everyone in the current result set.
          </p>
        ) : rows.length > 0 ? (
          <p className="border-t border-slate-100 px-4 py-3 text-center text-xs text-slate-500">Showing all {rows.length} matching patients.</p>
        ) : null}
      </section>

      {canEdit ? (
        <PdfServiceBlock code="PM-1" title="Add new patient" description="Register a new record with demographics and emergency contacts.">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="hmis-label">Legal first name</label>
              <input required className="hmis-input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label className="hmis-label">Legal last name</label>
              <input required className="hmis-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div>
              <label className="hmis-label">Date of birth</label>
              <input required type="date" className="hmis-input" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
            </div>
            <div>
              <label className="hmis-label">Gender</label>
              <select className="hmis-select" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="unknown">Not specified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="hmis-label">Phone</label>
              <input className="hmis-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="hmis-label">Email</label>
              <input type="email" className="hmis-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="hmis-label">Address</label>
              <input className="hmis-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className="hmis-label">Blood group</label>
              <input className="hmis-input" value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })} />
            </div>
            <div className="sm:col-span-2 hmis-divider pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Emergency contact</p>
            </div>
            <div>
              <label className="hmis-label">Emergency contact name</label>
              <input className="hmis-input" value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} />
            </div>
            <div>
              <label className="hmis-label">Emergency contact phone</label>
              <input className="hmis-input" value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} />
            </div>
            <div className="sm:col-span-2 hmis-divider pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Insurance (optional)</p>
            </div>
            <div>
              <label className="hmis-label">Insurance provider</label>
              <input className="hmis-input" value={form.insuranceProvider} onChange={(e) => setForm({ ...form, insuranceProvider: e.target.value })} />
            </div>
            <div>
              <label className="hmis-label">Policy number</label>
              <input className="hmis-input" value={form.insurancePolicyNumber} onChange={(e) => setForm({ ...form, insurancePolicyNumber: e.target.value })} />
            </div>
            <div>
              <label className="hmis-label">Group number</label>
              <input className="hmis-input" value={form.insuranceGroupNumber} onChange={(e) => setForm({ ...form, insuranceGroupNumber: e.target.value })} />
            </div>
            <div className="flex items-end sm:col-span-2 lg:col-span-3">
              <button type="submit" className="hmis-btn-primary">
                Register &amp; assign MRN
              </button>
            </div>
          </form>
        </PdfServiceBlock>
      ) : null}

      {canEdit ? (
        <PdfServiceBlock code="PM-2" title="Edit existing patient" description="Choose a patient from the current search results; their chart demographics load automatically for you to update.">
          <form onSubmit={saveEdit} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="hmis-label">Patient</label>
              <select
                className="hmis-select max-w-xl"
                value={editPatientId}
                onChange={(e) => {
                  setEditPatientId(e.target.value);
                  setSuccessMsg('');
                }}
              >
                <option value="">Select patient to edit…</option>
                {rows.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.patient_number} — {p.first_name} {p.last_name}
                  </option>
                ))}
              </select>
              {editLoading ? <p className="mt-2 text-xs text-slate-500">Loading patient…</p> : null}
            </div>
            {editPatientId && !editLoading ? (
              <>
                <div>
                  <label className="hmis-label">First name</label>
                  <input className="hmis-input" value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="hmis-label">Last name</label>
                  <input className="hmis-input" value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
                </div>
                <div>
                  <label className="hmis-label">DOB</label>
                  <input type="date" className="hmis-input" value={editForm.dateOfBirth} onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })} />
                </div>
                <div>
                  <label className="hmis-label">Gender</label>
                  <select className="hmis-select" value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}>
                    <option value="unknown">Not specified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="hmis-label">Phone</label>
                  <input className="hmis-input" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
                <div>
                  <label className="hmis-label">Email</label>
                  <input className="hmis-input" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="hmis-label">Address</label>
                  <input className="hmis-input" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
                </div>
                <div>
                  <label className="hmis-label">Blood group</label>
                  <input className="hmis-input" value={editForm.bloodGroup} onChange={(e) => setEditForm({ ...editForm, bloodGroup: e.target.value })} />
                </div>
                <div>
                  <label className="hmis-label">Emergency contact name</label>
                  <input className="hmis-input" value={editForm.emergencyContactName} onChange={(e) => setEditForm({ ...editForm, emergencyContactName: e.target.value })} />
                </div>
                <div>
                  <label className="hmis-label">Emergency contact phone</label>
                  <input className="hmis-input" value={editForm.emergencyContactPhone} onChange={(e) => setEditForm({ ...editForm, emergencyContactPhone: e.target.value })} />
                </div>
                <div className="md:col-span-2 hmis-divider pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Insurance</p>
                </div>
                <div>
                  <label className="hmis-label">Provider</label>
                  <input className="hmis-input" value={editForm.insuranceProvider} onChange={(e) => setEditForm({ ...editForm, insuranceProvider: e.target.value })} />
                </div>
                <div>
                  <label className="hmis-label">Policy number</label>
                  <input className="hmis-input" value={editForm.insurancePolicyNumber} onChange={(e) => setEditForm({ ...editForm, insurancePolicyNumber: e.target.value })} />
                </div>
                <div>
                  <label className="hmis-label">Group number</label>
                  <input className="hmis-input" value={editForm.insuranceGroupNumber} onChange={(e) => setEditForm({ ...editForm, insuranceGroupNumber: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <button type="submit" className="hmis-btn-primary">
                    Save changes
                  </button>
                </div>
              </>
            ) : null}
          </form>
        </PdfServiceBlock>
      ) : null}

      <PdfServiceBlock code="PM-4" title="Patient history" description="Consultations, lab orders, and prescriptions for the selected patient (from the current search list).">
        <div className="flex flex-wrap gap-2">
          <select
            className="hmis-select max-w-md"
            value={historyId}
            onChange={(e) => {
              setHistoryId(e.target.value);
              setHistory(null);
            }}
          >
            <option value="">Select patient…</option>
            {rows.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.patient_number} — {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
          <button type="button" className="hmis-btn-secondary" onClick={loadHistory}>
            Load history
          </button>
        </div>
        {history ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm">
              <h3 className="text-xs font-bold uppercase text-slate-600">Consultations</h3>
              <ul className="mt-2 space-y-2">
                {history.consultations.map((c) => (
                  <li key={c.id} className="border-b border-slate-200/80 pb-2 last:border-0">
                    <span className="font-medium text-slate-900">{c.chief_complaint || 'Visit'}</span>
                    <span className="block text-xs text-slate-600">
                      {c.doctor_first} {c.doctor_last} · {String(c.created_at ?? '').slice(0, 16)}
                      {c.is_emergency ? <span className="ml-2 font-semibold text-rose-700">Emergency</span> : null}
                      {c.triage_level ? <span className="ml-2 text-sky-800">Triage: {c.triage_level}</span> : null}
                    </span>
                  </li>
                ))}
                {!history.consultations.length ? <li className="text-slate-500">No consultations on file.</li> : null}
              </ul>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm">
              <h3 className="text-xs font-bold uppercase text-slate-600">Laboratory</h3>
              <ul className="mt-2 space-y-2">
                {history.labOrders.map((l) => {
                  const testName = l.test_name ?? l.testName ?? 'Test';
                  const status = l.status ?? '—';
                  const by = [l.ordered_by_first, l.ordered_by_last].filter(Boolean).join(' ');
                  return (
                    <li key={l.id} className="border-b border-slate-200/80 pb-2 text-slate-800 last:border-0">
                      <span className="font-medium">{testName}</span>
                      <span className="ml-2 capitalize text-slate-600">{String(status).replace(/_/g, ' ')}</span>
                      {by ? <span className="mt-0.5 block text-xs text-slate-500">Ordered by {by}</span> : null}
                      {l.result_notes ? <span className="mt-1 block text-xs text-slate-600">{l.result_notes}</span> : null}
                    </li>
                  );
                })}
                {!history.labOrders.length ? <li className="text-slate-500">No lab orders on file.</li> : null}
              </ul>
              <h3 className="mt-4 text-xs font-bold uppercase text-slate-600">Medications</h3>
              <ul className="mt-2 space-y-2">
                {history.prescriptions.map((r) => {
                  const med = r.medication_name ?? r.medicationName ?? 'Medication';
                  const status = r.status ?? '—';
                  const by = [r.rx_first, r.rx_last].filter(Boolean).join(' ');
                  return (
                    <li key={r.id} className="border-b border-slate-200/80 pb-2 text-slate-800 last:border-0">
                      <span className="font-medium">{med}</span>
                      <span className="ml-2 capitalize text-slate-600">{status}</span>
                      {r.dosage ? <span className="mt-0.5 block text-xs text-slate-600">{r.dosage}</span> : null}
                      {by ? <span className="mt-0.5 block text-xs text-slate-500">Prescriber: {by}</span> : null}
                    </li>
                  );
                })}
                {!history.prescriptions.length ? <li className="text-slate-500">No prescriptions on file.</li> : null}
              </ul>
            </div>
          </div>
        ) : null}
      </PdfServiceBlock>
    </div>
  );
}
