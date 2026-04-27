import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import VoiceNotes from '../components/VoiceNotes.jsx';
import PdfServiceBlock from '../components/PdfServiceBlock.jsx';

function statusPill(kind) {
  const k = (kind || '').toLowerCase();
  if (k === 'completed' || k === 'dispensed') return 'hmis-pill hmis-pill-emerald';
  if (k === 'pending' || k === 'ordered') return 'hmis-pill hmis-pill-amber';
  if (k === 'in_progress') return 'hmis-pill hmis-pill-sky';
  if (k === 'cancelled') return 'hmis-pill hmis-pill-rose';
  return 'hmis-pill hmis-pill-slate';
}

export default function ClinicalPage() {
  const { user } = useAuth();
  const [cons, setCons] = useState([]);
  const [patients, setPatients] = useState([]);
  const [notesForm, setNotesForm] = useState({
    patientId: '',
    chiefComplaint: '',
    diagnosis: '',
    clinicalNotes: '',
    triageLevel: '',
    requestSurgery: false,
    surgeryScheduledAt: '',
    surgeryNotes: '',
    icuRequired: true,
  });
  const [msg, setMsg] = useState('');

  const load = () => {
    api('/api/consultations').then(setCons).catch((e) => setMsg(e.message));
  };

  useEffect(() => {
    const patientsPath = user?.role === 'doctor' ? '/api/patients/assigned' : '/api/patients';
    api(patientsPath).then(setPatients).catch(() => {});
    load();
  }, []);

  const addConsult = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await api('/api/consultations', {
        method: 'POST',
        body: JSON.stringify({
          patientId: Number(notesForm.patientId),
          chiefComplaint: notesForm.chiefComplaint,
          diagnosis: notesForm.diagnosis,
          clinicalNotes: notesForm.clinicalNotes,
          triageLevel: notesForm.triageLevel || null,
          surgeryRequest: notesForm.requestSurgery
            ? {
                request: true,
                scheduledAt: notesForm.surgeryScheduledAt ? String(notesForm.surgeryScheduledAt).replace('T', ' ').slice(0, 19) : '',
                notes: notesForm.surgeryNotes || null,
                icuRequired: Boolean(notesForm.icuRequired),
              }
            : undefined,
        }),
      });
      setNotesForm({
        patientId: '',
        chiefComplaint: '',
        diagnosis: '',
        clinicalNotes: '',
        triageLevel: '',
        requestSurgery: false,
        surgeryScheduledAt: '',
        surgeryNotes: '',
        icuRequired: true,
      });
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const canChart = ['admin', 'doctor'].includes(user?.role);

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">HMIS — Clinical Workflow domain</p>
        <h1 className="hmis-page-title">Clinical workflow</h1>
        <p className="hmis-page-desc">
          Fast charting for physicians: consultations and prescriptions.
        </p>
      </header>

      {/* Tables first (doctor-first layout) */}
      <PdfServiceBlock code="CW-1 (list)" title="Consultation register" description="Recent encounters including emergency and triage metadata.">
        <div className="overflow-x-auto">
          <table className="hmis-table">
            <thead className="hmis-thead">
              <tr>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Complaint</th>
                <th className="px-4 py-3">Diagnosis</th>
                <th className="px-4 py-3">Triage</th>
              </tr>
            </thead>
            <tbody className="hmis-tbody">
              {cons.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm text-clinical-800">{c.patient_number}</span>
                    <span className="block text-sm text-slate-600">
                      {c.pf} {c.pl}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-800">{c.chief_complaint || '—'}</td>
                  <td className="px-4 py-3 text-slate-800">{c.diagnosis || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {c.triage_level ? <span className="capitalize">{c.triage_level}</span> : <span className="text-slate-500">—</span>}
                  </td>
                </tr>
              ))}
              {!cons.length ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-500" colSpan={4}>
                    No consultations recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </PdfServiceBlock>

      {canChart ? (
        <PdfServiceBlock
          code="CW-1"
          title="Consultation Recording"
          description="Structured encounter documentation with triage category."
        >
          <div className="space-y-4">
            <VoiceNotes value={notesForm.clinicalNotes} onChange={(t) => setNotesForm({ ...notesForm, clinicalNotes: t })} />
            <form onSubmit={addConsult} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="hmis-label">Patient</label>
                <select required className="hmis-select" value={notesForm.patientId} onChange={(e) => setNotesForm({ ...notesForm, patientId: e.target.value })}>
                  <option value="">Select MRN…</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.patient_number} — {p.first_name} {p.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="hmis-label">Chief complaint</label>
                <input className="hmis-input" value={notesForm.chiefComplaint} onChange={(e) => setNotesForm({ ...notesForm, chiefComplaint: e.target.value })} />
              </div>
              <div>
                <label className="hmis-label">Assessment / diagnosis</label>
                <input className="hmis-input" value={notesForm.diagnosis} onChange={(e) => setNotesForm({ ...notesForm, diagnosis: e.target.value })} />
              </div>
              <div>
                <label className="hmis-label">Triage level (optional)</label>
                <select className="hmis-select" value={notesForm.triageLevel} onChange={(e) => setNotesForm({ ...notesForm, triageLevel: e.target.value })}>
                  <option value="">Not assigned</option>
                  <option value="immediate">Immediate</option>
                  <option value="urgent">Urgent</option>
                  <option value="delayed">Delayed</option>
                  <option value="minor">Minor</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="hmis-label">Plan &amp; clinical notes</label>
                <textarea className="hmis-input min-h-[120px] font-sans" rows={5} value={notesForm.clinicalNotes} onChange={(e) => setNotesForm({ ...notesForm, clinicalNotes: e.target.value })} />
              </div>

              <div className="md:col-span-2 rounded-md border border-slate-200 bg-slate-50/80 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={notesForm.requestSurgery}
                    onChange={(e) => setNotesForm({ ...notesForm, requestSurgery: e.target.checked })}
                  />
                  Request surgery (creates a surgery request for Receptionist to book ICU)
                </label>
                {notesForm.requestSurgery ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="hmis-label">Surgery date &amp; time</label>
                      <input
                        required
                        type="datetime-local"
                        className="hmis-input"
                        value={notesForm.surgeryScheduledAt}
                        onChange={(e) => setNotesForm({ ...notesForm, surgeryScheduledAt: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm text-slate-800">
                        <input
                          type="checkbox"
                          checked={notesForm.icuRequired}
                          onChange={(e) => setNotesForm({ ...notesForm, icuRequired: e.target.checked })}
                        />
                        ICU required
                      </label>
                    </div>
                    <div className="md:col-span-2">
                      <label className="hmis-label">Surgery notes</label>
                      <input className="hmis-input" value={notesForm.surgeryNotes} onChange={(e) => setNotesForm({ ...notesForm, surgeryNotes: e.target.value })} />
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="md:col-span-2">
                <button type="submit" className="hmis-btn-primary">
                  Sign &amp; save to chart
                </button>
              </div>
            </form>
          </div>
        </PdfServiceBlock>
      ) : null}

      {msg ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div> : null}
    </div>
  );
}
