import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import PdfServiceBlock from '../components/PdfServiceBlock.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function channelPill(ch) {
  const c = (ch || '').toLowerCase();
  if (c === 'email') return 'hmis-pill hmis-pill-sky';
  if (c === 'sms') return 'hmis-pill hmis-pill-amber';
  return 'hmis-pill hmis-pill-slate';
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [sendMsg, setSendMsg] = useState('');
  const [sendForm, setSendForm] = useState({ target: 'pharmacist', subject: '', body: '' });

  const load = () => {
    api('/api/notifications')
      .then(setRows)
      .catch((e) => setMsg(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  const send = async (e) => {
    e.preventDefault();
    setSendMsg('');
    setMsg('');
    try {
      await api('/api/notifications/send', { method: 'POST', body: JSON.stringify(sendForm) });
      setSendForm({ target: sendForm.target, subject: '', body: '' });
      setSendMsg('Notification sent.');
      load();
    } catch (ex) {
      setSendMsg(ex.message);
    }
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">HMIS — Notifications</p>
        <h1 className="hmis-page-title">Notifications</h1>
        <p className="hmis-page-desc">In-app notification inbox backed by the database.</p>
      </header>

      {msg ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{msg}</div> : null}

      {['doctor', 'admin'].includes(user?.role) ? (
        <PdfServiceBlock code="AN-2" title="Send notification" description="Send an in-app notification to a role group.">
          <form onSubmit={send} className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="hmis-label">Audience</label>
              <select className="hmis-select" value={sendForm.target} onChange={(e) => setSendForm({ ...sendForm, target: e.target.value })}>
                <option value="all">Everyone</option>
                <option value="pharmacist">Pharmacist</option>
                <option value="lab">Lab</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="hmis-label">Subject</label>
              <input className="hmis-input" value={sendForm.subject} onChange={(e) => setSendForm({ ...sendForm, subject: e.target.value })} placeholder="e.g., urgent restock needed" />
            </div>
            <div className="md:col-span-3">
              <label className="hmis-label">Message</label>
              <textarea className="hmis-input min-h-[100px]" value={sendForm.body} onChange={(e) => setSendForm({ ...sendForm, body: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <button type="submit" className="hmis-btn-primary">
                Send
              </button>
              {sendMsg ? <span className="ml-3 text-sm text-slate-700">{sendMsg}</span> : null}
            </div>
          </form>
        </PdfServiceBlock>
      ) : null}

      <PdfServiceBlock code="AN-2" title="Inbox" description="Latest 50 notifications for the signed-in user.">
        <div className="mb-3">
          <button type="button" className="hmis-btn-secondary" onClick={load}>
            Refresh
          </button>
        </div>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {rows.map((n) => (
            <li key={n.id} className="px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{n.subject || '(no subject)'}</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{n.body}</div>
                  <div className="mt-2 text-xs text-slate-500">
                    {n.created_at ? new Date(n.created_at).toLocaleString() : '—'}
                    {n.sent_at ? ` · sent ${new Date(n.sent_at).toLocaleString()}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={channelPill(n.channel)}>{n.channel || 'in_app'}</span>
                  {n.read_at ? <span className="hmis-badge hmis-badge-info">Read</span> : <span className="hmis-badge">Unread</span>}
                </div>
              </div>
            </li>
          ))}
          {!rows.length ? <li className="px-4 py-8 text-center text-sm text-slate-500">No notifications.</li> : null}
        </ul>
      </PdfServiceBlock>
    </div>
  );
}

