import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { Act, Venue, Contact, BookingStatus } from '../../lib/types';
import { useLookup } from '../../lib/hooks/useLookup';
import { getActId } from '../../lib/bookingQueries';
import Link from 'next/link';
import EmailComposer from '../../components/email/EmailComposer';

type EmailType = 'cold_pitch' | 'follow_up' | 'reply';
type Draft = { subject: string; body: string; preview: string };
type View = 'outbox' | 'pipeline' | 'tracker' | 'inbox';

type InboxMessage = {
  uid: number;
  from: string;
  fromEmail: string;
  subject: string;
  date: string;
  preview: string;
  body: string;
  matchedVenueId: string | null;
  matchedVenueName: string | null;
};

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
  follow_up:  'Follow-up',
  reply:      'Reply to Venue',
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
  const [pitchedTourVenues, setPitchedTourVenues] = useState<any[]>([]);
  const [composerBooking, setComposerBooking] = useState<any>(null);
  const [composerTourVenue, setComposerTourVenue] = useState<any>(null);
  const [composerCategory, setComposerCategory] = useState('target');
  const [markingCold, setMarkingCold] = useState<string | null>(null);
  const [markingReplied, setMarkingReplied] = useState<string | null>(null);

  // Inbox state
  const [inboxMessages, setInboxMessages] = useState<InboxMessage[]>([]);
  const [inboxLoading, setInboxLoading]   = useState(false);
  const [inboxConfigured, setInboxConfigured] = useState(true);
  const [inboxError, setInboxError]       = useState('');
  const [inboxLoaded, setInboxLoaded]     = useState(false);
  const [selectedInboxMsg, setSelectedInboxMsg] = useState<InboxMessage | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const actId = await getActId(supabase, user.id);

    const bookingsQ = actId
      ? supabase.from('bookings').select(`
          id, status, show_date, fee, created_at,
          email_stage, last_contact_date, follow_up_count,
          act:acts(id, act_name),
          venue:venues(id, name, city, state, email),
          contact:contacts(id, first_name, last_name, email)
        `).eq('act_id', actId).neq('status', 'cancelled').order('show_date', { ascending: true })
      : null;

    const toursQ = actId
      ? supabase.from('tours').select('id').eq('act_id', actId)
      : Promise.resolve({ data: [] as any[] });

    const [toursRes, logRes, actsRes, venuesRes, contactsRes, profileRes, bookingsRes, draftsRes] = await Promise.all([
      toursQ,
      supabase.from('email_log').select('*, venue:venues(name)').eq('sent_by', user.id).order('sent_at', { ascending: false }).limit(100),
      actId ? supabase.from('acts').select('*').eq('id', actId) : Promise.resolve({ data: [] as any[] }),
      supabase.from('venues').select('*').order('name'),
      supabase.from('contacts').select('*, venue:venues(name)').eq('agent_id', user.id).order('last_name'),
      supabase.from('user_profiles').select('display_name, agency_name').eq('id', user.id).single(),
      bookingsQ ?? Promise.resolve({ data: [] as any[] }),
      supabase.from('email_drafts').select(`
        id, category, subject, body, created_at, tour_venue_id,
        booking:bookings(
          id, act_id, venue_id,
          act:acts(act_name),
          venue:venues(name, city, state, email),
          contact:contacts(id, first_name, last_name, email)
        ),
        tour_venue:tour_venues(
          id, venue_id,
          venue:venues(name, city, state, email),
          tour:tours(id, act_id, act:acts(act_name))
        )
      `).eq('agent_id', user.id).order('created_at', { ascending: false }),
    ]);

    const tourIds = (toursRes.data || []).map((t: any) => t.id);
    const tvRes = tourIds.length > 0
      ? await supabase.from('tour_venues').select(`
          id, status, tour_id, last_contacted_at, pitched_at, followup_at, updated_at,
          venue:venues(id, name, city, state, email),
          tour:tours(id, act_id, act:acts(id, act_name))
        `).in('tour_id', tourIds).in('status', ['pitched', 'follow_up'])
      : { data: [] as any[] };

    setLog(logRes.data || []);
    setActs(actsRes.data || []);
    setVenues(venuesRes.data || []);
    setContacts(contactsRes.data || []);
    setProfile(profileRes.data);
    setBookings(bookingsRes.data || []);
    setPendingDrafts(draftsRes.data || []);
    setPitchedTourVenues(tvRes.data || []);
    setLoading(false);
  };

  const moveStatus = async (bookingId: string, newStatus: BookingStatus) => {
    await supabase.from('bookings').update({ status: newStatus }).eq('id', bookingId);
    setBookings(bs => bs.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
  };

  const categoryMap: Record<EmailType, string> = {
    cold_pitch: 'cold_pitch',
    follow_up:  'follow_up',
    reply:      'reply',
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
          category: categoryMap[emailType],
          actId: selAct,
          venueId: selVenue || undefined,
          contactId: selContact || undefined,
          agentName: profile?.display_name,
          agencyName: profile?.agency_name,
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

  const clearAllDrafts = async () => {
    if (!confirm(`Delete all ${pendingDrafts.length} draft${pendingDrafts.length !== 1 ? 's' : ''}?`)) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('email_drafts').delete().eq('agent_id', user.id);
    setPendingDrafts([]);
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

  const markReplied = async (tvId: string) => {
    setMarkingReplied(tvId);
    await supabase.from('tour_venues').update({ status: 'negotiating', updated_at: new Date().toISOString() }).eq('id', tvId);
    setPitchedTourVenues(tvs => tvs.filter(tv => tv.id !== tvId));
    setMarkingReplied(null);
  };

  const loadInbox = async () => {
    setInboxLoading(true);
    setInboxError('');
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch('/api/email/inbox', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) { setInboxError(data.error || 'Failed to load inbox'); }
      else {
        setInboxConfigured(data.configured);
        const msgs = data.messages || [];
        setInboxMessages(msgs);
        localStorage.setItem('inbox_count', String(msgs.length));
      }
    } catch (e: any) {
      setInboxError('Network error fetching inbox');
    }
    setInboxLoading(false);
    setInboxLoaded(true);
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
    !log.some(f => f.venue_id === e.venue_id && ['followup', 'follow_up', 'follow_up_1'].includes(f.template_id) && f.sent_at > e.sent_at)
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
    <AppShell requireRole="act_admin">
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
        {(['outbox', 'tracker', 'pipeline', 'inbox'] as View[]).map(v => {
          const overdueCount = v === 'tracker' ? bookings.filter(b => getActionInfo(b).urgency === 'red').length : 0;
          const venueReplies = v === 'inbox' ? inboxMessages.filter(m => m.matchedVenueId).length : 0;
          return (
            <button
              key={v}
              onClick={() => {
                setView(v);
                if (v === 'inbox' && !inboxLoaded) loadInbox();
              }}
              style={{
                padding: '0.55rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
                fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.12em', textTransform: 'uppercase',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: view === v ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: view === v ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {v === 'outbox' ? `Outbox (${log.length})` : v === 'pipeline' ? `Pipeline (${bookings.length})` : v === 'inbox' ? 'Inbox' : 'Outreach Tracker'}
              {v === 'outbox' && pendingDrafts.length > 0 && (
                <span style={{ background: 'var(--accent)', color: '#000', borderRadius: '999px', fontSize: '0.62rem', fontWeight: 700, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{pendingDrafts.length}</span>
              )}
              {overdueCount > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', borderRadius: '999px', fontSize: '0.62rem', fontWeight: 700, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{overdueCount}</span>
              )}
              {v === 'inbox' && venueReplies > 0 && (
                <span style={{ background: '#60a5fa', color: '#000', borderRadius: '999px', fontSize: '0.62rem', fontWeight: 700, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{venueReplies}</span>
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
                <button
                  onClick={clearAllDrafts}
                  style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.06em', padding: '0.15rem 0.6rem', borderRadius: '3px', border: '1px solid rgba(248,113,113,0.4)', background: 'transparent', color: '#f87171', cursor: 'pointer' }}
                >
                  Clear All
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {pendingDrafts.map(d => {
                  const bk = (d as any).booking;
                  const tv = (d as any).tour_venue;
                  const contact = bk?.contact;
                  const venueName = bk?.venue?.name || tv?.venue?.name || '—';
                  const venueCity = bk?.venue?.city || tv?.venue?.city || '';
                  const venueState = bk?.venue?.state || tv?.venue?.state || '';
                  const actName = bk?.act?.act_name || tv?.tour?.act?.act_name || '—';
                  const contactEmail = contact?.email || bk?.venue?.email || tv?.venue?.email || '';
                  return (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--accent-glow)', border: '1px solid rgba(224,120,32,0.2)', borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                          {venueName}
                          {venueCity && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.5rem', fontSize: '0.82rem' }}>{venueCity}, {venueState}</span>}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'var(--font-body)', marginTop: '0.15rem' }}>
                          {actName} · {d.subject || '(no subject)'}
                        </div>
                        {contactEmail && (
                          <div style={{ color: 'var(--accent)', fontSize: '0.74rem', fontFamily: 'var(--font-mono)', marginTop: '0.1rem', opacity: 0.8 }}>
                            → {contactEmail}
                          </div>
                        )}
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
                      setEmailType('follow_up');
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
                  setEmailType('reply');
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
        // Tour venue outreach — primary tracker source
        const tvWithDays = pitchedTourVenues.map(tv => {
          const lastContactStr = tv.last_contacted_at || tv.pitched_at || tv.updated_at;
          const days = lastContactStr ? Math.floor((Date.now() - new Date(lastContactStr).getTime()) / (1000 * 60 * 60 * 24)) : 999;
          const tvUrgency: 'green' | 'yellow' | 'red' = days <= 3 ? 'green' : days <= 7 ? 'yellow' : 'red';
          return { ...tv, days, tvUrgency };
        }).sort((a, b) => b.days - a.days);

        // Booking-based tracker (email_stage pipeline)
        const activeBookings = trackerFilter === 'active'
          ? bookings.filter(b => !['cold', 'decline', 'thank_you', 'cancelled', 'completed'].includes(b.email_stage) || !b.email_stage)
          : bookings;
        const overdueItems = [
          ...tvWithDays.filter(tv => tv.tvUrgency === 'red'),
          ...activeBookings.filter(b => getActionInfo(b).urgency === 'red'),
        ];
        const dueItems = [
          ...tvWithDays.filter(tv => tv.tvUrgency === 'yellow'),
          ...activeBookings.filter(b => getActionInfo(b).urgency === 'yellow'),
        ];
        const totalActive = tvWithDays.length + activeBookings.filter(b => getActionInfo(b).urgency === 'green').length;

        return (
          <>
            {/* Summary row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Overdue', count: overdueItems.length, color: '#f87171' },
                { label: 'Due Soon', count: dueItems.length, color: '#fbbf24' },
                { label: 'Active', count: totalActive, color: '#34d399' },
              ].map(({ label, count, color }) => (
                <div key={label} className="card" style={{ padding: '0.9rem 1.1rem', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', color, lineHeight: 1 }}>{count}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Pitched venues tracker */}
            {tvWithDays.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.6rem' }}>
                  ◈ Pitched Venues — {tvWithDays.length} active
                </div>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Venue</th>
                          <th>Act</th>
                          <th>Status</th>
                          <th>Last Contact</th>
                          <th>Days Since</th>
                          <th style={{ width: 180 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tvWithDays.map(tv => {
                          const venue = tv.venue as any;
                          const act   = (tv.tour as any)?.act;
                          const lastContactStr = tv.last_contacted_at || tv.pitched_at || tv.updated_at;
                          const urgencyColor = tv.tvUrgency === 'red' ? '#f87171' : tv.tvUrgency === 'yellow' ? '#fbbf24' : '#34d399';
                          return (
                            <tr key={tv.id}>
                              <td>
                                <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{venue?.name || '—'}</div>
                                <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>{venue?.city ? `${venue.city}, ${venue.state}` : ''}</div>
                              </td>
                              <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{act?.act_name || '—'}</td>
                              <td>
                                <span style={{ background: tv.status === 'follow_up' ? 'rgba(251,191,36,0.12)' : 'rgba(96,165,250,0.12)', color: tv.status === 'follow_up' ? '#fbbf24' : '#60a5fa', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.15rem 0.45rem', borderRadius: '3px' }}>
                                  {tv.status === 'follow_up' ? 'Follow-Up' : 'Pitched'}
                                </span>
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                {lastContactStr ? new Date(lastContactStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: urgencyColor, flexShrink: 0 }} />
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: urgencyColor }}>
                                    {tv.days === 999 ? '—' : `${tv.days}d`}
                                  </span>
                                  {tv.tvUrgency === 'red' && (
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)', borderRadius: '3px', padding: '0.1rem 0.4rem', letterSpacing: '0.04em' }}>Follow up needed</span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize: '0.72rem', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.4)' }}
                                    onClick={() => { setComposerTourVenue(tv); setComposerCategory('follow_up_1'); }}
                                  >
                                    ✉ Follow-Up
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize: '0.72rem', color: '#34d399', borderColor: 'rgba(52,211,153,0.4)' }}
                                    disabled={markingReplied === tv.id}
                                    onClick={() => markReplied(tv.id)}
                                  >
                                    {markingReplied === tv.id ? '…' : '✓ Replied'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Booking email pipeline tracker */}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span>Booking Pipeline — {activeBookings.length} active</span>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {(['active', 'all'] as const).map(f => (
                  <button key={f} onClick={() => setTrackerFilter(f)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0.15rem 0.55rem', borderRadius: '3px', border: `1px solid ${trackerFilter === f ? 'var(--accent)' : 'var(--border)'}`, background: trackerFilter === f ? 'var(--accent-glow)' : 'transparent', color: trackerFilter === f ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer' }}>
                    {f === 'active' ? 'Active' : 'All'}
                  </button>
                ))}
              </div>
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
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>No booking pipeline entries.</td></tr>
                    )}
                    {activeBookings.map(b => {
                      const { label, urgency, nextCategory } = getActionInfo(b);
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

      {/* INBOX TAB */}
      {view === 'inbox' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {inboxLoaded ? `${inboxMessages.length} messages (last 30 days)` : 'Recent emails from your IMAP inbox'}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadInbox} disabled={inboxLoading}>
              {inboxLoading ? '⟳ Fetching…' : '⟳ Refresh'}
            </button>
          </div>

          {!inboxConfigured && (
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                IMAP not configured. Set up your email credentials in Settings to enable the inbox.
              </div>
              <a href="/settings" className="btn btn-primary btn-sm">Go to Settings →</a>
            </div>
          )}

          {inboxError && (
            <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.84rem', marginBottom: '1rem' }}>
              {inboxError}
            </div>
          )}

          {inboxConfigured && !inboxLoading && inboxMessages.length === 0 && inboxLoaded && !inboxError && (
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>
              No messages found in the last 30 days.
            </div>
          )}

          {inboxMessages.length > 0 && (
            <>
              {/* Venue replies highlighted */}
              {inboxMessages.filter(m => m.matchedVenueId).length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#60a5fa', marginBottom: '0.5rem' }}>
                    ◈ Venue Replies ({inboxMessages.filter(m => m.matchedVenueId).length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {inboxMessages.filter(m => m.matchedVenueId).map(m => (
                      <div key={m.uid} style={{ background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', display: 'flex', gap: '1rem', alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => setSelectedInboxMsg(m)}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                            <span style={{ fontWeight: 600, color: '#60a5fa', fontSize: '0.88rem' }}>{m.matchedVenueName}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.fromEmail}</span>
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{m.subject}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.preview}</div>
                        </div>
                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <a href={`/venues/${m.matchedVenueId}`} className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem', color: '#60a5fa', borderColor: '#60a5fa44' }} onClick={e => e.stopPropagation()}>
                            View Venue →
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All messages */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>From</th><th>Subject</th><th>Venue Match</th><th>Date</th></tr>
                    </thead>
                    <tbody>
                      {inboxMessages.map(m => (
                        <tr key={m.uid} style={{ cursor: 'pointer' }} onClick={() => setSelectedInboxMsg(m)}>
                          <td>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>{m.from}</div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{m.fromEmail}</div>
                          </td>
                          <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{m.subject}</div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.preview}</div>
                          </td>
                          <td>
                            {m.matchedVenueName ? (
                              <a href={`/venues/${m.matchedVenueId}`} style={{ color: '#60a5fa', fontSize: '0.82rem', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                                {m.matchedVenueName}
                              </a>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>—</span>
                            )}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
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
                  {(['cold_pitch', 'follow_up', 'reply'] as EmailType[]).map(t => (
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
                    {emailType === 'follow_up' ? 'Original pitch (optional context)' : "Venue's reply (paste their message)"}
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
                    placeholder={emailType === 'follow_up' ? 'Paste original email body…' : "Paste the venue's reply…"}
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
        const bk = (draftComposer as any).booking;
        const tv = (draftComposer as any).tour_venue;
        const contact = bk?.contact as any;
        return (
          <EmailComposer
            bookingId={bk?.id}
            tourVenueId={tv?.id}
            actId={bk?.act_id || tv?.tour?.act_id || ''}
            venueId={bk?.venue_id || tv?.venue_id}
            contactId={contact?.id}
            contactEmail={contact?.email || bk?.venue?.email || tv?.venue?.email || ''}
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
            supabase.from('bookings').select('id, email_stage, last_contact_date, follow_up_count')
              .eq('id', composerBooking.id).single()
              .then(({ data }) => {
                if (data) setBookings(bs => bs.map(b => b.id === data.id ? { ...b, ...data } : b));
              });
          }}
        />
      )}

      {composerTourVenue && (
        <EmailComposer
          tourVenueId={composerTourVenue.id}
          actId={(composerTourVenue.tour as any)?.act_id || ''}
          venueId={(composerTourVenue.venue as any)?.id}
          contactEmail={(composerTourVenue.venue as any)?.email || ''}
          defaultCategory={composerCategory}
          onClose={() => {
            setComposerTourVenue(null);
            loadAll();
          }}
        />
      )}

      {/* Inbox email detail modal */}
      {selectedInboxMsg && (
        <div className="modal-backdrop" onClick={() => setSelectedInboxMsg(null)}>
          <div className="modal" style={{ maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h3 className="modal-title" style={{ maxWidth: '88%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedInboxMsg.subject}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedInboxMsg(null)}>✕</button>
            </div>

            {/* Meta row */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.1rem 0 0.9rem', borderBottom: '1px solid var(--border)', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>From</span>
                <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{selectedInboxMsg.from}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-muted)' }}>{selectedInboxMsg.fromEmail}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Date</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {new Date(selectedInboxMsg.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              {selectedInboxMsg.matchedVenueName && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Venue</span>
                  <a href={`/venues/${selectedInboxMsg.matchedVenueId}`} style={{ color: '#60a5fa', fontSize: '0.84rem', textDecoration: 'none', fontWeight: 600 }}>
                    {selectedInboxMsg.matchedVenueName} →
                  </a>
                </div>
              )}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font-body)', fontSize: '0.88rem', lineHeight: 1.75, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {selectedInboxMsg.body || selectedInboxMsg.preview || '(no content)'}
            </div>

            <div style={{ flexShrink: 0, marginTop: '1rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              {selectedInboxMsg.matchedVenueId && (
                <a href={`/venues/${selectedInboxMsg.matchedVenueId}`} className="btn btn-secondary btn-sm" style={{ color: '#60a5fa', borderColor: '#60a5fa44' }}>
                  View Venue →
                </a>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedInboxMsg(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
