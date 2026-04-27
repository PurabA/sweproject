import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PdfServiceBlock from '../components/PdfServiceBlock.jsx';

/** `YYYY-MM-DD HH:mm` → value for datetime-local */
function slotToDatetimeLocal(slot) {
  return String(slot).trim().replace(' ', 'T').slice(0, 16);
}

/** Keep wall-clock from datetime-local (avoid UTC shift from toISOString). */
function datetimeLocalToSqlDateTime(dtLocal) {
  if (!dtLocal || dtLocal.length < 16) return dtLocal;
  return `${dtLocal.slice(0, 10)} ${dtLocal.slice(11, 16)}:00`;
}

export default function AppointmentsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({ patientId: '', doctorId: '', scheduledAt: '', reason: '', visitType: 'routine' });
  const [availDoctor, setAvailDoctor] = useState('');
  const [availDate, setAvailDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const [follow, setFollow] = useState({ patientId: '', doctorId: '', parentAppointmentId: '', scheduledAt: '', reason: '' });
  const [msg, setMsg] = useState('');

  const canCreate = ['admin', 'receptionist'].includes(user?.role);
  const canDoctorOps = ['admin', 'receptionist', 'doctor'].includes(user?.role);

  const load = () => api('/api/appointments').then(setRows).catch((e) => setMsg(e.message));

  useEffect(() => {
    load();
    api('/api/dashboard/doctors').then(setDoctors).catch(() => {});
    // Page is admin/receptionist only (route-guarded), so always full patient list.
    api('/api/patients').then(setPatients).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          patientId: Number(form.patientId),
          doctorId: Number(form.doctorId),
          scheduledAt: datetimeLocalToSqlDateTime(form.scheduledAt),
          reason: form.reason,
          visitType: form.visitType,
        }),
      });
      setForm({ patientId: '', doctorId: '', scheduledAt: '', reason: '', visitType: 'routine' });
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const loadAvailability = async () => {
    setMsg('');
    if (!availDoctor || !availDate) return setMsg('Select physician and date.');
    try {
      const data = await api(`/api/appointments/availability?doctorId=${availDoctor}&date=${availDate}`);
      setSlots(data.slotsAvailable || []);
      setSlotsLoaded(true);
    } catch (ex) {
      setSlotsLoaded(false);
      setMsg(ex.message);
    }
  };

  const applySlotToBooking = (slot) => {
    if (!canCreate) return;
    setForm((prev) => ({
      ...prev,
      doctorId: String(availDoctor),
      scheduledAt: slotToDatetimeLocal(slot),
    }));
    setMsg('');
  };

  const reschedule = async (id, currentIsoLocal) => {
    const next = window.prompt(
      'New date/time on the hour or half-hour (YYYY-MM-DD HH:MM), within 08:00–16:30',
      currentIsoLocal?.replace('T', ' ').slice(0, 16)
    );
    if (!next) return;
    setMsg('');
    try {
      const normalized = next.trim().replace('T', ' ');
      await api(`/api/appointments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ scheduledAt: normalized.length === 16 ? `${normalized}:00` : normalized }),
      });
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const cancelAppt = async (id) => {
    const reason = window.prompt('Cancellation reason (required for AP-4)', 'Schedule conflict');
    if (reason == null) return;
    await api(`/api/appointments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled', cancellationReason: reason }),
    });
    load();
  };

  const submitFollowUp = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api('/api/appointments/follow-up', {
        method: 'POST',
        body: JSON.stringify({
          patientId: Number(follow.patientId),
          doctorId: user?.role === 'doctor' ? undefined : Number(follow.doctorId),
          parentAppointmentId: Number(follow.parentAppointmentId),
          scheduledAt: datetimeLocalToSqlDateTime(follow.scheduledAt),
          reason: follow.reason,
        }),
      });
      setFollow({ patientId: '', doctorId: '', parentAppointmentId: '', scheduledAt: '', reason: '' });
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">HMIS — Appointment &amp; Scheduling domain</p>
        <h1 className="hmis-page-title">Appointments &amp; scheduling</h1>
        <p className="hmis-page-desc">Book visits in open 30-minute blocks; manage follow-ups, reschedules, and cancellations from the schedule below.</p>
      </header>
      {msg ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div> : null}

      <PdfServiceBlock
        code="AP-2"
        title="Doctor Availability Check"
        description="Preview same-day 30-minute capacity for a clinician before confirming a visit."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="hmis-select"
            value={availDoctor}
            onChange={(e) => {
              setAvailDoctor(e.target.value);
              setSlots([]);
              setSlotsLoaded(false);
            }}
          >
            <option value="">Physician…</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.last_name}, {d.first_name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="hmis-input"
            value={availDate}
            onChange={(e) => {
              setAvailDate(e.target.value);
              setSlots([]);
              setSlotsLoaded(false);
            }}
          />
          <button type="button" className="hmis-btn-secondary" onClick={loadAvailability}>
            Compute open slots
          </button>
        </div>
        {availDoctor && availDate && !slotsLoaded ? (
          <p className="mt-4 text-sm text-slate-600">Choose a physician and date, then click <strong>Compute open slots</strong> to see bookable times.</p>
        ) : null}
        {availDoctor && availDate && slotsLoaded ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-sm font-medium text-slate-800">Open 30-minute slots</p>
            <p className="mt-0.5 text-xs text-slate-600">Click a time to fill the booking form (provider and start time).</p>
            {slots.length ? (
              <ul className="mt-3 flex flex-wrap gap-2" role="list">
                {slots.map((slot) => (
                  <li key={slot}>
                    <button
                      type="button"
                      className="rounded-md border border-emerald-700/30 bg-white px-3 py-2 text-sm font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-600 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                      onClick={() => applySlotToBooking(slot)}
                      disabled={!canCreate}
                    >
                      {slot.replace(' ', ' · ')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm font-medium text-amber-900">No open slots that day for this physician — try another date.</p>
            )}
          </div>
        ) : null}
      </PdfServiceBlock>

      {canCreate ? (
        <PdfServiceBlock
          code="AP-1"
          title="Appointment Booking"
          description="Times must fall on the hour or half-hour between 08:00 and 16:30 and cannot overlap another scheduled visit for that provider."
        >
          <form onSubmit={create} className="grid gap-4 p-0 md:grid-cols-2">
            <div>
              <label className="hmis-label">Patient</label>
              <select required className="hmis-select" value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
                <option value="">Select patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.patient_number} — {p.first_name} {p.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hmis-label">Rendering provider</label>
              <select required className="hmis-select" value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
                <option value="">Select physician…</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.last_name}, {d.first_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hmis-label">Date &amp; time</label>
              <input required type="datetime-local" step={1800} className="hmis-input" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
              <p className="mt-1 text-xs text-slate-500">Use an open slot from the availability check above, or another valid half-hour start.</p>
            </div>
            <div>
              <label className="hmis-label">Visit type</label>
              <select className="hmis-select" value={form.visitType} onChange={(e) => setForm({ ...form, visitType: e.target.value })}>
                <option value="routine">Routine</option>
                <option value="follow_up">Follow-up</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="hmis-label">Chief complaint / reason</label>
              <input className="hmis-input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <button type="submit" className="hmis-btn-primary">
                Schedule encounter
              </button>
            </div>
          </form>
        </PdfServiceBlock>
      ) : null}

      <PdfServiceBlock
        code="CW-5 (scheduling)"
        title="Follow-up Scheduling"
        description="Book a return visit linked to a prior appointment (visit_type follow-up, rescheduled_from_id)."
      >
        {canCreate || user?.role === 'doctor' ? (
          <form onSubmit={submitFollowUp} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="hmis-label">Patient</label>
              <select required className="hmis-select" value={follow.patientId} onChange={(e) => setFollow({ ...follow, patientId: e.target.value })}>
                <option value="">Select…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.patient_number} — {p.first_name} {p.last_name}
                  </option>
                ))}
              </select>
            </div>
            {user?.role === 'doctor' ? null : (
              <div>
                <label className="hmis-label">Physician</label>
                <select required className="hmis-select" value={follow.doctorId} onChange={(e) => setFollow({ ...follow, doctorId: e.target.value })}>
                  <option value="">Select…</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.last_name}, {d.first_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="hmis-label">Prior appointment ID</label>
              <input required className="hmis-input font-mono text-sm" value={follow.parentAppointmentId} onChange={(e) => setFollow({ ...follow, parentAppointmentId: e.target.value })} />
            </div>
            <div>
              <label className="hmis-label">Follow-up date &amp; time</label>
              <input required type="datetime-local" step={1800} className="hmis-input" value={follow.scheduledAt} onChange={(e) => setFollow({ ...follow, scheduledAt: e.target.value })} />
              <p className="mt-1 text-xs text-slate-500">Same session rules: half-hour starts, 08:00–16:30, no double-booking.</p>
            </div>
            <div className="md:col-span-2">
              <label className="hmis-label">Reason</label>
              <input className="hmis-input" value={follow.reason} onChange={(e) => setFollow({ ...follow, reason: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <button type="submit" className="hmis-btn-secondary">
                Book follow-up
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-600">Follow-up booking is available to physicians and registration staff.</p>
        )}
      </PdfServiceBlock>

      <section className="hmis-table-wrap">
        <div className="hmis-card-h">Appointments</div>
        <div className="overflow-x-auto">
          <table className="hmis-table">
            <thead className="hmis-thead">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Date / time</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="hmis-tbody">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{a.id}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-800">{String(a.scheduled_at).replace('T', ' ').slice(0, 16)}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-clinical-800">{a.patient_number}</span>
                    <span className="text-slate-600">
                      {' '}
                      {a.patient_first_name} {a.patient_last_name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {a.doc_last_name}, {a.doc_first_name}
                  </td>
                  <td className="px-4 py-3 text-xs capitalize text-slate-700">{a.visit_type?.replace(/_/g, ' ') || 'routine'}</td>
                  <td className="px-4 py-3">
                    <span className="hmis-badge hmis-badge-info">{a.status}</span>
                    {a.cancellation_reason ? <div className="mt-1 text-xs text-rose-800">{a.cancellation_reason}</div> : null}
                  </td>
                  <td className="space-y-1 px-4 py-3 text-right text-xs">
                    {canDoctorOps && a.status === 'scheduled' ? (
                      <>
                        <button type="button" className="hmis-link block w-full" onClick={() => reschedule(a.id, a.scheduled_at)}>
                          Reschedule
                        </button>
                        <button type="button" className="block w-full text-left text-rose-700 hover:underline" onClick={() => cancelAppt(a.id)}>
                          Cancel with reason
                        </button>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
