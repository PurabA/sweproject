import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import VoiceNotes from '../components/VoiceNotes.jsx';
import PdfServiceBlock from '../components/PdfServiceBlock.jsx';

const blankLabOrder = () => ({ testName: '', priority: 'routine' });

export default function ClinicalPage() {
  const { user } = useAuth();
  const [cons, setCons] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [notesForm, setNotesForm] = useState({
    appointmentId: '',
    chiefComplaint: '',
    diagnosis: '',
    clinicalNotes: '',
    triageLevel: '',
    labOrders: [blankLabOrder()],
    requestSurgery: false,
    surgeryScheduledAt: '',
    surgeryNotes: '',
    icuRequired: true,
  });
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');

  const load = () => {
    api('/api/consultations').then(setCons).catch((e) => setMsg(e.message));
    api('/api/consultations/scheduled-appointments').then(setScheduled).catch(() => {});
  };

  const setLabOrder = (idx, key, value) => {
    setNotesForm((prev) => ({
      ...prev,
      labOrders: prev.labOrders.map((lo, i) => (i === idx ? { ...lo, [key]: value } : lo)),
    }));
  };

  const addLabOrder = () => {
    setNotesForm((prev) => ({ ...prev, labOrders: [...prev.labOrders, blankLabOrder()] }));
  };

  const removeLabOrder = (idx) => {
    setNotesForm((prev) => ({
      ...prev,
      labOrders: prev.labOrders.length > 1 ? prev.labOrders.filter((_, i) => i !== idx) : prev.labOrders,
    }));
  };

  useEffect(() => {
    load();
  }, []);

  const flash = (text, kind = 'ok') => {
    if (kind === 'ok') {
      setOk(text);
      setMsg('');
      setTimeout(() => setOk(''), 4000);
    } else {
      setMsg(text);
      setOk('');
    }
  };

  const addConsult = async (e) => {
    e.preventDefault();
    if (!notesForm.appointmentId) {
      return flash('Pick a scheduled appointment first.', 'err');
    }
    try {
      const res = await api('/api/consultations', {
        method: 'POST',
        body: JSON.stringify({
          appointmentId: Number(notesForm.appointmentId),
          chiefComplaint: notesForm.chiefComplaint,
          diagnosis: notesForm.diagnosis,
          clinicalNotes: notesForm.clinicalNotes,
          triageLevel: notesForm.triageLevel || null,
          labOrders: notesForm.labOrders
            .map((lo) => ({ testName: lo.testName.trim(), priority: lo.priority }))
            .filter((lo) => lo.testName),
          surgeryRequest: notesForm.requestSurgery
            ? {
                request: true,
                scheduledAt: notesForm.surgeryScheduledAt
                  ? String(notesForm.surgeryScheduledAt).replace('T', ' ').slice(0, 19)
                  : '',
                notes: notesForm.surgeryNotes || null,
                icuRequired: Boolean(notesForm.icuRequired),
              }
            : undefined,
        }),
      });
      flash(
        `Consultation saved · appointment marked complete${res?.labOrderIds?.length ? ` · ${res.labOrderIds.length} lab request${res.labOrderIds.length === 1 ? '' : 's'} sent` : ''} · pending bill ${res?.bill?.billNumber || ''} created (total Rs. ${Number(res?.bill?.total || 0).toFixed(2)}).`
      );
      setNotesForm({
        appointmentId: '',
        chiefComplaint: '',
        diagnosis: '',
        clinicalNotes: '',
        triageLevel: '',
        labOrders: [blankLabOrder()],
        requestSurgery: false,
        surgeryScheduledAt: '',
        surgeryNotes: '',
        icuRequired: true,
      });
      load();
    } catch (ex) {
      flash(ex.message, 'err');
    }
  };

  const canChart = ['admin', 'doctor'].includes(user?.role);
  const isReadOnlyView = ['pharmacist', 'lab'].includes(user?.role);

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Clinical workflow</p>
        <h1 className="hmis-page-title">Clinical workflow</h1>
        <p className="hmis-page-desc">
          {isReadOnlyView
            ? 'Read-only view of recent consultations across the hospital.'
            : 'Document a consultation against a scheduled appointment. Signing off marks the appointment complete and generates a pending invoice (₹300 consultation; +₹2000 if surgery is requested).'}
        </p>
      </header>

      {msg ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div> : null}
      {ok ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{ok}</div> : null}

      <PdfServiceBlock title="Consultation register" description="Recent encounters including emergency and triage metadata.">
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
          title="Consultation recording"
          description="Pick a scheduled appointment. Once you sign off, that appointment closes and a Rs. 300 pending bill is generated."
        >
          {!scheduled.length ? (
            <p className="text-sm text-slate-600">No scheduled appointments waiting for a consultation. Ask reception to book one first.</p>
          ) : (
            <div className="space-y-4">
              <VoiceNotes value={notesForm.clinicalNotes} onChange={(t) => setNotesForm({ ...notesForm, clinicalNotes: t })} />
              <form onSubmit={addConsult} className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="hmis-label">Scheduled appointment</label>
                  <select
                    required
                    className="hmis-select"
                    value={notesForm.appointmentId}
                    onChange={(e) => setNotesForm({ ...notesForm, appointmentId: e.target.value })}
                  >
                    <option value="">Select an appointment…</option>
                    {scheduled.map((a) => (
                      <option key={a.id} value={a.id}>
                        {new Date(a.scheduled_at).toLocaleString()} — {a.patient_number} · {a.pf} {a.pl}
                        {user?.role !== 'doctor' ? ` · Dr. ${a.dl}` : ''}
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

                <div className="md:col-span-2 rounded-md border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                    <span className="text-sm font-semibold text-slate-800">Lab tests</span>
                    <button type="button" className="text-sm font-medium text-clinical-700 hover:underline" onClick={addLabOrder}>
                      + Add test
                    </button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {notesForm.labOrders.map((lo, idx) => (
                      <div key={idx} className="grid gap-3 md:grid-cols-12">
                        <div className="md:col-span-7">
                          <label className="hmis-label">Test name</label>
                          <input
                            className="hmis-input"
                            placeholder="e.g., CBC, blood sugar, lipid profile"
                            value={lo.testName}
                            onChange={(e) => setLabOrder(idx, 'testName', e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-3">
                          <label className="hmis-label">Priority</label>
                          <select className="hmis-select" value={lo.priority} onChange={(e) => setLabOrder(idx, 'priority', e.target.value)}>
                            <option value="routine">Routine</option>
                            <option value="urgent">Urgent</option>
                            <option value="stat">Stat</option>
                          </select>
                        </div>
                        <div className="flex items-end md:col-span-2">
                          <button
                            type="button"
                            className="text-sm font-medium text-rose-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                            onClick={() => removeLabOrder(idx)}
                            disabled={notesForm.labOrders.length === 1}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
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
          )}
        </PdfServiceBlock>
      ) : null}
    </div>
  );
}
