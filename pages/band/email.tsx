import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';

const STATUS_COLOR: Record<string, string> = {
  sent: '#fbbf24', delivered: '#34d399', bounced: '#f87171', failed: '#f87171',
};

export default function BandEmail() {
  const [myAct, setMyAct]         = useState<any>(null);
  const [log, setLog]             = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showCompose, setShowCompose] = useState(false);

  // Compose state
  const [toEmail, setToEmail]     = useState('');
  const [subject, setSubject]     = useState('');
  const [body, setBody]           = useState('');
  const [sending, setSending]     = useState(false);
  const [composeErr, setComposeErr] = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: acts } = await supabase
      .from('acts').select('*').eq('owner_id', user.id).eq('is_active', true).limit(1);
    const act = acts?.[0] || null;
    setMyAct(act);

    if (act) {
      const { data } = await supabase
        .from('email_log')
        .select('*, venue:venues(name)')
        .eq('act_id', act.id)
        .order('sent_at', { ascending: false })
        .limit(100);
      setLog(data || []);
    }
    setLoading(false);
  };

  const sendEmail = async () => {
    if (!toEmail || !subject || !body) { setComposeErr('All fields required'); return; }
    setSending(true);
    setComposeErr('');
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const html = body.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: toEmail, subject, html, actId: myAct?.id }),
      });
      if (!res.ok) {
        const d = await res.json();
        setComposeErr(d.error || 'Send failed');
        return;
      }
      setShowCompose(false);
      setToEmail(''); setSubject(''); setBody('');
      await loadAll();
    } finally {
      setSending(false);
    }
  };

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Email</h1>
          <div className="page-sub">
            {myAct ? `${myAct.act_name} · ${log.length} emails` : 'Band correspondence'}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCompose(true)}>+ Compose</button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Loading…</div>
      ) : !myAct ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem', color: 'var(--text-muted)' }}>
          No active band found for this account.
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Recipient</th><th>Subject</th><th>Venue</th><th>Status</th><th>Sent</th></tr>
              </thead>
              <tbody>
                {log.map(e => (
                  <tr key={e.id}>
                    <td style={{ color: 'var(--accent)', fontSize: '0.82rem' }}>{e.recipient || '—'}</td>
                    <td style={{ color: 'var(--text-primary)', fontSize: '0.85rem', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subject || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{e.venue?.name || '—'}</td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: STATUS_COLOR[e.status] || 'var(--text-muted)' }}>
                        {e.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(e.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {log.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>
                No emails yet for {myAct.act_name}.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compose modal */}
      {showCompose && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">Compose Email</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowCompose(false); setComposeErr(''); }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="field">
                <label className="field-label">To *</label>
                <input className="input" type="email" placeholder="venue@example.com" value={toEmail} onChange={e => setToEmail(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Subject *</label>
                <input className="input" placeholder="Advance inquiry — [Venue Name] [Date]" value={subject} onChange={e => setSubject(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Message *</label>
                <textarea
                  className="input"
                  rows={8}
                  placeholder="Write your message here…"
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  style={{ resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: '0.88rem', lineHeight: 1.7 }}
                />
              </div>

              {composeErr && (
                <div style={{ color: '#f87171', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>{composeErr}</div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => { setShowCompose(false); setComposeErr(''); }}>Cancel</button>
                <button className="btn btn-primary" onClick={sendEmail} disabled={sending}>
                  {sending ? 'Sending…' : 'Send Email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
