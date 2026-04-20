import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { Act, Venue, Contact, BookingStatus } from '../../lib/types';
import { useLookup } from '../../lib/hooks/useLookup';
import Link from 'next/link';

type EmailType = 'cold_pitch' | 'followup' | 'reply_suggestion';
type Draft = { subject: string; body: string; preview: string };
type View = 'outbox' | 'pipeline';

const EMAIL_STATUS_COLOR: Record<string, string> = {
  sent: '#fbbf24', delivered: '#34d399', bounced: '#f87171', failed: '#f87171',
};

const TYPE_LABELS: Record<EmailType, string> = {
  cold_pitch: 'Cold Pitch',
  followup: 'Follow-up',
  reply_suggestion: 'Reply to Venue',
};

export default function EmailPage() {
  const router = useRouter();
  const { values: statusValues } = useLookup('booking_status');
  const [view, setView] = useState<View>('outbox');

  // Email state
  const [log, setLog]         = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acts, setActs]       = useState<Act[]>([]);
  const [venues, setVenues]   = useState<Venue[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [profile, setProfile]   = useState<any>(null);
  const [showCompose, setShowCompose] = useState(false);

  // Compose state
  const [emailType, setEmailType]   = useState<EmailType>('cold_pitch');
  const [selAct, setSelAct]         = useState('');
  const [selVenue, setSelVenue]     = useState('');
  const [selContact, setSelContact] = useState('');
  const [prevSubject, setPrevSubject] = useState('');
  const [prevBody, setPrevBody]       = useState('');
  const [draft, setDraft]       = useState<Draft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending]   = useState(false);
  const [toEmail, setToEmail]   = useState('');
  const [draftErr, setDraftErr] = useState('');

  // Pipeline state
  const [bookings, setBookings]   = useState<any[]>([]);
  const [filterAct, setFilterAct] = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [logRes, actsRes, venuesRes, contactsRes, profileRes, bookingsRes] = await Promise.all([
      supabase.from('email_log').select('*, venue:venues(name)').eq('sent_by', user.id).order('sent_at', { ascending: false }).limit(100),
      supabase.from('acts').select('*').eq('agent_id', user.id).order('act_name'),
      supabase.from('venues').select('*').order('name'),
      supabase.from('contacts').select('*, venue:venues(name)').eq('agent_id', user.id).order('last_name'),
      supabase.from('user_profiles').select('display_name, agency_name').eq('id', user.id).single(),
      supabase.from('bookings').select(`
        id, status, show_date, fee, created_at,
        act:acts(id, act_name),
        venue:venues(id, name, city, state)
      `).eq('created_by', user.id).order('created_at', { ascending: false }),
    ]);
    setLog(logRes.data || []);
    setActs(actsRes.data || []);
    setVenues(venuesRes.data || []);
    setContacts(contactsRes.data || []);
    setProfile(profileRes.data);
    setBookings(bookingsRes.data || []);
    setLoading(false);
  };

  const moveStatus = async (bookingId: string, newStatus: BookingStatus) => {
    await supabase.from('bookings').update({ status: newStatus }).eq('id', bookingId);
    setBookings(bs => bs.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
  };

  const getDraft = async () => {
    if (!selAct) { setDraftErr('Select an act first'); return; }
    setDrafting(true);
    setDraft(null);
    setDraftErr('');
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/email/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: emailType,
          actId: selAct,
          venueId: selVenue || undefined,
          contactId: selContact || undefined,
          agentName: profile?.display_name,
          agencyName: profile?.agency_name,
          previousEmail: (emailType !== 'cold_pitch' && prevBody)
            ? { subject: prevSubject, body: prevBody }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setDraftErr(data.error || 'Draft failed'); return; }
      setDraft(data.draft);
      if (!toEmail && selContact) {
        const c = contacts.find(x => x.id === selContact);
        if (c?.email) setToEmail(c.email);
      }
      if (!toEmail && selVenue) {
        const v = venues.find(x => x.id === selVenue);
        if (v?.email) setToEmail(v.email);
      }
    } finally {
      setDrafting(false);
    }
  };

  const sendEmail = async () => {
    if (!draft || !toEmail) return;
    setSending(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const html = draft.body.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
      await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: toEmail, subject: draft.subject, html,
          venueId: selVenue || undefined,
          contactId: selContact || undefined,
          actId: selAct || undefined,
          templateId: emailType,
        }),
      });
      setShowCompose(false);
      resetCompose();
      await loadAll();
    } finally {
      setSending(false);
    }
  };

  const resetCompose = () => {
    setEmailType('cold_pitch');
    setSelAct(''); setSelVenue(''); setSelContact('');
    setPrevSubject(''); setPrevBody('');
    setDraft(null); setDraftErr(''); setToEmail('');
  };

  const filteredContacts = selVenue ? contacts.filter(c => c.venue_id === selVenue) : contacts;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const nonResponders = log.filter(e =>
    e.template_id === 'cold_pitch' &&
    e.sent_at < sevenDaysAgo &&
    e.status !== 'bounced' &&
    !log.some(f => f.venue_id === e.venue_id && f.template_id === 'followup' && f.sent_at > e.sent_at)
  );

  const pipelineBookings = filterAct
    ? bookings.filter(b => b.act?.id === filterAct)
    : bookings;

  const columns = statusValues
    .filter(lv => lv.value !== 'cancelled')
    .map(lv => ({
      status: lv.value as BookingStatus,
      label: lv.label,
      bookings: pipelineBookings.filter(b => b.status === lv.value),
    }));

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">Email &amp; Pipeline</h1>
          <div className="page-sub">{log.length} emails · {bookings.length} bookings</div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {view === 'pipeline' && (
            <>
              <select className="select" style={{ width: 180 }} value={filterAct} onChange={e => setFilterAct(e.target.value)}>
                <option value="">All Acts</option>
                {acts.map(a => <option key={a.id} value={a.id}>{a.act_name}</option>)}
              </select>
              <Link href="/bookings/new" className="btn btn-secondary">+ New Booking</Link>
            </>
          )}
          {view === 'outbox' && (
            <button className="btn btn-primary" onClick={() => setShowCompose(true)}>✦ AI Compose</button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
        {(['outbox', 'pipeline'] as View[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: '0.55rem 1.25rem',
              fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: view === v ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: view === v ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {v === 'outbox' ? `Outbox (${log.length})` : `Pipeline (${bookings.length})`}
          </button>
        ))}
      </div>

      {/* OUTBOX TAB */}
      {view === 'outbox' && (
        <>
          {/* Non-responder alerts */}
          {nonResponders.length > 0 && (
            <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fbbf24', marginBottom: '0.25rem' }}>
                ⚠ {nonResponders.length} venue{nonResponders.length > 1 ? 's' : ''} haven't responded in 7+ days
              </div>
              {nonResponders.slice(0, 3).map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: '3px', padding: '0.6rem 0.85rem' }}>
                  <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                    {e.venue?.name || e.recipient}
                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                      pitched {new Date(e.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.72rem' }}
                    onClick={() => {
                      setEmailType('followup');
                      if (e.venue_id) setSelVenue(e.venue_id);
                      setPrevSubject(e.subject || '');
                      setShowCompose(true);
                    }}
                  >
                    AI Follow-up
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Inbound reply alerts */}
          {log.filter(e => e.template_id === 'inbound_reply').slice(0, 3).map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(196,154,60,0.05)', border: '1px solid rgba(196,154,60,0.2)', borderRadius: '3px', padding: '0.6rem 0.85rem', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>◈</span>
              <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                Venue replied: <strong>{e.recipient}</strong>
                <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                  {new Date(e.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </span>
              <button
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.72rem', borderColor: 'var(--accent)', color: 'var(--accent)' }}
                onClick={() => {
                  setEmailType('reply_suggestion');
                  if (e.venue_id) setSelVenue(e.venue_id);
                  setPrevBody(e.subject || '');
                  setShowCompose(true);
                }}
              >
                AI Reply
              </button>
            </div>
          ))}

          {/* Email log table */}
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Recipient</th><th>Subject</th><th>Type</th><th>Status</th><th>Sent</th></tr>
                </thead>
                <tbody>
                  {log.map(e => (
                    <tr key={e.id}>
                      <td style={{ color: 'var(--accent)', fontSize: '0.82rem' }}>{e.recipient || '—'}</td>
                      <td style={{ color: 'var(--text-primary)', fontSize: '0.85rem', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subject || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {TYPE_LABELS[e.template_id as EmailType] || e.template_id || '—'}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: EMAIL_STATUS_COLOR[e.status] || 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          {e.status}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(e.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {log.length === 0 && !loading && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                  No emails yet. Hit "AI Compose" to draft your first pitch.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* PIPELINE TAB */}
      {view === 'pipeline' && (
        <div className="kanban-board">
          {columns.map(col => (
            <div key={col.status} className="kanban-col">
              <div className="kanban-col-header">
                <span className={`kanban-col-title badge-${col.status}`} style={{ color: `var(--status-${col.status})` }}>{col.label.toUpperCase()}</span>
                <span className="kanban-col-count">{col.bookings.length}</span>
              </div>
              <div className="kanban-cards">
                {col.bookings.map(b => (
                  <div key={b.id} className="kanban-card" onClick={() => router.push(`/bookings/${b.id}`)}>
                    <div className="kanban-card-act">{b.act?.act_name || '—'}</div>
                    <div className="kanban-card-venue">{b.venue?.name || 'No venue'}</div>
                    <div className="kanban-card-meta">
                      {b.venue?.city ? `${b.venue.city}, ${b.venue.state}` : ''}
                      {b.show_date ? ` · ${new Date(b.show_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                      {b.fee ? ` · $${Number(b.fee).toLocaleString()}` : ''}
                    </div>
                  </div>
                ))}
                {col.bookings.length === 0 && (
                  <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>—</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Compose Modal */}
      {showCompose && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h3 className="modal-title">✦ AI Email Compose</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowCompose(false); resetCompose(); }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="field">
                <label className="field-label">Email Type</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['cold_pitch', 'followup', 'reply_suggestion'] as EmailType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setEmailType(t)}
                      style={{
                        padding: '0.4rem 0.85rem', fontSize: '0.78rem',
                        fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
                        border: emailType === t ? '1px solid var(--accent)' : '1px solid var(--border)',
                        background: emailType === t ? 'var(--accent-glow)' : 'transparent',
                        color: emailType === t ? 'var(--accent)' : 'var(--text-muted)',
                        borderRadius: '2px', cursor: 'pointer',
                      }}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label className="field-label">Act / Band *</label>
                  <select className="select" value={selAct} onChange={e => setSelAct(e.target.value)}>
                    <option value="">— select act —</option>
                    {acts.map(a => <option key={a.id} value={a.id}>{a.act_name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Venue</label>
                  <select className="select" value={selVenue} onChange={e => { setSelVenue(e.target.value); setSelContact(''); }}>
                    <option value="">— select venue —</option>
                    {venues.map(v => <option key={v.id} value={v.id}>{v.name} — {v.city}, {v.state}</option>)}
                  </select>
                </div>
              </div>

              <div className="field">
                <label className="field-label">Contact {selVenue ? `(${filteredContacts.length} at this venue)` : ''}</label>
                <select className="select" value={selContact} onChange={e => setSelContact(e.target.value)}>
                  <option value="">— select contact (optional) —</option>
                  {filteredContacts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}{c.title ? ` — ${c.title}` : ''}{c.email ? ` (${c.email})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {emailType !== 'cold_pitch' && (
                <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.75rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    {emailType === 'followup' ? 'Original pitch (optional context)' : "Venue's reply (paste their message)"}
                  </div>
                  <input
                    className="input"
                    placeholder="Subject line"
                    value={prevSubject}
                    onChange={e => setPrevSubject(e.target.value)}
                    style={{ marginBottom: '0.5rem' }}
                  />
                  <textarea
                    className="input"
                    placeholder={emailType === 'followup' ? 'Paste original email body…' : "Paste the venue's reply…"}
                    value={prevBody}
                    onChange={e => setPrevBody(e.target.value)}
                    rows={4}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              )}

              <button
                className="btn btn-primary"
                onClick={getDraft}
                disabled={drafting || !selAct}
                style={{ alignSelf: 'flex-start' }}
              >
                {drafting ? '✦ Drafting…' : '✦ Generate Draft'}
              </button>

              {draftErr && (
                <div style={{ color: '#f87171', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{draftErr}</div>
              )}

              {draft && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                    AI Draft — edit freely before sending
                  </div>
                  <div className="field">
                    <label className="field-label">To (email address) *</label>
                    <input className="input" type="email" value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="venue@example.com" />
                  </div>
                  <div className="field">
                    <label className="field-label">Subject</label>
                    <input className="input" value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} />
                  </div>
                  <div className="field">
                    <label className="field-label">Body</label>
                    <textarea
                      className="input"
                      value={draft.body}
                      onChange={e => setDraft({ ...draft, body: e.target.value })}
                      rows={10}
                      style={{ resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: '0.88rem', lineHeight: 1.7 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={getDraft} disabled={drafting}>
                      {drafting ? 'Regenerating…' : 'Regenerate'}
                    </button>
                    <button className="btn btn-primary" onClick={sendEmail} disabled={sending || !toEmail}>
                      {sending ? 'Sending…' : 'Send Email'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
