import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { Act, Venue, Contact, BookingStatus } from '../../lib/types';
import { useLookup } from '../../lib/hooks/useLookup';
import Link from 'next/link';
import EmailComposer from '../../components/email/EmailComposer';

type EmailType = 'cold_pitch' | 'followup' | 'reply_suggestion';
type Draft = { subject: string; body: string; preview: string };
type View = 'outbox' | 'pipeline' | 'tracker';

const STAGE_LABELS: Record<string, string> = {
  target: 'Cold Pitch', follow_up_1: 'Follow Up 1', follow_up_2: 'Follow Up 2',
  confirmation: 'Confirmation', decline: 'Decline', advance: 'Advance', thank_you: 'Thank You', cold: 'Cold',
};
const STAGE_COLORS: Record<string, string> = {
  target: '#60a5fa', follow_up_1: '#fbbf24', follow_up_2: '#f97316',
  confirmation: '#34d399', decline: '#94a3b8', advance: '#f97316', thank_you: '#a78bfa', cold: '#475569',
};

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}
function daysUntil(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function getActionInfo(b: any): { label: string; urgency: 'green' | 'yellow' | 'red' | 'gray' | 'blue'; nextCategory: string | null } {
  const stage = b.email_stage;
  const since = daysSince(b.last_contact_date);
  const until = daysUntil(b.show_date);

  if (!stage) {
    if (['completed', 'cancelled'].includes(b.status)) return { label: 'Archived', urgency: 'gray', nextCategory: null };
    return { label: 'Not started — send cold pitch', urgency: 'blue', nextCategory: 'target' };
  }
  if (stage === 'target') {
    if (since < 7)  return { label: `Awaiting reply (${since}d ago)`, urgency: 'green', nextCategory: 'follow_up_1' };
    if (since < 11) return { label: 'Follow up due', urgency: 'yellow', nextCategory: 'follow_up_1' };
    return { label: `Overdue follow up (${since}d)`, urgency: 'red', nextCategory: 'follow_up_1' };
  }
  if (stage === 'follow_up_1') {
    if (since < 7)  return { label: `Awaiting reply (${since}d ago)`, urgency: 'green', nextCategory: 'follow_up_2' };
    if (since < 11) return { label: 'Follow up 2 due', urgency: 'yellow', nextCategory: 'follow_up_2' };
    return { label: `Overdue (${since}d)`, urgency: 'red', nextCategory: 'follow_up_2' };
  }
  if (stage === 'follow_up_2') {
    if (since < 14) return { label: `Awaiting reply (${since}d ago)`, urgency: 'green', nextCategory: null };
    return { label: 'No response — mark cold?', urgency: 'red', nextCategory: null };
  }
  if (stage === 'confirmation') {
    if (until > 14) return { label: `Advance in ${until - 14}d`, urgency: 'green', nextCategory: 'advance' };
    if (until >= 0) return { label: 'Send advance now', urgency: until < 7 ? 'red' : 'yellow', nextCategory: 'advance' };
    return { label: 'Show passed', urgency: 'gray', nextCategory: 'thank_you' };
  }
  if (stage === 'advance') {
    if (until > 0) return { label: `Show in ${until}d`, urgency: 'green', nextCategory: null };
    if (since < 7) return { label: 'Show just ended', urgency: 'yellow', nextCategory: 'thank_you' };
    return { label: 'Send thank you', urgency: 'red', nextCategory: 'thank_you' };
  }
  if (stage === 'thank_you') return { label: 'Complete', urgency: 'gray', nextCategory: null };
  if (stage === 'decline')   return { label: 'Declined', urgency: 'gray', nextCategory: null };
  if (stage === 'cold')      return { label: 'Cold', urgency: 'gray', nextCategory: null };
  return { label: stage, urgency: 'gray', nextCategory: null };
}

const URGENCY_DOT: Record<string, string> = {
  green: '#34d399', yellow: '#fbbf24', red: '#f87171', gray: '#475569', blue: '#60a5fa',
};

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
  const [pendingDrafts, setPendingDrafts] = useState<any[]>([]);
  const [draftComposer, setDraftComposer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
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

  // Tracker state
  const [trackerFilter, setTrackerFilter] = useState<'active' | 'all'>('active');
  const [composerBooking, setComposerBooking] = useState<any>(null);
  const [composerCategory, setComposerCategory] = useState('target');
  const [markingCold, setMarkingCold] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [logRes, actsRes, venuesRes, contactsRes, profileRes, bookingsRes, draftsRes] = await Promise.all([
      supabase.from('email_log').select('*, venue:venues(name)').eq('sent_by', user.id).order('sent_at', { ascending: false }).limit(100),
      supabase.from('acts').select('*').eq('agent_id', user.id).order('act_name'),
      supabase.from('venues').select('*').order('name'),
      supabase.from('contacts').select('*, venue:venues(name)').eq('agent_id', user.id).order('last_name'),
      supabase.from('user_profiles').select('display_name, agency_name').eq('id', user.id).single(),
      supabase.from('bookings').select(`
        id, status, show_date, fee, created_at,
        email_stage, last_contact_date, follow_up_count,
        act:acts(id, act_name),
        venue:venues(id, name, city, state, email),
        contact:contacts(id, first_name, last_name, email)
      `).neq('status', 'cancelled').order('show_date', { ascending: true }),
      supabase.from('email_drafts').select(`
        id, category, subject, body, created_at,
        booking:bookings(
          id, act_id, venue_id,
          act:acts(act_name),
          venue:venues(name, city, state, email),
          contact:contacts(id, first_name, last_name, email)
        )
      `).eq('agent_id', user.id).order('created_at', { ascending: false }),
    ]);
    setLog(logRes.data || []);
    setActs(actsRes.data || []);
    setVenues(venuesRes.data || []);
    setContacts(contactsRes.data || []);
    setProfile(profileRes.data);
    setBookings(bookingsRes.data || []);
    setPendingDrafts(draftsRes.data || []);
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

  const deleteDraft = async (id: string) => {
    await supabase.from('email_drafts').delete().eq('id', id);
    setPendingDrafts(prev => prev.filter(d => d.id !== id));
  };

  const runBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/email/backfill-drafts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    const data = await res.json();
    if (data.created === 0) {
      setBackfillResult(data.message || 'No new drafts to generate.');
    } else {
      setBackfillResult(`Generated ${data.created} draft${data.created > 1 ? 's' : ''}.`);
      await loadAll();
    }
    setBackfilling(false);
  };

  const markCold = async (bookingId: string) => {
    setMarkingCold(bookingId);
    await supabase.from('bookings').update({ email_stage: 'cold' }).eq('id', bookingId);
    setBookings(bs => bs.map(b => b.id === bookingId ? { ...b, email_stage: 'cold' } : b));
    setMarkingCold(null);
  };

  const openComposer = (b: any, category: string) => {
    setComposerBooking(b);
    setComposerCategory(category);
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
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {backfillResult && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{backfillResult}</span>}
              <button className="btn btn-secondary" onClick={runBackfill} disabled={backfilling} title="Generate cold pitch drafts for all existing bookings that have venues but no draft yet">
                {backfilling ? '⟳ Generating…' : '⟳ Generate Drafts'}
              </button>
              <button className="btn btn-primary" onClick={() => setShowCompose(true)}>✦ AI Compose</button>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
        {(['outbox', 'tracker', 'pipeline'] as View[]).map(v => {
          const overdueCount = v === 'tracker' ? bookings.filter(b => getActionInfo(b).urgency === 'red').length : 0;
          return (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '0.55rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
                fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: view === v ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: view === v ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {v === 'outbox' ? `Outbox (${log.length})` : v === 'pipeline' ? `Pipeline (${bookings.length})` : 'Outreach Tracker'}
              {v === 'outbox' && pendingDrafts.length > 0 && (
                <span style={{ background: 'var(--accent)', color: '#000', borderRadius: '999px', fontSize: '0.62rem', fontWeight: 700, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{pendingDrafts.length}</span>
              )}
              {overdueCount > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', borderRadius: '999px', fontSize: '0.62rem', fontWeight: 700, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{overdueCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* OUTBOX TAB */}
      {view === 'outbox' && (
        <>
          {/* Pending drafts */}
          {pendingDrafts.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
                {pendingDrafts.length} draft{pendingDrafts.length > 1 ? 's' : ''} ready to review
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {pendingDrafts.map(d => {
                  const bk = d.booking as any;
                  const contact = bk?.contact as any;
                  return (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--accent-glow)', border: '1px solid rgba(200,146,26,0.2)', borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                          {bk?.venue?.name || '—'}
                          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.5rem', fontSize: '0.82rem' }}>{bk?.venue?.city ? `${bk.venue.city}, ${bk.venue.state}` : ''}</span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'var(--font-body)', marginTop: '0.15rem' }}>
                          {bk?.act?.act_name || '—'} · {d.subject || '(no subject)'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setDraftComposer(d)}
                          style={{ fontSize: '0.78rem' }}
                        >
                          Review & Send
                        </button>
                        <button
                          onClick={() => deleteDraft(d.id)}
                          style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)', cursor: 'pointer' }}
                          title="Delete draft"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Non-responder alerts */}
          {nonResponders.length > 0 && (
            <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fbbf24', marginBottom: '0.25rem' }}>
                ⚠ {nonResponders.length} venue{nonResponders.length > 1 ? 's' : ''} haven't responded in 7+ days
              </div>
              {nonResponders.slice(0, 3).map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: '3px', padding: '0.6rem 0.85rem' }}>
                  <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                    {e.venue?.name || e.recipient}
                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                      pitched {new Date(e.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.82rem' }}
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
                <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                  {new Date(e.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </span>
              <button
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.82rem', borderColor: 'var(--accent)', color: 'var(--accent)' }}
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
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {TYPE_LABELS[e.template_id as EmailType] || e.template_id || '—'}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: EMAIL_STATUS_COLOR[e.status] || 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          {e.status}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(e.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {log.length === 0 && !loading && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>
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
                  <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>—</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TRACKER TAB */}
      {view === 'tracker' && (() => {
        const activeBookings = trackerFilter === 'active'
          ? bookings.filter(b => !['cold', 'decline', 'thank_you', 'cancelled', 'completed'].includes(b.email_stage) || !b.email_stage)
          : bookings;
        const overdueItems = activeBookings.filter(b => getActionInfo(b).urgency === 'red');
        const dueItems     = activeBookings.filter(b => getActionInfo(b).urgency === 'yellow');

        return (
          <>
            {/* Summary row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Overdue', count: overdueItems.length, color: '#f87171' },
                { label: 'Due Soon', count: dueItems.length, color: '#fbbf24' },
                { label: 'Active', count: activeBookings.filter(b => getActionInfo(b).urgency === 'green').length, color: '#34d399' },
              ].map(({ label, count, color }) => (
                <div key={label} className="card" style={{ padding: '0.9rem 1.1rem', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color, lineHeight: 1 }}>{count}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Filter toggle */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              {(['active', 'all'] as const).map(f => (
                <button key={f} onClick={() => setTrackerFilter(f)}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.25rem 0.75rem', borderRadius: '3px', border: `1px solid ${trackerFilter === f ? 'var(--accent)' : 'var(--border)'}`, background: trackerFilter === f ? 'var(--accent-glow)' : 'transparent', color: trackerFilter === f ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer' }}>
                  {f === 'active' ? 'Active Only' : 'Show All'}
                </button>
              ))}
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Venue</th>
                      <th>Act</th>
                      <th>Stage</th>
                      <th>Last Contact</th>
                      <th>Next Action</th>
                      <th style={{ width: 120 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeBookings.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>No active outreach.</td></tr>
                    )}
                    {activeBookings.map(b => {
                      const { label, urgency, nextCategory } = getActionInfo(b);
                      const contactEmail = b.contact?.email || b.venue?.email || '';
                      return (
                        <tr key={b.id}>
                          <td>
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{b.venue?.name || '—'}</div>
                            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>{b.venue?.city ? `${b.venue.city}, ${b.venue.state}` : ''}</div>
                          </td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{b.act?.act_name || '—'}</td>
                          <td>
                            {b.email_stage ? (
                              <span style={{ background: `${STAGE_COLORS[b.email_stage] || '#64748b'}18`, color: STAGE_COLORS[b.email_stage] || '#64748b', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.15rem 0.45rem', borderRadius: '3px' }}>
                                {STAGE_LABELS[b.email_stage] || b.email_stage}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>none</span>
                            )}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {b.last_contact_date ? new Date(b.last_contact_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: URGENCY_DOT[urgency], flexShrink: 0 }} />
                              <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>{label}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                              {nextCategory && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ fontSize: '0.75rem', color: STAGE_COLORS[nextCategory] || 'var(--accent)', borderColor: `${STAGE_COLORS[nextCategory] || 'var(--accent)'}44` }}
                                  onClick={() => openComposer(b, nextCategory)}
                                >
                                  ✉ {STAGE_LABELS[nextCategory]}
                                </button>
                              )}
                              {b.email_stage === 'follow_up_2' && getActionInfo(b).urgency === 'red' && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ fontSize: '0.75rem', color: '#94a3b8' }}
                                  disabled={markingCold === b.id}
                                  onClick={() => markCold(b.id)}
                                >
                                  {markingCold === b.id ? '…' : 'Mark Cold'}
                                </button>
                              )}
                              {b.email_stage === 'confirmation' && !nextCategory && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ fontSize: '0.75rem', color: '#a78bfa', borderColor: '#a78bfa44' }}
                                  onClick={() => openComposer(b, 'thank_you')}
                                >
                                  ✉ Thank You
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}

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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
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
                <div style={{ color: '#f87171', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>{draftErr}</div>
              )}

              {draft && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)' }}>
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

      {draftComposer && (() => {
        const bk = draftComposer.booking as any;
        const contact = bk?.contact as any;
        return (
          <EmailComposer
            bookingId={bk?.id}
            actId={bk?.act_id}
            venueId={bk?.venue_id}
            contactId={contact?.id}
            contactEmail={contact?.email || bk?.venue?.email || ''}
            defaultCategory={draftComposer.category || 'target'}
            initialSubject={draftComposer.subject || ''}
            initialBody={draftComposer.body || ''}
            draftId={draftComposer.id}
            onClose={() => {
              setDraftComposer(null);
              loadAll();
            }}
          />
        );
      })()}

      {composerBooking && (
        <EmailComposer
          bookingId={composerBooking.id}
          actId={composerBooking.act?.id}
          venueId={composerBooking.venue?.id}
          contactId={composerBooking.contact?.id}
          contactEmail={composerBooking.contact?.email || composerBooking.venue?.email || ''}
          defaultCategory={composerCategory}
          onClose={() => {
            setComposerBooking(null);
            // Refresh booking email_stage
            supabase.from('bookings').select('id, email_stage, last_contact_date, follow_up_count')
              .eq('id', composerBooking.id).single()
              .then(({ data }) => {
                if (data) setBookings(bs => bs.map(b => b.id === data.id ? { ...b, ...data } : b));
              });
          }}
        />
      )}
    </AppShell>
  );
}
