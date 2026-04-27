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

  const [prescriptions, setPrescriptions] = useState([]);
  const [inventory, setInventory] = useState([]);

  const [rxForm, setRxForm] = useState({
    patientId: '',
    consultationId: '',
    notes: '',
    items: []
  });

  const load = () => {
    api('/api/consultations').then(setCons).catch((e) => setMsg(e.message));
    api('/api/prescriptions').then(setPrescriptions).catch(() => {});
  };

  useEffect(() => {
    const patientsPath = user?.role === 'doctor' ? '/api/patients/assigned' : '/api/patients';
    api(patientsPath).then(setPatients).catch(() => {});

    api('/api/inventory').then(setInventory).catch(() => {
      // Temporary fallback data just in case inventory route isn't ready
      setInventory([
        { id: 1, name: 'Paracetamol 500mg' },
        { id: 2, name: 'Amoxicillin 250mg' },
        { id: 3, name: 'Cough Syrup 100ml' }
      ]);
    });

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

  // prescription 
  const handleAddMedicine = () => {
    setRxForm({
      ...rxForm,
      items: [...rxForm.items, { medicineId: '', dosage: '', frequency: '', duration: '', quantity: 1 }]
    });
  };

  const handleRemoveMedicine = (index) => {
    const newItems = [...rxForm.items];
    newItems.splice(index, 1);
    setRxForm({ ...rxForm, items: newItems });
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...rxForm.items];
    newItems[index][field] = value;
    setRxForm({ ...rxForm, items: newItems });
  };

  const submitPrescription = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      // Convert IDs and numbers to correct types before sending
      const payload = {
        patientId: Number(rxForm.patientId),
        consultationId: Number(rxForm.consultationId),
        notes: rxForm.notes,
        items: rxForm.items.map(item => ({
          medicineId: Number(item.medicineId),
          dosage: item.dosage,
          frequency: item.frequency,
          duration: Number(item.duration),
          quantity: Number(item.quantity)
        }))
      };

      await api('/api/prescriptions', { method: 'POST', body: JSON.stringify(payload) });
      setRxForm({ patientId: '', consultationId: '', notes: '', items: [] });
      load();
    } catch (ex) {
      setMsg(ex.message);
    }
  };

  const revokePrescription = async (id) => {
    if (!window.confirm("Are you sure you want to revoke this prescription?")) return;
    try {
      await api(`/api/prescriptions/${id}/revoke`, { method: 'PATCH' });
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

      {/* LIST OF PRESCRIPTIONS */}
      <PdfServiceBlock code="CW-2 (list)" title="Active Prescriptions" description="Current active orders and their statuses.">
        <div className="overflow-x-auto">
          <table className="hmis-table">
            <thead className="hmis-thead">
              <tr>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="hmis-tbody">
              {prescriptions.map((rx) => (
                <tr key={rx.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 text-sm text-slate-800">{rx.pf} {rx.pl}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{new Date(rx.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3"><span className={statusPill(rx.status)}>{rx.status}</span></td>
                  <td className="px-4 py-3 text-right">
                    {rx.status === 'ACTIVE' && canChart && (
                      <button onClick={() => revokePrescription(rx.id)} className="text-xs text-red-600 hover:text-red-800 font-medium">Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
              {!prescriptions.length && <tr><td className="px-4 py-6 text-sm text-slate-500" colSpan={4}>No prescriptions recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </PdfServiceBlock>

      {/* THE PRESCRIPTION BUILDER FORM */}
      {canChart && (
        <PdfServiceBlock code="CW-2" title="Prescription Builder" description="Multi-drug prescription tool linked to pharmacy inventory.">
          <form onSubmit={submitPrescription} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="hmis-label">Patient</label>
                <select required className="hmis-select" value={rxForm.patientId} onChange={(e) => setRxForm({ ...rxForm, patientId: e.target.value })}>
                  <option value="">Select Patient…</option>
                  {patients.map((p) => (<option key={p.id} value={p.id}>{p.patient_number} — {p.first_name} {p.last_name}</option>))}
                </select>
              </div>
              <div>
                <label className="hmis-label">Linked Consultation ID</label>
                <select required className="hmis-select" value={rxForm.consultationId} onChange={(e) => setRxForm({ ...rxForm, consultationId: e.target.value })}>
                  <option value="">Select Consultation…</option>
                  {cons.filter(c => c.patient_id === Number(rxForm.patientId)).map((c) => (
                    <option key={c.id} value={c.id}>Visit #{c.id} - {new Date(c.created_at).toLocaleDateString()}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold text-slate-800">Medications</h3>
                <button type="button" onClick={handleAddMedicine} className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-800 px-3 py-1 rounded">+ Add Drug</button>
              </div>
              
              {rxForm.items.length === 0 && <p className="text-xs text-slate-500 italic">No medications added yet. Click "+ Add Drug".</p>}

              {rxForm.items.map((item, index) => (
                <div key={index} className="grid gap-3 md:grid-cols-6 items-end border-b border-slate-200 pb-3">
                  <div className="md:col-span-2">
                    <label className="hmis-label text-[10px]">Medicine</label>
                    <select required className="hmis-select text-sm" value={item.medicineId} onChange={(e) => handleItemChange(index, 'medicineId', e.target.value)}>
                      <option value="">Select...</option>
                      {inventory.map(inv => <option key={inv.id} value={inv.id}>{inv.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="hmis-label text-[10px]">Dosage</label>
                    <input required className="hmis-input text-sm" value={item.dosage} onChange={(e) => handleItemChange(index, 'dosage', e.target.value)} />
                  </div>
                  <div>
                    <label className="hmis-label text-[10px]">Freq</label>
                    <input required className="hmis-input text-sm" value={item.frequency} onChange={(e) => handleItemChange(index, 'frequency', e.target.value)} />
                  </div>
                  <div>
                    <label className="hmis-label text-[10px]">Qty</label>
                    <input required type="number" min="1" className="hmis-input text-sm" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} />
                  </div>
                  <div className="flex justify-end pb-1">
                    <button type="button" onClick={() => handleRemoveMedicine(index)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="hmis-label">General Prescription Notes</label>
              <textarea className="hmis-input font-sans" rows={2} value={rxForm.notes} onChange={(e) => setRxForm({ ...rxForm, notes: e.target.value })} />
            </div>

            <button type="submit" className="hmis-btn-primary w-full md:w-auto" disabled={rxForm.items.length === 0}>
              Sign & Send to Pharmacy
            </button>
          </form>
        </PdfServiceBlock>
      )}
      {msg ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div> : null}
    </div>
  );
}
