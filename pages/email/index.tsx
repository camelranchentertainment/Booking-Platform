import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { getActId } from '../../lib/bookingQueries';
import EmailComposer from '../../components/email/EmailComposer';
import VenueDrawer from '../../components/VenueDrawer';

// ─── Types & Constants ────────────────────────────────────────────────────────

type TabView = 'inbox' | 'pipeline' | 'outreach' | 'outbox' | 'archive';

const PIPELINE_STAGES = [
  { key: 'target',    label: 'Target',              color: '#6B8FB5' },
  { key: 'pitched',   label: 'Pitched',             color: '#E8A020' },
  { key: 'waiting',   label: 'Waiting on Response', color: '#B56B8F' },
  { key: 'follow_up', label: 'Follow Up',           color: '#E85252' },
  { key: 'confirmed', label: 'Confirmed',           color: '#E8602A' },
  { key: 'declined',  label: 'Declined',            color: '#708090' },
] as const;

type StageKey = typeof PIPELINE_STAGES[number]['key'];

const STAGE_COLOR: Record<string, string> = Object.fromEntries(
  PIPELINE_STAGES.map(s => [s.key, s.color])
);

const BK_STAGE_LABELS: Record<string, string> = {
  target: 'Cold Pitch', follow_up_1: 'Follow Up 1', follow_up_2: 'Follow Up 2',
  confirmation: 'Confirmation', decline: 'Decline', advance: 'Advance', thank_you: 'Thank You', cold: 'Cold',
};
const BK_STAGE_COLORS: Record<string, string> = {
  target: '#60a5fa', follow_up_1: '#fbbf24', follow_up_2: '#f97316',
  confirmation: '#34d399', decline: '#94a3b8', advance: '#f97316', thank_you: '#a78bfa', cold: '#475569',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(d: string | null): number {
  if (!d) return 999;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}
function dayCellColor(n: number): string {
  if (n <= 7)  return '#34d399';
  if (n <= 14) return '#fbbf24';
  return '#f87171';
}
function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtDateFull(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getActionInfo(b: any) {
  const stage = b.email_stage;
  const since = daysSince(b.last_contact_date);
  const until = b.show_date ? Math.floor((new Date(b.show_date).getTime() - Date.now()) / 86_400_000) : 999;
  if (!stage) {
    if (['completed', 'cancelled'].includes(b.status)) return { label: 'Archived', color: '#6b7280', next: null };
    return { label: 'Send cold pitch', color: '#60a5fa', next: 'target' };
  }
  if (stage === 'target') {
    if (since < 7)  return { label: `Awaiting reply (${since}d)`, color: '#34d399', next: 'follow_up_1' };
    if (since < 11) return { label: 'Follow up due', color: '#fbbf24', next: 'follow_up_1' };
    return { label: `Overdue (${since}d)`, color: '#f87171', next: 'follow_up_1' };
  }
  if (stage === 'follow_up_1') {
    if (since < 7)  return { label: `Awaiting reply (${since}d)`, color: '#34d399', next: 'follow_up_2' };
    if (since < 11) return { label: 'Follow up 2 due', color: '#fbbf24', next: 'follow_up_2' };
    return { label: `Overdue (${since}d)`, color: '#f87171', next: 'follow_up_2' };
  }
  if (stage === 'follow_up_2') {
    if (since < 14) return { label: `Awaiting reply (${since}d)`, color: '#34d399', next: null };
    return { label: 'No response — mark cold?', color: '#f87171', next: null };
  }
  if (stage === 'confirmation') {
    if (until > 14) return { label: `Advance in ${until - 14}d`, color: '#34d399', next: 'advance' };
    if (until >= 0) return { label: 'Send advance now', color: until < 7 ? '#f87171' : '#fbbf24', next: 'advance' };
    return { label: 'Show passed', color: '#6b7280', next: 'thank_you' };
  }
  if (stage === 'advance') {
    if (until > 0) return { label: `Show in ${until}d`, color: '#34d399', next: null };
    if (since < 7) return { label: 'Show just ended', color: '#fbbf24', next: 'thank_you' };
    return { label: 'Send thank you', color: '#f87171', next: 'thank_you' };
  }
  if (stage === 'thank_you') return { label: 'Complete', color: '#6b7280', next: null };
  if (stage === 'decline')   return { label: 'Declined', color: '#6b7280', next: null };
  if (stage === 'cold')      return { label: 'Cold', color: '#6b7280', next: null };
  return { label: stage, color: '#6b7280', next: null };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmailPage() {
  const router = useRouter();

  // Navigation
  const [view, setView] = useState<TabView>('inbox');

  // Core data
  const [actId, setActId]                 = useState<string | null>(null);
  const [token, setToken]                 = useState('');
  const [loading, setLoading]             = useState(true);
  const [allTourVenues, setAllTourVenues] = useState<any[]>([]);
  const [bookings, setBookings]           = useState<any[]>([]);
  const [inboxEmails, setInboxEmails]     = useState<any[]>([]);
  const [outboxEmails, setOutboxEmails]   = useState<any[]>([]);
  const [archivedEmails, setArchivedEmails] = useState<any[]>([]);

  // Pipeline
  const [pipelineFilter, setPipelineFilter]   = useState<string>('all');
  const [pipelineView, setPipelineView]       = useState<'list' | 'kanban'>('list');
  const [expandedRows, setExpandedRows]       = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows]       = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage]             = useState('');
  const [sortField, setSortField]             = useState<string>('lastContact');
  const [sortDir, setSortDir]                 = useState<'asc' | 'desc'>('desc');
  const [draggedId, setDraggedId]             = useState<string | null>(null);
  const [dragOverStage, setDragOverStage]     = useState<string | null>(null);

  // Inbox
  const [readIds, setReadIds]                 = useState<Set<string>>(new Set());
  const [expandedEmail, setExpandedEmail]     = useState<string | null>(null);

  // Outbox
  const [expandedOutbox, setExpandedOutbox]   = useState<string | null>(null);

  // Archive
  const [archiveSearch, setArchiveSearch]     = useState('');
  const [archiveStart, setArchiveStart]       = useState('');
  const [archiveEnd, setArchiveEnd]           = useState('');
  const [expandedArchive, setExpandedArchive] = useState<string | null>(null);

  // Outreach
  const [outreachFilter, setOutreachFilter]   = useState('all');
  const [archivePrompt, setArchivePrompt]     = useState<{ tv: any; emailId?: string } | null>(null);
  const [markingReplied, setMarkingReplied]   = useState<string | null>(null);
  const [markingCold, setMarkingCold]         = useState<string | null>(null);

  // Composers / drawers
  const [composerTourVenue, setComposerTourVenue] = useState<any>(null);
  const [composerBooking, setComposerBooking]     = useState<any>(null);
  const [composerCategory, setComposerCategory]   = useState('target');
  const [drawerVenueId, setDrawerVenueId]         = useState<string | null>(null);

  // ─── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const stored = localStorage.getItem('crb_pipeline_view') as 'list' | 'kanban' | null;
    if (stored) setPipelineView(stored);
    const reads = localStorage.getItem('crb_read_emails');
    if (reads) { try { setReadIds(new Set(JSON.parse(reads))); } catch {} }
  }, []);

  useEffect(() => {
    const { tab, status } = router.query;
    if (tab === 'outreach') setView('outreach');
    if (tab === 'pipeline') setView('pipeline');
    if (status && typeof status === 'string') setOutreachFilter(status);
  }, [router.query]);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const tok = session?.access_token || '';
    setToken(tok);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const aid = await getActId(supabase, user.id);
    setActId(aid);

    const toursQ = aid
      ? supabase.from('tours').select('id').eq('act_id', aid).neq('status', 'cancelled')
      : Promise.resolve({ data: [] as any[] });

    const bookingsQ = aid
      ? supabase.from('bookings').select(`
          id, status, show_date, email_stage, last_contact_date,
          act:acts(id, act_name),
          venue:venues(id, name, city, state, email),
          contact:contacts(id, first_name, last_name, email)
        `).eq('act_id', aid).neq('status', 'cancelled').order('show_date', { ascending: true })
      : Promise.resolve({ data: [] as any[] });

    const inboxQ = aid
      ? supabase.from('email_log')
          .select('id, from_address, subject, body, sent_at, venue_id, venue:venues(name)')
          .eq('direction', 'received')
          .eq('act_id', aid)
          .neq('archived', true)
          .order('sent_at', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as any[] });

    const outboxQ = supabase.from('email_log')
      .select('id, recipient, subject, body, status, sent_at, template_id, venue_id, venue:venues(name)')
      .eq('sent_by', user.id)
      .neq('direction', 'received')
      .neq('archived', true)
      .order('sent_at', { ascending: false })
      .limit(200);

    const [toursRes, bookingsRes, inboxRes, outboxRes] = await Promise.all([
      toursQ, bookingsQ, inboxQ, outboxQ,
    ]);

    const tourIds = (toursRes.data || []).map((t: any) => t.id);
    const tvRes = tourIds.length > 0
      ? await supabase.from('tour_venues').select(`
          id, status, tour_id, last_contacted_at, pitched_at, updated_at, notes,
          venue:venues(id, name, city, state, email, phone)
          ,tour:tours(id, name, act_id)
        `).in('tour_id', tourIds).order('updated_at', { ascending: false })
      : { data: [] as any[] };

    setAllTourVenues(tvRes.data || []);
    setBookings(bookingsRes.data || []);
    setInboxEmails(inboxRes.data || []);
    setOutboxEmails(outboxRes.data || []);
    setLoading(false);
  };

  const loadArchived = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('email_log')
      .select('id, from_address, recipient, subject, body, sent_at, archived_at, direction, venue_id, venue:venues(name)')
      .eq('sent_by', user.id)
      .eq('archived', true)
      .order('archived_at', { ascending: false })
      .limit(200);
    setArchivedEmails(data || []);
  };

  // ─── Actions ───────────────────────────────────────────────────────────────

  const archiveEmail = async (id: string) => {
    await supabase.from('email_log').update({ archived: true, archived_at: new Date().toISOString() }).eq('id', id);
    setInboxEmails(prev => prev.filter(e => e.id !== id));
    setOutboxEmails(prev => prev.filter(e => e.id !== id));
  };

  const unarchiveEmail = async (id: string) => {
    await supabase.from('email_log').update({ archived: false, archived_at: null }).eq('id', id);
    setArchivedEmails(prev => prev.filter(e => e.id !== id));
  };

  const markRead = (id: string) => {
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem('crb_read_emails', JSON.stringify([...next]));
      return next;
    });
  };

  const isUnread = (email: any): boolean => {
    if (readIds.has(email.id)) return false;
    return Date.now() - new Date(email.sent_at).getTime() < 48 * 3_600_000;
  };

  const togglePipelineView = (v: 'list' | 'kanban') => {
    setPipelineView(v);
    localStorage.setItem('crb_pipeline_view', v);
  };

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const bulkArchive = async () => {
    const ids = [...selectedRows];
    await Promise.all(ids.map(id =>
      supabase.from('tour_venues').update({ status: 'declined' }).eq('id', id)
    ));
    setAllTourVenues(prev => prev.filter(tv => !selectedRows.has(tv.id)));
    setSelectedRows(new Set());
  };

  const bulkMove = async () => {
    if (!bulkStage) return;
    const ids = [...selectedRows];
    await Promise.all(ids.map(id =>
      supabase.from('tour_venues').update({ status: bulkStage, updated_at: new Date().toISOString() }).eq('id', id)
    ));
    setAllTourVenues(prev => prev.map(tv =>
      selectedRows.has(tv.id) ? { ...tv, status: bulkStage } : tv
    ));
    setSelectedRows(new Set());
    setBulkStage('');
  };

  const handleDrop = async (targetStage: string) => {
    if (!draggedId || !targetStage) return;
    const tv = allTourVenues.find(t => t.id === draggedId);
    if (!tv || tv.status === targetStage) { setDraggedId(null); setDragOverStage(null); return; }
    await supabase.from('tour_venues').update({ status: targetStage, updated_at: new Date().toISOString() }).eq('id', draggedId);
    setAllTourVenues(prev => prev.map(t => t.id === draggedId ? { ...t, status: targetStage } : t));
    setDraggedId(null);
    setDragOverStage(null);
  };

  const markReplied = async (tvId: string) => {
    setMarkingReplied(tvId);
    await supabase.from('tour_venues').update({ status: 'follow_up', updated_at: new Date().toISOString() }).eq('id', tvId);
    setAllTourVenues(tvs => tvs.map(tv => tv.id === tvId ? { ...tv, status: 'follow_up' } : tv));
    setMarkingReplied(null);
  };

  const markCold = async (bookingId: string) => {
    setMarkingCold(bookingId);
    await supabase.from('bookings').update({ email_stage: 'cold' }).eq('id', bookingId);
    setBookings(bs => bs.map(b => b.id === bookingId ? { ...b, email_stage: 'cold' } : b));
    setMarkingCold(null);
  };

  const archiveTourVenue = async (tvId: string, removeFromTour: boolean) => {
    if (removeFromTour) {
      await supabase.from('tour_venues').delete().eq('id', tvId);
      setAllTourVenues(prev => prev.filter(t => t.id !== tvId));
    } else {
      await supabase.from('tour_venues').update({ status: 'declined' }).eq('id', tvId);
      setAllTourVenues(prev => prev.map(t => t.id === tvId ? { ...t, status: 'declined' } : t));
    }
    setArchivePrompt(null);
  };

  // ─── Derived data ──────────────────────────────────────────────────────────

  const pipelineCounts: Record<string, number> = { all: allTourVenues.length };
  for (const s of PIPELINE_STAGES) {
    pipelineCounts[s.key] = allTourVenues.filter(tv => tv.status === s.key).length;
  }

  const filteredPipeline = pipelineFilter === 'all'
    ? allTourVenues
    : allTourVenues.filter(tv => tv.status === pipelineFilter);

  const sortedPipeline = [...filteredPipeline].sort((a, b) => {
    let aVal: any, bVal: any;
    if (sortField === 'venue')       { aVal = a.venue?.name || ''; bVal = b.venue?.name || ''; }
    else if (sortField === 'tour')   { aVal = a.tour?.name || ''; bVal = b.tour?.name || ''; }
    else if (sortField === 'status') { aVal = a.status || ''; bVal = b.status || ''; }
    else if (sortField === 'lastContact') {
      aVal = a.last_contacted_at || a.updated_at || '';
      bVal = b.last_contacted_at || b.updated_at || '';
    } else {
      aVal = daysSince(a.last_contacted_at || a.updated_at);
      bVal = daysSince(b.last_contacted_at || b.updated_at);
    }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const outreachFiltered = outreachFilter === 'all'
    ? allTourVenues
    : allTourVenues.filter(tv => tv.status === outreachFilter);

  const outreachCounts: Record<string, number> = { all: allTourVenues.length };
  for (const s of PIPELINE_STAGES) outreachCounts[s.key] = allTourVenues.filter(tv => tv.status === s.key).length;

  const activeBookings = bookings.filter(b =>
    !['cold', 'decline', 'thank_you', 'cancelled', 'completed'].includes(b.email_stage) || !b.email_stage
  );

  const filteredArchive = archivedEmails.filter(e => {
    const search = archiveSearch.toLowerCase();
    const vName  = (e.venue as any)?.name?.toLowerCase() || '';
    const subj   = (e.subject || '').toLowerCase();
    if (search && !vName.includes(search) && !subj.includes(search)) return false;
    if (archiveStart && e.sent_at && e.sent_at < archiveStart) return false;
    if (archiveEnd   && e.sent_at && e.sent_at > archiveEnd + 'T23:59:59') return false;
    return true;
  });

  // ─── Style helpers ─────────────────────────────────────────────────────────

  const pill = (active: boolean, color: string) => ({
    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.25rem 0.65rem', borderRadius: 999, cursor: 'pointer',
    fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.08em',
    border: `1px solid ${active ? color : 'rgba(255,255,255,0.12)'}`,
    background: active ? `${color}26` : 'transparent',
    color: active ? color : 'var(--text-muted)',
  } as React.CSSProperties);

  const badge = (cnt: number, color: string, active: boolean) => ({
    background: active ? color : 'rgba(255,255,255,0.12)',
    color: active ? '#000' : 'var(--text-muted)',
    borderRadius: 999, fontSize: '0.6rem', fontWeight: 700,
    minWidth: 16, height: 16, display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', padding: '0 4px',
  } as React.CSSProperties);

  const sortHdr = (field: string, label: string) => (
    <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => toggleSort(field)}>
      {label}{sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  const inboxCount   = inboxEmails.length;
  const unreadCount  = inboxEmails.filter(isUnread).length;

  return (
    <AppShell requireRole="band_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Email &amp; Pipeline</h1>
          <div className="page-sub">{allTourVenues.length} venues in pipeline · {inboxCount} inbox</div>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
        {([
          { id: 'inbox',    label: 'Inbox',    badge: unreadCount },
          { id: 'pipeline', label: 'Pipeline', badge: allTourVenues.length },
          { id: 'outreach', label: 'Outreach', badge: 0 },
          { id: 'outbox',   label: 'Outbox',   badge: outboxEmails.length },
          { id: 'archive',  label: 'Archive',  badge: 0 },
        ] as { id: TabView; label: string; badge: number }[]).map(t => (
          <button
            key={t.id}
            onClick={() => {
              setView(t.id);
              if (t.id === 'archive' && archivedEmails.length === 0) loadArchived();
            }}
            style={{
              padding: '0.55rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
              fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: view === t.id ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: view === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px',
            }}
          >
            {t.label}
            {t.badge > 0 && (
              <span style={{ background: t.id === 'inbox' && unreadCount > 0 ? '#E8602A' : 'rgba(255,255,255,0.15)', color: t.id === 'inbox' && unreadCount > 0 ? '#fff' : 'var(--text-muted)', borderRadius: 999, fontSize: '0.6rem', fontWeight: 700, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                {t.id === 'inbox' ? unreadCount || t.badge : t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══ INBOX TAB ══ */}
      {view === 'inbox' && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {inboxCount} message{inboxCount !== 1 ? 's' : ''} · {unreadCount} unread
          </div>
          {inboxEmails.length === 0 && !loading ? (
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.88rem', lineHeight: 1.7 }}>
              No incoming messages yet. When venues reply to your outreach, they appear here.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {inboxEmails.map(e => {
                const unread  = isUnread(e);
                const open    = expandedEmail === e.id;
                const rawBody = (e.body || '').replace(/<[^>]*>/g, '').trim();
                return (
                  <div key={e.id}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: open ? 'rgba(255,255,255,0.03)' : 'transparent' }}
                      onClick={() => {
                        setExpandedEmail(open ? null : e.id);
                        if (unread) markRead(e.id);
                      }}
                    >
                      {unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E8602A', flexShrink: 0 }} />}
                      {!unread && <span style={{ width: 7, height: 7, flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: unread ? 700 : 500, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                            {(e.venue as any)?.name || e.from_address || '—'}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{e.from_address}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: unread ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: unread ? 600 : 400, marginTop: '0.1rem' }}>{e.subject || '(no subject)'}</div>
                        {!open && rawBody && (
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.1rem' }}>{rawBody.slice(0, 120)}</div>
                        )}
                      </div>
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(e.sent_at)}</span>
                        <button
                          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: 3, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                          onClick={ev => { ev.stopPropagation(); archiveEmail(e.id); }}
                        >
                          Archive
                        </button>
                      </div>
                    </div>
                    {open && (
                      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                          From: {e.from_address} · {fmtDateFull(e.sent_at)}
                          {(e.venue as any)?.name && (
                            <> · <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#60a5fa', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }} onClick={() => setDrawerVenueId(e.venue_id)}>{(e.venue as any).name} →</button></>
                          )}
                        </div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', lineHeight: 1.75, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflowY: 'auto' }}>
                          {rawBody || '(no body)'}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ PIPELINE TAB ══ */}
      {view === 'pipeline' && (
        <div>
          {/* Pills + View Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {/* All pill */}
              <button style={pill(pipelineFilter === 'all', '#E8602A')} onClick={() => setPipelineFilter('all')}>
                All
                <span style={badge(pipelineCounts.all, '#E8602A', pipelineFilter === 'all')}>{pipelineCounts.all}</span>
              </button>
              {PIPELINE_STAGES.map(s => (
                <button key={s.key} style={pill(pipelineFilter === s.key, s.color)} onClick={() => setPipelineFilter(s.key)}>
                  {s.label}
                  <span style={badge(pipelineCounts[s.key], s.color, pipelineFilter === s.key)}>{pipelineCounts[s.key]}</span>
                </button>
              ))}
            </div>
            {/* List / Kanban toggle */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: 2, gap: 2, flexShrink: 0 }}>
              {(['list', 'kanban'] as const).map(v => (
                <button key={v} onClick={() => togglePipelineView(v)} style={{
                  padding: '0.3rem 0.75rem', borderRadius: 4, border: 'none', cursor: 'pointer',
                  background: pipelineView === v ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: pipelineView === v ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
                }}>
                  {v === 'list' ? '≡ List' : '⊞ Kanban'}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedRows.size > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.6rem 1rem', background: 'rgba(232,96,42,0.1)', border: '1px solid rgba(232,96,42,0.3)', borderRadius: 6, marginBottom: '0.75rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#E8602A' }}>{selectedRows.size} selected</span>
              <button className="btn btn-secondary" style={{ fontSize: '0.76rem', padding: '0.25rem 0.65rem' }} onClick={bulkArchive}>Archive Selected</button>
              <select className="select" style={{ fontSize: '0.76rem', padding: '0.25rem 0.5rem', height: 'auto' }} value={bulkStage} onChange={e => setBulkStage(e.target.value)}>
                <option value="">Move to Stage…</option>
                {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              {bulkStage && <button className="btn btn-primary" style={{ fontSize: '0.76rem', padding: '0.25rem 0.65rem' }} onClick={bulkMove}>Move</button>}
              <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem' }} onClick={() => setSelectedRows(new Set())}>✕ Clear</button>
            </div>
          )}

          {/* LIST VIEW */}
          {pipelineView === 'list' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}></th>
                      {sortHdr('venue',       'Venue')}
                      {sortHdr('tour',        'Tour')}
                      {sortHdr('status',      'Status')}
                      {sortHdr('lastContact', 'Last Contact')}
                      {sortHdr('daysSince',   'Days Since')}
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPipeline.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                        {allTourVenues.length === 0 ? 'No venues in pipeline. Add venues to a tour to start tracking.' : 'No venues match this filter.'}
                      </td></tr>
                    )}
                    {sortedPipeline.map(tv => {
                      const venue     = tv.venue as any;
                      const lastC     = tv.last_contacted_at || tv.pitched_at || tv.updated_at;
                      const days      = lastC ? daysSince(lastC) : null;
                      const dotColor  = days !== null ? dayCellColor(days) : 'var(--text-muted)';
                      const stColor   = STAGE_COLOR[tv.status] || 'var(--text-muted)';
                      const isOpen    = expandedRows.has(tv.id);
                      return (
                        <>
                          <tr key={tv.id} style={{ cursor: 'pointer', background: isOpen ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
                            <td onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={selectedRows.has(tv.id)} onChange={() => toggleSelect(tv.id)} style={{ accentColor: '#E8602A' }} />
                            </td>
                            <td onClick={() => toggleRow(tv.id)}>
                              <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{venue?.name || '—'}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{venue?.city ? `${venue.city}, ${venue.state}` : ''}</div>
                            </td>
                            <td onClick={() => toggleRow(tv.id)} style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>{tv.tour?.name || '—'}</td>
                            <td onClick={() => toggleRow(tv.id)}>
                              <span style={{ background: `${stColor}22`, color: stColor, fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: 4 }}>
                                {STAGE_COLOR[tv.status] ? (tv.status === 'waiting' ? 'Waiting' : tv.status === 'follow_up' ? 'Follow Up' : tv.status.charAt(0).toUpperCase() + tv.status.slice(1)) : tv.status}
                              </span>
                            </td>
                            <td onClick={() => toggleRow(tv.id)} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(lastC)}</td>
                            <td onClick={() => toggleRow(tv.id)}>
                              {days !== null ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: days >= 15 ? '#f87171' : 'var(--text-muted)' }}>{days}d</span>
                                </div>
                              ) : '—'}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.3rem' }}>
                                <button
                                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.2rem 0.5rem', border: '1px solid rgba(96,165,250,0.4)', borderRadius: 3, background: 'transparent', color: '#60a5fa', cursor: 'pointer' }}
                                  onClick={() => { setComposerTourVenue(tv); setComposerCategory('target'); }}
                                >✉ Email</button>
                                <button
                                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.2rem 0.5rem', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                                  onClick={() => setArchivePrompt({ tv })}
                                >Archive</button>
                              </div>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr key={`${tv.id}-exp`}>
                              <td colSpan={7} style={{ padding: '0.75rem 1.25rem', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                  {venue?.email && <span>✉ <a href={`mailto:${venue.email}`} style={{ color: '#60a5fa' }}>{venue.email}</a></span>}
                                  {venue?.phone && <span>📞 {venue.phone}</span>}
                                  {tv.notes && <span style={{ color: 'var(--text-secondary)' }}>📝 {tv.notes}</span>}
                                  {!venue?.email && !venue?.phone && !tv.notes && <span>No additional info.</span>}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* KANBAN VIEW */}
          {pipelineView === 'kanban' && (
            <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
              {PIPELINE_STAGES.map(stage => {
                const colVenues = allTourVenues.filter(tv => tv.status === stage.key);
                const isOver    = dragOverStage === stage.key;
                return (
                  <div
                    key={stage.key}
                    style={{ minWidth: 200, flex: '0 0 200px', background: isOver ? `${stage.color}12` : 'rgba(255,255,255,0.03)', border: `1px solid ${isOver ? stage.color : 'rgba(255,255,255,0.08)'}`, borderRadius: 8, display: 'flex', flexDirection: 'column' }}
                    onDragOver={e => { e.preventDefault(); setDragOverStage(stage.key); }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={() => handleDrop(stage.key)}
                  >
                    <div style={{ padding: '0.6rem 0.75rem', borderBottom: `2px solid ${stage.color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: stage.color }}>{stage.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: stage.color, background: `${stage.color}22`, borderRadius: 999, padding: '0 6px', minWidth: 18, textAlign: 'center' }}>{colVenues.length}</span>
                    </div>
                    <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, minHeight: 60 }}>
                      {colVenues.map(tv => {
                        const venue = tv.venue as any;
                        const days  = daysSince(tv.last_contacted_at || tv.updated_at);
                        const warn  = days >= 15;
                        return (
                          <div
                            key={tv.id}
                            draggable
                            onDragStart={() => setDraggedId(tv.id)}
                            onDragEnd={() => { setDraggedId(null); setDragOverStage(null); }}
                            style={{ background: 'rgba(255,255,255,0.05)', border: warn ? '1px solid rgba(248,113,113,0.5)' : '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '0.6rem 0.65rem', cursor: 'grab', opacity: draggedId === tv.id ? 0.4 : 1 }}
                          >
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.84rem', marginBottom: '0.15rem' }}>{venue?.name || '—'}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{venue?.city ? `${venue.city}, ${venue.state}` : ''}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                {warn && <span style={{ color: '#f87171', fontSize: '0.64rem' }}>⚠</span>}
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: warn ? '#f87171' : 'var(--text-muted)' }}>{days < 999 ? `${days}d` : '—'}</span>
                              </div>
                              <button
                                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', padding: '0.1rem 0.4rem', border: '1px solid rgba(96,165,250,0.35)', borderRadius: 3, background: 'transparent', color: '#60a5fa', cursor: 'pointer' }}
                                onClick={e => { e.stopPropagation(); setComposerTourVenue(tv); setComposerCategory('target'); }}
                              >✉</button>
                            </div>
                          </div>
                        );
                      })}
                      {colVenues.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', padding: '0.75rem 0', opacity: 0.5 }}>Drop here</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ OUTREACH TAB ══ */}
      {view === 'outreach' && (
        <>
          {/* Status filter pills */}
          <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <button style={pill(outreachFilter === 'all', '#E8602A')} onClick={() => setOutreachFilter('all')}>
              All <span style={badge(outreachCounts.all, '#E8602A', outreachFilter === 'all')}>{outreachCounts.all}</span>
            </button>
            {PIPELINE_STAGES.map(s => (
              <button key={s.key} style={pill(outreachFilter === s.key, s.color)} onClick={() => setOutreachFilter(s.key)}>
                {s.label} <span style={badge(outreachCounts[s.key], s.color, outreachFilter === s.key)}>{outreachCounts[s.key]}</span>
              </button>
            ))}
          </div>

          {/* Outreach venue table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Venue</th><th>Tour</th><th>Status</th><th>Last Contact</th><th>Days Since</th><th style={{ width: 200 }}></th></tr>
                </thead>
                <tbody>
                  {outreachFiltered.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                      {allTourVenues.length === 0 ? 'No venues in outreach yet — add venues to a tour pool to start tracking.' : 'No venues at this stage.'}
                    </td></tr>
                  )}
                  {outreachFiltered.map(tv => {
                    const venue    = tv.venue as any;
                    const lastC    = tv.last_contacted_at || tv.pitched_at || tv.updated_at;
                    const days     = lastC ? daysSince(lastC) : null;
                    const overdue  = tv.status === 'pitched' && days !== null && days >= 7;
                    const dotColor = days !== null ? (overdue ? '#f87171' : days > 3 ? '#fbbf24' : '#34d399') : '#6b7280';
                    const stColor  = STAGE_COLOR[tv.status] || 'var(--text-muted)';
                    return (
                      <tr key={tv.id}>
                        <td>
                          <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{venue?.name || '—'}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{venue?.city ? `${venue.city}, ${venue.state}` : ''}</div>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{tv.tour?.name || '—'}</td>
                        <td>
                          <span style={{ background: `${stColor}22`, color: stColor, fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.15rem 0.45rem', borderRadius: 3 }}>
                            {tv.status === 'waiting' ? 'Waiting' : tv.status === 'follow_up' ? 'Follow Up' : (tv.status || '—')}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(lastC)}</td>
                        <td>
                          {days !== null && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: overdue ? '#f87171' : 'var(--text-muted)' }}>{days}d</span>
                              {overdue && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: '#f87171', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 3, padding: '0.1rem 0.4rem' }}>Follow up</span>}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {['target', 'pitched', 'waiting', 'follow_up'].includes(tv.status) && (
                              <button style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.2rem 0.5rem', border: '1px solid rgba(96,165,250,0.4)', borderRadius: 3, background: 'transparent', color: '#60a5fa', cursor: 'pointer' }}
                                onClick={() => { setComposerTourVenue(tv); setComposerCategory('target'); }}>✉ Email</button>
                            )}
                            {(tv.status === 'pitched' || tv.status === 'waiting') && (
                              <button style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.2rem 0.5rem', border: '1px solid rgba(52,211,153,0.4)', borderRadius: 3, background: 'transparent', color: '#34d399', cursor: 'pointer' }}
                                disabled={markingReplied === tv.id}
                                onClick={() => markReplied(tv.id)}>
                                {markingReplied === tv.id ? '…' : '✓ Replied'}
                              </button>
                            )}
                            <button style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.2rem 0.5rem', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                              onClick={() => setArchivePrompt({ tv })}>Archive</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Booking email pipeline */}
          {activeBookings.length > 0 && (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                Booking Pipeline — {activeBookings.length} active
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Venue</th><th>Act</th><th>Stage</th><th>Last Contact</th><th>Next Action</th><th style={{ width: 130 }}></th></tr>
                    </thead>
                    <tbody>
                      {activeBookings.map(b => {
                        const { label, color, next } = getActionInfo(b);
                        return (
                          <tr key={b.id}>
                            <td>
                              <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{b.venue?.name || '—'}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{b.venue?.city ? `${b.venue.city}, ${b.venue.state}` : ''}</div>
                            </td>
                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{b.act?.act_name || '—'}</td>
                            <td>
                              {b.email_stage ? (
                                <span style={{ background: `${BK_STAGE_COLORS[b.email_stage] || '#64748b'}18`, color: BK_STAGE_COLORS[b.email_stage] || '#64748b', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.15rem 0.45rem', borderRadius: 3 }}>
                                  {BK_STAGE_LABELS[b.email_stage] || b.email_stage}
                                </span>
                              ) : <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>none</span>}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(b.last_contact_date)}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>{label}</span>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                                {next && (
                                  <button style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.2rem 0.5rem', border: `1px solid ${BK_STAGE_COLORS[next] || 'var(--accent)'}44`, borderRadius: 3, background: 'transparent', color: BK_STAGE_COLORS[next] || 'var(--accent)', cursor: 'pointer' }}
                                    onClick={() => { setComposerBooking(b); setComposerCategory(next); }}>
                                    ✉ {BK_STAGE_LABELS[next]}
                                  </button>
                                )}
                                {b.email_stage === 'follow_up_2' && getActionInfo(b).color === '#f87171' && (
                                  <button style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.2rem 0.5rem', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 3, background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
                                    disabled={markingCold === b.id}
                                    onClick={() => markCold(b.id)}>
                                    {markingCold === b.id ? '…' : 'Mark Cold'}
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
          )}
        </>
      )}

      {/* ══ OUTBOX TAB ══ */}
      {view === 'outbox' && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {outboxEmails.length} sent email{outboxEmails.length !== 1 ? 's' : ''}
          </div>
          {outboxEmails.length === 0 && !loading ? (
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.88rem' }}>
              No sent emails yet.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {outboxEmails.map(e => {
                const open = expandedOutbox === e.id;
                const statusColor = ({ sent: '#fbbf24', delivered: '#34d399', bounced: '#f87171', failed: '#f87171' } as any)[e.status] || 'var(--text-muted)';
                return (
                  <div key={e.id}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 1rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: open ? 'rgba(255,255,255,0.03)' : 'transparent' }}
                      onClick={() => setExpandedOutbox(open ? null : e.id)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                            {(e.venue as any)?.name || e.recipient || '—'}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{e.recipient}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: statusColor }}>{e.status}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{e.subject || '(no subject)'}</div>
                      </div>
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(e.sent_at)}</span>
                        <button
                          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: 3, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                          onClick={ev => { ev.stopPropagation(); archiveEmail(e.id); }}
                        >Archive</button>
                      </div>
                    </div>
                    {open && (
                      <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                          To: {e.recipient} · {fmtDateFull(e.sent_at)}
                        </div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', lineHeight: 1.75, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflowY: 'auto' }}>
                          {e.body || '(Email body not stored for this message)'}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ ARCHIVE TAB ══ */}
      {view === 'archive' && (
        <div>
          {/* Search bar */}
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
            <input
              className="input" placeholder="Search venue, subject…" style={{ flex: 1, minWidth: 180, maxWidth: 320 }}
              value={archiveSearch} onChange={e => setArchiveSearch(e.target.value)}
            />
            <input type="date" className="input" style={{ width: 145 }} value={archiveStart} onChange={e => setArchiveStart(e.target.value)} />
            <input type="date" className="input" style={{ width: 145 }} value={archiveEnd} onChange={e => setArchiveEnd(e.target.value)} />
            {(archiveSearch || archiveStart || archiveEnd) && (
              <button className="btn btn-secondary" style={{ fontSize: '0.78rem' }} onClick={() => { setArchiveSearch(''); setArchiveStart(''); setArchiveEnd(''); }}>Clear</button>
            )}
          </div>

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {filteredArchive.length} archived email{filteredArchive.length !== 1 ? 's' : ''}
          </div>

          {filteredArchive.length === 0 ? (
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.88rem' }}>
              {archivedEmails.length === 0 ? 'No archived emails yet.' : 'No results match your search.'}
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {filteredArchive.map(e => {
                const open    = expandedArchive === e.id;
                const rawBody = (e.body || '').replace(/<[^>]*>/g, '').trim();
                const isIn    = e.direction === 'received';
                return (
                  <div key={e.id}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 1rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: open ? 'rgba(255,255,255,0.03)' : 'transparent' }}
                      onClick={() => setExpandedArchive(open ? null : e.id)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.08em', color: isIn ? '#60a5fa' : 'var(--text-muted)', textTransform: 'uppercase', border: `1px solid ${isIn ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 3, padding: '0 4px' }}>{isIn ? 'IN' : 'OUT'}</span>
                          <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                            {(e.venue as any)?.name || (isIn ? e.from_address : e.recipient) || '—'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>{e.subject || '(no subject)'}</div>
                      </div>
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(e.sent_at)}</span>
                        <button
                          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: 3, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                          onClick={ev => { ev.stopPropagation(); unarchiveEmail(e.id); }}
                        >Restore</button>
                      </div>
                    </div>
                    {open && (
                      <div style={{ padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                          {isIn ? `From: ${e.from_address}` : `To: ${e.recipient}`} · {fmtDateFull(e.sent_at)}
                        </div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', lineHeight: 1.75, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflowY: 'auto' }}>
                          {rawBody || '(no body)'}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ Archive Outreach Prompt ══ */}
      {archivePrompt && (
        <div className="modal-backdrop" onClick={() => setArchivePrompt(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ fontSize: '1rem' }}>
                Archive {(archivePrompt.tv.venue as any)?.name || 'this venue'}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setArchivePrompt(null)}>✕</button>
            </div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Keep <strong>{(archivePrompt.tv.venue as any)?.name || 'this venue'}</strong> in the tour or remove it from the tour entirely?
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => archiveTourVenue(archivePrompt.tv.id, false)}>Keep in Tour</button>
              <button className="btn btn-danger" onClick={() => archiveTourVenue(archivePrompt.tv.id, true)}>Remove from Tour</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Composers ══ */}
      {composerTourVenue && (
        <EmailComposer
          tourVenueId={composerTourVenue.id}
          actId={(composerTourVenue.tour as any)?.act_id || ''}
          venueId={(composerTourVenue.venue as any)?.id}
          contactEmail={(composerTourVenue.venue as any)?.email || ''}
          defaultCategory={composerCategory}
          onClose={() => { setComposerTourVenue(null); loadAll(); }}
        />
      )}

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
            supabase.from('bookings').select('id, email_stage, last_contact_date')
              .eq('id', composerBooking.id).single()
              .then(({ data }) => { if (data) setBookings(bs => bs.map(b => b.id === data.id ? { ...b, ...data } : b)); });
          }}
        />
      )}

      {/* ══ Venue Drawer ══ */}
      {drawerVenueId && (
        <VenueDrawer
          venueId={drawerVenueId}
          isOpen={true}
          onClose={() => setDrawerVenueId(null)}
        />
      )}
    </AppShell>
  );
}
