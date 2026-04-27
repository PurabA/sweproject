import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import PdfServiceBlock from '../components/PdfServiceBlock.jsx';

function bedPill(status) {
  const s = (status || '').toLowerCase();
  if (s === 'available') return 'hmis-pill hmis-pill-emerald';
  if (s === 'occupied') return 'hmis-pill hmis-pill-rose';
  if (s === 'cleaning' || s === 'reserved') return 'hmis-pill hmis-pill-amber';
  return 'hmis-pill hmis-pill-slate';
}

export default function FacilityPage() {
  const { user } = useAuth();
  const [beds, setBeds] = useState([]);
  const [team, setTeam] = useState([]);
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [surgeries, setSurgeries] = useState([]);
  const [book, setBook] = useState({ requestId: '', icuBedId: '' });
  const [adm, setAdm] = useState({
    patientId: '',
    doctorId: '',
    chiefComplaint: '',
    diagnosis: '',
    triageLevel: 'urgent',
    icuBedId: '',
    bedNotes: '',
  });
  const [msg, setMsg] = useState('');

  const load = () => {
    api('/api/icu-beds').then(setBeds).catch((e) => setMsg(e.message));
    api('/api/emergency-team').then(setTeam).catch(() => {});
    api('/api/surgeries?upcoming=1').then(setSurgeries).catch(() => {});
  };

  useEffect(() => {
    load();
    const patientsPath = user?.role === 'doctor' ? '/api/patients/assigned' : '/api/patients';
    api(patientsPath).then(setPatients).catch(() => {});
    api('/api/dashboard/doctors').then(setDoctors).catch(() => {});
  }, []);

  const setBed = async (id, status) => {
    await api(`/api/icu-beds/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    load();
  };

  const submitEmergency = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api('/api/emergency-admissions', {
        method: 'POST',
        body: JSON.stringify({
          patientId: Number(adm.patientId),
          doctorId: user?.role === 'doctor' ? undefined : Number(adm.doctorId),
          chiefComplaint: adm.chiefComplaint,
          diagnosis: adm.diagnosis,
          triageLevel: adm.triageLevel,
          icuBedId: adm.icuBedId ? Number(adm.icuBedId) : undefined,
          bedNotes: adm.bedNotes || undefined,
        }),
      });
      setAdm({
        patientId: '',
        doctorId: '',
        chiefComplaint: '',
        diagnosis: '',
        triageLevel: 'urgent',
        icuBedId: '',
        bedNotes: '',
      });
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const bookIcu = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api(`/api/surgeries/${Number(book.requestId)}/book-icu`, {
        method: 'PATCH',
        body: JSON.stringify({ icuBedId: Number(book.icuBedId) }),
      });
      setBook({ requestId: '', icuBedId: '' });
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">HMIS — Emergency &amp; Care domain</p>
        <h1 className="hmis-page-title">Emergency &amp; care</h1>
        <p className="hmis-page-desc">ICU bed management, rapid emergency admission encounters, and triage metadata aligned with the facility module.</p>
      </header>
      {msg ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div> : null}

      {user?.role === 'doctor' ? (
        <PdfServiceBlock
          code="EC (doctor)"
          title="My surgeries with ICU booking"
          description="Shows surgeries where Receptionist has booked an ICU bed for your patient."
        >
          <div className="overflow-x-auto">
            <table className="hmis-table">
              <thead className="hmis-thead">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">ICU bed</th>
                </tr>
              </thead>
              <tbody className="hmis-tbody">
                {surgeries
                  .filter((s) => s.status === 'icu_booked' && new Date(s.surgery_scheduled_at) >= new Date())
                  .sort((a, b) => new Date(a.surgery_scheduled_at) - new Date(b.surgery_scheduled_at))
                  .slice(0, 50)
                  .map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{new Date(s.surgery_scheduled_at).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-clinical-800">{s.patient_number}</span>
                        <span className="block text-sm text-slate-600">
                          {s.pf} {s.pl}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-800">{s.surgery_notes || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{s.bed_code || '—'}</td>
                    </tr>
                  ))}
                {!surgeries.filter((s) => s.status === 'icu_booked' && new Date(s.surgery_scheduled_at) >= new Date()).length ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-slate-500" colSpan={4}>
                      No ICU-booked surgeries yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </PdfServiceBlock>
      ) : (
      <PdfServiceBlock code="EC-2 / EC-3" title="Emergency admission &amp; triage assignment" description="Creates an emergency-flagged consultation with triage level; optionally assigns an ICU bed.">
        <form onSubmit={submitEmergency} className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="hmis-label">Patient</label>
            <select required className="hmis-select" value={adm.patientId} onChange={(e) => setAdm({ ...adm, patientId: e.target.value })}>
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
              <label className="hmis-label">Attending physician</label>
              <select required className="hmis-select" value={adm.doctorId} onChange={(e) => setAdm({ ...adm, doctorId: e.target.value })}>
                <option value="">Select…</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.last_name}, {d.first_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="md:col-span-2">
            <label className="hmis-label">Chief complaint</label>
            <input required className="hmis-input" value={adm.chiefComplaint} onChange={(e) => setAdm({ ...adm, chiefComplaint: e.target.value })} />
          </div>
          <div>
            <label className="hmis-label">Working diagnosis</label>
            <input className="hmis-input" value={adm.diagnosis} onChange={(e) => setAdm({ ...adm, diagnosis: e.target.value })} />
          </div>
          <div>
            <label className="hmis-label">Triage level (EC-3)</label>
            <select className="hmis-select" value={adm.triageLevel} onChange={(e) => setAdm({ ...adm, triageLevel: e.target.value })}>
              <option value="immediate">Immediate</option>
              <option value="urgent">Urgent</option>
              <option value="delayed">Delayed</option>
              <option value="minor">Minor</option>
            </select>
          </div>
          <div>
            <label className="hmis-label">ICU bed (optional EC-1)</label>
            <select className="hmis-select" value={adm.icuBedId} onChange={(e) => setAdm({ ...adm, icuBedId: e.target.value })}>
              <option value="">Do not assign bed</option>
              {beds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bed_code} — {b.status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="hmis-label">Bed notes</label>
            <input className="hmis-input" value={adm.bedNotes} onChange={(e) => setAdm({ ...adm, bedNotes: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <button type="submit" className="hmis-btn-primary">
              Register emergency encounter
            </button>
          </div>
        </form>
      </PdfServiceBlock>
      )}

      <PdfServiceBlock code="EC-1" title="ICU bed management" description="Visual bed board with occupancy, cleaning, and reserved states.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {beds.map((b) => (
            <div key={b.id} className="hmis-card p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-lg font-bold text-clinical-900">{b.bed_code}</span>
                <span className={bedPill(b.status)}>{b.status}</span>
              </div>
              <p className="mt-3 text-sm text-slate-700">{b.patient_number ? <>Patient MRN {b.patient_number}</> : <span className="text-slate-500">No patient assigned</span>}</p>
              {b.notes ? <p className="mt-1 text-xs text-slate-500">{b.notes}</p> : null}
              {user?.role === 'doctor' ? null : (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  {['available', 'occupied', 'cleaning'].map((s) => (
                    <button key={s} type="button" className="hmis-btn-secondary py-1.5 text-xs" onClick={() => setBed(b.id, s)}>
                      Set {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </PdfServiceBlock>

      {user?.role === 'receptionist' || user?.role === 'admin' ? (
        <PdfServiceBlock
          code="EC (booking)"
          title="Surgery requests → book ICU"
          description="Receptionist workflow: reserve an available ICU bed for a requested surgery. Doctor is notified automatically."
        >
          <form onSubmit={bookIcu} className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="hmis-label">Surgery request</label>
              <select className="hmis-select" required value={book.requestId} onChange={(e) => setBook({ ...book, requestId: e.target.value })}>
                <option value="">Select…</option>
                {surgeries
                  .filter((s) => s.status === 'requested')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      #{s.id} · {s.patient_number} · {new Date(s.surgery_scheduled_at).toLocaleString()}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="hmis-label">ICU bed</label>
              <select className="hmis-select" required value={book.icuBedId} onChange={(e) => setBook({ ...book, icuBedId: e.target.value })}>
                <option value="">Select…</option>
                {beds
                  .filter((b) => b.status === 'available')
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bed_code}
                    </option>
                  ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <button type="submit" className="hmis-btn-primary">
                Reserve ICU &amp; notify doctor
              </button>
            </div>
          </form>
        </PdfServiceBlock>
      ) : null}

      <section className="hmis-table-wrap">
        <div className="hmis-card-h">Emergency &amp; trauma team — roster</div>
        <div className="overflow-x-auto">
          <table className="hmis-table">
            <thead className="hmis-thead">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">On call</th>
              </tr>
            </thead>
            <tbody className="hmis-tbody">
              {team.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                  <td className="px-4 py-3 text-slate-700">{t.role_title}</td>
                  <td className="px-4 py-3">{t.is_on_call ? <span className="hmis-badge hmis-badge-info">On call</span> : <span className="hmis-muted text-sm">Off</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
