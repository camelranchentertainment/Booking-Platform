// pages/email/index.tsx
//
// Email — the band's inbox, outreach pipeline, sent mail, drafts and archive.
//
// Layout (Phase 3 redesign, Oct 2026 — matches the Tours page):
//   1. Illustrated mailbox hero with "+ New email".
//   2. Four trackers: unread replies, follow-ups overdue, threads needing a
//      send, confirmed targets. The Gmail sync bar sits under them.
//   3. Tabs (Tours toggle style): Inbox · Pipeline · Outreach · Sent · Drafts · Archive.
//
// Stage rules, "what's next" for a thread, sorting and searching live in
// lib/domain/emailPipeline.ts (unit-tested). Styles: styles/email.module.css.
// Data access is unchanged from the previous version of this page.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import PageHero from '../../components/layout/PageHero';
import MailboxScene from '../../components/email/MailboxScene';
import InboxSyncBar from '../../components/email/InboxSyncBar';
import EmailComposer from '../../components/email/EmailComposer';
import VenueDrawer from '../../components/VenueDrawer';
import { useModalKeys } from '../../components/venues/useModalKeys';
import { INBOX_SYNCED_EVENT, type InboxSyncedEventDetail } from '../../lib/inboxSync';
import { supabase } from '../../lib/supabase';
import { getActId } from '../../lib/bookingQueries';
import { formatShowDate } from '../../lib/formatDate';
import {
  PIPELINE_STAGES, BOOKING_STAGE_LABELS, stageLabel, daysSince, contactTone, nextAction, isActiveThread,
  sortTargets, isOverdueFollowUp, filterArchive, plainText, summarizeEmail, lastTouch,
  type SortField, type Tone,
} from '../../lib/domain/emailPipeline';
import styles from '../../styles/email.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type TabView = 'inbox' | 'pipeline' | 'outreach' | 'outbox' | 'drafts' | 'archive';

interface VenueRef { id: string; name: string | null; city: string | null; state: string | null; email: string | null; phone?: string | null }

interface TourTarget {
  id: string; status: string; tour_id: string;
  last_contacted_at: string | null; pitched_at: string | null; updated_at: string | null; notes: string | null;
  venue: VenueRef | null;
  tour: { id: string; name: string | null; act_id: string } | null;
}

interface ThreadRow {
  id: string; status: string; show_date: string | null; email_stage: string | null; last_contact_date: string | null;
  act: { id: string; act_name: string } | null;
  venue: VenueRef | null;
  contact: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
}

interface MailItem {
  id: string; subject: string | null; body: string | null; sent_at: string | null;
  from_address?: string | null; recipient?: string | null; status?: string | null; direction?: string | null;
  venue_id: string | null; venue: { name: string | null } | null;
}

interface DraftItem {
  id: string; subject: string | null; body: string | null; category: string | null; recipient: string | null;
  updated_at: string | null; attachments: unknown; venue_id: string | null; venue: { name: string | null } | null;
}

const TABS: ReadonlyArray<{ id: TabView; label: string }> = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'outreach', label: 'Outreach' },
  { id: 'outbox', label: 'Sent' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'archive', label: 'Archive' },
];

const UNREAD_WINDOW_MS = 48 * 3_600_000;
const SENT_TONE: Readonly<Record<string, Tone>> = { sent: 'due', delivered: 'ok', bounced: 'late', failed: 'late' };

const shortDate = (d: string | null | undefined): string => (d ? formatShowDate(d, { month: 'short', day: 'numeric' }) : '—');
const longDate = (d: string | null | undefined): string =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const town = (v: VenueRef | null | undefined): string => [v?.city, v?.state].filter(Boolean).join(', ');
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** Reads a JSON array of ids from localStorage; empty when unavailable. */
function readStoredIds(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

// ── Data ──────────────────────────────────────────────────────────────────────

const INBOX_FIELDS = 'id, from_address, subject, body, sent_at, venue_id, venue:venues(name)';

interface EmailData {
  actId: string | null; userId: string;
  targets: TourTarget[]; threads: ThreadRow[]; inbox: MailItem[]; outbox: MailItem[]; drafts: DraftItem[];
}

/**
 * Loads everything the Email page shows. RLS scopes every query to the
 * caller's band; act_id / sent_by filters keep them explicit. Returns null on
 * failure (logged) so the page can offer "Try again".
 */
async function loadEmail(): Promise<EmailData | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;
    const actId = await getActId(supabase, user.id);
    const none = Promise.resolve({ data: [] as unknown[], error: null });
    const [toursRes, threadsRes, inboxRes, outboxRes, draftsRes] = await Promise.all([
      actId ? supabase.from('tours').select('id').eq('act_id', actId).neq('status', 'cancelled') : none,
      actId ? supabase.from('bookings').select(`
          id, status, show_date, email_stage, last_contact_date,
          act:acts(id, act_name),
          venue:venues(id, name, city, state, email),
          contact:contacts(id, first_name, last_name, email)
        `).eq('act_id', actId).neq('status', 'cancelled').order('show_date', { ascending: true }) : none,
      actId ? supabase.from('email_log').select(INBOX_FIELDS)
        .eq('direction', 'received').eq('act_id', actId).neq('archived', true)
        .order('sent_at', { ascending: false }).limit(100) : none,
      supabase.from('email_log')
        .select('id, recipient, subject, body, status, sent_at, template_id, venue_id, venue:venues(name)')
        .eq('sent_by', user.id).neq('direction', 'received').neq('archived', true)
        // Saved drafts are direction 'sent' too; keep them out of Sent (null = legacy rows).
        .or('is_draft.is.null,is_draft.eq.false')
        .order('sent_at', { ascending: false }).limit(200),
      actId ? supabase.from('email_log')
        .select('id, subject, body, category, recipient, updated_at, attachments, venue_id, venue:venues(name)')
        .eq('act_id', actId).eq('is_draft', true).order('updated_at', { ascending: false }).limit(100) : none,
    ]);
    const firstError = [toursRes, threadsRes, inboxRes, outboxRes, draftsRes].find(r => r.error)?.error;
    if (firstError) { console.error('[email] load failed', firstError); return null; }

    const tourIds = ((toursRes.data ?? []) as { id: string }[]).map(t => t.id);
    let targets: TourTarget[] = [];
    if (tourIds.length > 0) {
      const tv = await supabase.from('tour_venues').select(`
          id, status, tour_id, last_contacted_at, pitched_at, updated_at, notes,
          venue:venues(id, name, city, state, email, phone),
          tour:tours(id, name, act_id)
        `).in('tour_id', tourIds).order('updated_at', { ascending: false });
      if (tv.error) { console.error('[email] targets failed', tv.error); return null; }
      targets = (tv.data ?? []) as unknown as TourTarget[];
    }
    // PostgREST rows from the selects above; the casts name their shapes for this page.
    return {
      actId, userId: user.id, targets,
      threads: (threadsRes.data ?? []) as unknown as ThreadRow[],
      inbox: (inboxRes.data ?? []) as unknown as MailItem[],
      outbox: (outboxRes.data ?? []) as unknown as MailItem[],
      drafts: (draftsRes.data ?? []) as unknown as DraftItem[],
    };
  } catch (err) {
    console.error('[email] load threw', err);
    return null;
  }
}

// ── Pieces ────────────────────────────────────────────────────────────────────

const toneClass = (t: Tone): string => styles[`tone_${t}`] ?? '';

function StagePill({ stage }: { stage: string }) {
  return <span className={`${styles.stage} ${styles[`stage_${stage}`] ?? ''}`}>{stageLabel(stage)}</span>;
}

function DaysCell({ iso }: { iso: string | null }) {
  const d = daysSince(iso);
  if (d === null) return <span className={styles.muted}>—</span>;
  return <span className={`${styles.days} ${toneClass(contactTone(d))}`}><span className={styles.dot} aria-hidden="true" />{d}d</span>;
}

/** One expandable message row (inbox, sent, archive). */
function MessageRow({ title, address, subject, body, when, unread, open, onToggle, tag, actions, meta }: {
  title: string; address?: string | null; subject: string | null; body: string; when: string | null;
  unread?: boolean; open: boolean; onToggle: () => void; tag?: React.ReactNode; actions: React.ReactNode; meta: React.ReactNode;
}) {
  return (
    <li className={`${styles.msg}${unread ? ` ${styles.msgUnread}` : ''}${open ? ` ${styles.msgOpen}` : ''}`}>
      <div className={styles.msgRow}>
        <button type="button" className={styles.msgMain} aria-expanded={open} onClick={onToggle}>
          <span className={styles.unreadDot} aria-hidden="true" />
          <span className={styles.msgText}>
            <span className={styles.msgFrom}>
              {unread && <span className="sr-only">Unread: </span>}
              <strong>{title}</strong>
              {tag}
              {address && address !== title && <span className={styles.muted}>{address}</span>}
            </span>
            <span className={styles.msgSubject}>{subject || '(no subject)'}</span>
            {!open && body && <span className={styles.msgPreview}>{body.slice(0, 140)}</span>}
          </span>
          <span className={styles.msgDate}>{shortDate(when)}</span>
        </button>
        <div className={styles.msgActions}>{actions}</div>
      </div>
      {open && (
        <div className={styles.msgBody}>
          <p className={styles.msgMeta}>{meta}</p>
          <div className={styles.msgText2}>{body || '(no body)'}</div>
        </div>
      )}
    </li>
  );
}

function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card tours-empty">
      <div className="tours-empty-title">{title}</div>
      {children && <p>{children}</p>}
    </div>
  );
}

function StageFilter({ value, counts, onChange, label }: {
  value: string; counts: Record<string, number>; onChange: (v: string) => void; label: string;
}) {
  return (
    <div className="tours-tabs" role="group" aria-label={label}>
      {[{ key: 'all', label: 'All' }, ...PIPELINE_STAGES].map(s => (
        <button key={s.key} type="button" className={`tours-tab${value === s.key ? ' tours-tab--on' : ''}`}
          aria-pressed={value === s.key} onClick={() => onChange(s.key)}>
          {s.label} · {counts[s.key] ?? 0}
        </button>
      ))}
    </div>
  );
}

/** "Archive this target" — keep it on the tour as declined, or remove it from the tour. */
function ArchiveTargetDialog({ target, onKeep, onRemove, onClose }: {
  target: TourTarget; onKeep: () => void; onRemove: () => void; onClose: () => void;
}) {
  const ref = useModalKeys<HTMLDivElement>(onClose);
  const name = target.venue?.name || 'this venue';
  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="modal venues-modal venues-modal--narrow" role="dialog" aria-modal="true" aria-labelledby="archive-target-title">
        <div className="modal-header">
          <h3 className="modal-title" id="archive-target-title">Archive {name}</h3>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <p className="venues-copy">
          Keep <strong>{name}</strong> on {target.tour?.name || 'the tour'} marked as declined, or remove it from the tour entirely?
        </p>
        <div className="venues-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onKeep}>Keep as declined</button>
          <button type="button" className="btn btn-danger" onClick={onRemove}>Remove from tour</button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EmailPage() {
  const [view, setView] = useState<TabView>('inbox');
  const [data, setData] = useState<EmailData | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [archived, setArchived] = useState<MailItem[] | null>(null);
  const [archiveQ, setArchiveQ] = useState({ search: '', start: '', end: '' });
  const [openMsg, setOpenMsg] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(0);

  const [pipelineFilter, setPipelineFilter] = useState('all');
  const [pipelineView, setPipelineView] = useState<'list' | 'board'>('list');
  const [sort, setSort] = useState<{ field: SortField; dir: 'asc' | 'desc' }>({ field: 'lastContact', dir: 'desc' });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [outreachFilter, setOutreachFilter] = useState('all');
  const [archiveTarget, setArchiveTarget] = useState<TourTarget | null>(null);

  const [composeNew, setComposeNew] = useState(false);
  const [composeTarget, setComposeTarget] = useState<TourTarget | null>(null);
  const [composeThread, setComposeThread] = useState<{ thread: ThreadRow; category: string } | null>(null);
  const [composeDraft, setComposeDraft] = useState<DraftItem | null>(null);
  const [drawerVenueId, setDrawerVenueId] = useState<string | null>(null);
  const deepLinked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadEmail().then(d => {
      if (cancelled) return;
      if (!d) { setLoadState('error'); return; }
      // Browser-only state is read here, after the data arrives, so the
      // server render and the first browser render always match.
      setNow(Date.now());
      setReadIds(readStoredIds('crb_read_emails'));
      try {
        if (window.localStorage.getItem('crb_pipeline_view') === 'kanban') setPipelineView('board');
      } catch { /* storage unavailable: keep the default */ }
      // Deep links (/email?tab=outreach&status=follow_up) apply on first load only,
      // so a reload after sending doesn't yank the user to another tab.
      if (!deepLinked.current) {
        deepLinked.current = true;
        const q = new URLSearchParams(window.location.search);
        const tab = q.get('tab');
        if (tab === 'outreach' || tab === 'pipeline') setView(tab);
        const status = q.get('status');
        if (status) setOutreachFilter(status);
      }
      setData(d);
      setLoadState('ready');
    });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = useCallback((): void => { setReloadKey(k => k + 1); }, []);
  const patch = (fn: (d: EmailData) => EmailData): void => setData(d => (d ? fn(d) : d));

  // When Gmail sync imports new mail, refresh just the inbox.
  useEffect(() => {
    const onSynced = (e: Event): void => {
      const detail = (e as CustomEvent<InboxSyncedEventDetail>).detail;
      if (!detail || detail.imported <= 0 || !data?.actId) return;
      void supabase.from('email_log').select(INBOX_FIELDS)
        .eq('direction', 'received').eq('act_id', data.actId).neq('archived', true)
        .order('sent_at', { ascending: false }).limit(100)
        .then(({ data: rows, error }) => {
          if (error) { console.error('[email] inbox refresh failed', error); return; }
          patch(d => ({ ...d, inbox: (rows ?? []) as unknown as MailItem[] }));
        });
    };
    window.addEventListener(INBOX_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(INBOX_SYNCED_EVENT, onSynced);
  }, [data?.actId]);

  /** Runs one write; on failure logs it and shows a plain-English banner. */
  const run = async (id: string, what: string, op: () => PromiseLike<{ error: unknown }>, onOk: () => void): Promise<void> => {
    setBusyId(id);
    setActionError('');
    try {
      const { error } = await op();
      if (error) { console.error(`[email] ${what} failed`, error); setActionError(`Couldn’t ${what}. Try again.`); return; }
      onOk();
    } finally {
      setBusyId(null);
    }
  };

  const loadArchived = async (): Promise<void> => {
    if (!data) return;
    const { data: rows, error } = await supabase.from('email_log')
      .select('id, from_address, recipient, subject, body, sent_at, archived_at, direction, venue_id, venue:venues(name)')
      .eq('sent_by', data.userId).eq('archived', true).order('archived_at', { ascending: false }).limit(200);
    if (error) { console.error('[email] archive load failed', error); setActionError('The archive didn’t load. Try again.'); setArchived([]); return; }
    setArchived((rows ?? []) as unknown as MailItem[]);
  };

  const archiveMail = (id: string): Promise<void> => run(id, 'archive that email',
    () => supabase.from('email_log').update({ archived: true, archived_at: new Date().toISOString() }).eq('id', id),
    () => { patch(d => ({ ...d, inbox: d.inbox.filter(e => e.id !== id), outbox: d.outbox.filter(e => e.id !== id) })); setArchived(null); });

  const restoreMail = (id: string): Promise<void> => run(id, 'restore that email',
    () => supabase.from('email_log').update({ archived: false, archived_at: null }).eq('id', id),
    () => { setArchived(a => a?.filter(e => e.id !== id) ?? null); reload(); });

  const deleteDraft = (id: string): Promise<void> => run(id, 'delete that draft',
    () => supabase.from('email_log').delete().eq('id', id).eq('is_draft', true),
    () => patch(d => ({ ...d, drafts: d.drafts.filter(x => x.id !== id) })));

  const setTargetStatus = (ids: string[], status: string): Promise<void> => run(ids.join(','), 'move those venues',
    async () => {
      const results = await Promise.all(ids.map(id =>
        supabase.from('tour_venues').update({ status, updated_at: new Date().toISOString() }).eq('id', id)));
      return { error: results.find(r => r.error)?.error ?? null };
    },
    () => { patch(d => ({ ...d, targets: d.targets.map(t => (ids.includes(t.id) ? { ...t, status } : t)) })); setSelected(new Set()); setBulkStage(''); });

  const removeTarget = (id: string): Promise<void> => run(id, 'remove that venue from the tour',
    () => supabase.from('tour_venues').delete().eq('id', id),
    () => patch(d => ({ ...d, targets: d.targets.filter(t => t.id !== id) })));

  const markCold = (id: string): Promise<void> => run(id, 'mark that thread cold',
    () => supabase.from('bookings').update({ email_stage: 'cold' }).eq('id', id),
    () => patch(d => ({ ...d, threads: d.threads.map(b => (b.id === id ? { ...b, email_stage: 'cold' } : b)) })));

  const markRead = (id: string): void => {
    setReadIds(prev => {
      const next = new Set(prev).add(id);
      try { window.localStorage.setItem('crb_read_emails', JSON.stringify([...next])); } catch { /* read state is a convenience */ }
      return next;
    });
  };
  const isUnread = (e: MailItem): boolean =>
    !readIds.has(e.id) && !!e.sent_at && now > 0 && now - new Date(e.sent_at).getTime() < UNREAD_WINDOW_MS;

  const choosePipelineView = (v: 'list' | 'board'): void => {
    setPipelineView(v);
    try { window.localStorage.setItem('crb_pipeline_view', v === 'board' ? 'kanban' : 'list'); } catch { /* convenience only */ }
  };
  const toggleIn = (set: Set<string>, id: string): Set<string> => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };
  const sortBy = (field: SortField): void =>
    setSort(s => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }));

  // ── Derived ──
  const targets = useMemo(() => data?.targets ?? [], [data]);
  const threads = useMemo(() => (data?.threads ?? []).filter(isActiveThread), [data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: targets.length };
    for (const s of PIPELINE_STAGES) c[s.key] = targets.filter(t => t.status === s.key).length;
    return c;
  }, [targets]);
  const summary = useMemo(() => summarizeEmail(targets, data?.threads ?? [], now), [targets, data, now]);
  const unread = (data?.inbox ?? []).filter(isUnread).length;
  const pipelineRows = useMemo(
    () => sortTargets(pipelineFilter === 'all' ? targets : targets.filter(t => t.status === pipelineFilter), sort.field, sort.dir),
    [targets, pipelineFilter, sort],
  );
  const outreachRows = outreachFilter === 'all' ? targets : targets.filter(t => t.status === outreachFilter);
  const archiveRows = useMemo(() => filterArchive(archived ?? [], archiveQ), [archived, archiveQ]);

  const tabCount = (t: TabView): number | null => {
    if (!data) return null;
    if (t === 'inbox') return unread || data.inbox.length;
    if (t === 'pipeline') return targets.length;
    if (t === 'outreach') return summary.overdue + summary.threadsDue;
    if (t === 'outbox') return data.outbox.length;
    if (t === 'drafts') return data.drafts.length;
    return null;
  };

  const openTab = (t: TabView): void => {
    setView(t);
    setOpenMsg(null);
    if (t === 'archive' && archived === null) void loadArchived();
  };

  const heroSummary = data
    ? unread > 0
      ? `${plural(unread, 'new reply', 'new replies')} from venues · ${plural(summary.overdue, 'follow-up')} overdue.`
      : summary.overdue + summary.threadsDue > 0
        ? `Inbox is clear · ${plural(summary.overdue + summary.threadsDue, 'email')} to send.`
        : 'Inbox is clear and every thread is up to date.'
    : undefined;

  const sortHead = (field: SortField, label: string) => (
    <th scope="col" aria-sort={sort.field === field ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={styles.sortBtn} onClick={() => sortBy(field)}>
        {label}{sort.field === field ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );

  const targetActions = (t: TourTarget) => (
    <div className={styles.rowActions}>
      <button type="button" className="btn btn-ghost btn-sm venues-accent" onClick={() => setComposeTarget(t)}
        aria-label={`Email ${t.venue?.name || 'this venue'}`}>✉ Email</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArchiveTarget(t)} disabled={busyId === t.id}
        aria-label={`Archive ${t.venue?.name || 'this venue'}`}>Archive</button>
    </div>
  );

  return (
    <AppShell requireRole="band_admin">
      <PageHero
        title="Email"
        subtitle="Inbox, outreach & follow-ups"
        summary={heroSummary}
        scene={<MailboxScene />}
        actions={<button type="button" className="btn btn-primary tours-new-btn" onClick={() => setComposeNew(true)} disabled={!data?.actId}>+ New email</button>}
      />

      {loadState === 'loading' && (
        <div className="tours-body" aria-busy="true">
          <span className="sr-only" role="status">Loading email…</span>
          <div className="tours-metrics">{[0, 1, 2, 3].map(i => <div key={i} className="tour-metric tour-skeleton" />)}</div>
          <div className={`tour-skeleton ${styles.skeletonList}`} />
        </div>
      )}

      {loadState === 'error' && (
        <div className="card tours-empty" role="alert">
          <div className="tours-empty-title">Email didn’t load</div>
          <p>Something went wrong reaching the database. Nothing was lost — try again.</p>
          <button type="button" className="btn btn-primary" onClick={() => { setLoadState('loading'); reload(); }}>Try again</button>
        </div>
      )}

      {loadState === 'ready' && data && (
        <div className="tours-body">
          <section className="tours-metrics" aria-label="Email at a glance">
            <button type="button" className={`tour-metric ${styles.metricBtn}`} onClick={() => openTab('inbox')}>
              <span className="tour-metric-label">New replies</span>
              <span className="tour-metric-value"><strong className={unread > 0 ? 'tour-metric-hot' : undefined}>{unread}</strong><span>unread · {data.inbox.length} in inbox</span></span>
            </button>
            <button type="button" className={`tour-metric ${styles.metricBtn}`} onClick={() => { setOutreachFilter('follow_up'); openTab('outreach'); }}>
              <span className="tour-metric-label">Follow-ups overdue</span>
              <span className="tour-metric-value"><strong className={summary.overdue > 0 ? 'tour-metric-hot' : undefined}>{summary.overdue}</strong><span>quiet a week or more</span></span>
            </button>
            <button type="button" className={`tour-metric ${styles.metricBtn}`} onClick={() => { setOutreachFilter('all'); openTab('outreach'); }}>
              <span className="tour-metric-label">Booking emails due</span>
              <span className="tour-metric-value"><strong>{summary.threadsDue}</strong><span>pitch, advance or thank-you</span></span>
            </button>
            <button type="button" className={`tour-metric ${styles.metricBtn}`} onClick={() => { setPipelineFilter('confirmed'); openTab('pipeline'); }}>
              <span className="tour-metric-label">Confirmed</span>
              <span className="tour-metric-value"><strong>{summary.confirmed}</strong><span>of {plural(summary.targets, 'target')}</span></span>
            </button>
          </section>

          <InboxSyncBar />

          {actionError && (
            <div className="venues-banner" role="alert">
              <span>{actionError}</span>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Dismiss" onClick={() => setActionError('')}>✕</button>
            </div>
          )}

          <div className="tours-toolbar">
            <div className="tours-tabs" role="tablist" aria-label="Email sections">
              {TABS.map(t => {
                const n = tabCount(t.id);
                return (
                  <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={view === t.id} aria-controls={`panel-${t.id}`}
                    className={`tours-tab${view === t.id ? ' tours-tab--on' : ''}`} onClick={() => openTab(t.id)}>
                    {t.label}{n ? ` · ${n}` : ''}
                    {t.id === 'inbox' && unread > 0 && <span className={styles.newBadge}>new</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
            {view === 'inbox' && (data.inbox.length === 0
              ? <Empty title="No replies yet">When venues answer your outreach, their emails land here.</Empty>
              : (
                <ul className={styles.msgList}>
                  {data.inbox.map(e => {
                    const body = plainText(e.body);
                    const isNew = isUnread(e);
                    return (
                      <MessageRow
                        key={e.id}
                        title={e.venue?.name || e.from_address || 'Unknown sender'}
                        address={e.from_address}
                        subject={e.subject}
                        body={body}
                        when={e.sent_at}
                        unread={isNew}
                        open={openMsg === e.id}
                        onToggle={() => { setOpenMsg(o => (o === e.id ? null : e.id)); if (isNew) markRead(e.id); }}
                        actions={<button type="button" className="btn btn-ghost btn-sm" disabled={busyId === e.id} onClick={() => void archiveMail(e.id)}>Archive</button>}
                        meta={<>From {e.from_address} · {longDate(e.sent_at)}{e.venue?.name && e.venue_id && <> · <button type="button" className="venues-link-btn" onClick={() => setDrawerVenueId(e.venue_id)}>Open {e.venue.name} →</button></>}</>}
                      />
                    );
                  })}
                </ul>
              ))}

            {view === 'pipeline' && (
              <div className={styles.stack}>
                <div className={styles.toolbar}>
                  <StageFilter value={pipelineFilter} counts={counts} onChange={setPipelineFilter} label="Filter by stage" />
                  <div className="tours-tabs" role="group" aria-label="Pipeline layout">
                    {(['list', 'board'] as const).map(v => (
                      <button key={v} type="button" className={`tours-tab${pipelineView === v ? ' tours-tab--on' : ''}`} aria-pressed={pipelineView === v} onClick={() => choosePipelineView(v)}>
                        {v === 'list' ? 'List' : 'Board'}
                      </button>
                    ))}
                  </div>
                </div>

                {selected.size > 0 && (
                  <div className={styles.bulkBar} role="region" aria-label="Bulk actions">
                    <strong>{selected.size} selected</strong>
                    <label className="sr-only" htmlFor="bulk-stage">Move to stage</label>
                    <select id="bulk-stage" className="select" value={bulkStage} onChange={e => setBulkStage(e.target.value)}>
                      <option value="">Move to stage…</option>
                      {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <button type="button" className="btn btn-primary btn-sm" disabled={!bulkStage} onClick={() => void setTargetStatus([...selected], bulkStage)}>Move</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void setTargetStatus([...selected], 'declined')}>Mark declined</button>
                    <button type="button" className="venues-link-btn" onClick={() => setSelected(new Set())}>Clear</button>
                  </div>
                )}

                {pipelineView === 'list' ? (pipelineRows.length === 0
                  ? <Empty title={targets.length === 0 ? 'No venues in the pipeline' : 'Nothing at this stage'}>{targets.length === 0 ? 'Add target venues to a tour to start tracking outreach.' : undefined}</Empty>
                  : (
                    <div className="venues-table-wrap">
                      <table className="venues-table">
                        <caption className="sr-only">Outreach pipeline</caption>
                        <thead>
                          <tr>
                            <th scope="col"><span className="sr-only">Select</span></th>
                            {sortHead('venue', 'Venue')}
                            {sortHead('tour', 'Tour')}
                            {sortHead('status', 'Stage')}
                            {sortHead('lastContact', 'Last contact')}
                            <th scope="col">Since</th>
                            <th scope="col"><span className="sr-only">Actions</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {pipelineRows.map(t => {
                            const open = expanded.has(t.id);
                            return (
                              <Fragment key={t.id}>
                                <tr>
                                  <td><input type="checkbox" className={styles.check} checked={selected.has(t.id)} onChange={() => setSelected(s => toggleIn(s, t.id))} aria-label={`Select ${t.venue?.name || 'venue'}`} /></td>
                                  <td>
                                    <button type="button" className="venues-row-name" aria-expanded={open} onClick={() => setExpanded(s => toggleIn(s, t.id))}>{t.venue?.name || 'Venue'}</button>
                                    <div className={styles.muted}>{town(t.venue)}</div>
                                  </td>
                                  <td>{t.tour?.name || '—'}</td>
                                  <td><StagePill stage={t.status} /></td>
                                  <td className={styles.nowrap}>{shortDate(lastTouch(t))}</td>
                                  <td><DaysCell iso={lastTouch(t)} /></td>
                                  <td>{targetActions(t)}</td>
                                </tr>
                                {open && (
                                  <tr className={styles.detailRow}>
                                    <td colSpan={7}>
                                      {t.venue?.email && <a href={`mailto:${t.venue.email}`} className="venues-email">✉ {t.venue.email}</a>}
                                      {t.venue?.phone && <a href={`tel:${t.venue.phone}`} className="venues-muted">{t.venue.phone}</a>}
                                      {t.notes && <span>{t.notes}</span>}
                                      {!t.venue?.email && !t.venue?.phone && !t.notes && <span className={styles.muted}>No contact details yet.</span>}
                                      {t.venue?.id && <button type="button" className="venues-link-btn" onClick={() => setDrawerVenueId(t.venue!.id)}>Open venue →</button>}
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )) : (
                  <div className={styles.board}>
                    {PIPELINE_STAGES.map(stage => {
                      const col = targets.filter(t => t.status === stage.key);
                      return (
                        <section key={stage.key}
                          className={`${styles.column}${dragOver === stage.key ? ` ${styles.columnOver}` : ''}`}
                          aria-label={`${stage.label}: ${col.length}`}
                          onDragOver={e => { e.preventDefault(); setDragOver(stage.key); }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={() => { const id = dragId; setDragId(null); setDragOver(null); const t = targets.find(x => x.id === id); if (t && t.status !== stage.key) void setTargetStatus([t.id], stage.key); }}
                        >
                          <header className={styles.columnHead}><StagePill stage={stage.key} /><span>{col.length}</span></header>
                          {col.map(t => {
                            const d = daysSince(lastTouch(t));
                            return (
                              <article key={t.id} className={`${styles.card}${dragId === t.id ? ` ${styles.cardDragging}` : ''}${d !== null && d >= 15 ? ` ${styles.cardWarn}` : ''}`}
                                draggable onDragStart={() => setDragId(t.id)} onDragEnd={() => { setDragId(null); setDragOver(null); }}>
                                <strong>{t.venue?.name || 'Venue'}</strong>
                                <span className={styles.muted}>{town(t.venue)}</span>
                                <div className={styles.cardFoot}>
                                  <DaysCell iso={lastTouch(t)} />
                                  {/* Keyboard alternative to dragging */}
                                  <label className="sr-only" htmlFor={`move-${t.id}`}>Move {t.venue?.name || 'venue'} to</label>
                                  <select id={`move-${t.id}`} className={styles.moveSelect} value={t.status} onChange={e => void setTargetStatus([t.id], e.target.value)}>
                                    {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                  </select>
                                  <button type="button" className="btn btn-ghost btn-sm venues-accent" onClick={() => setComposeTarget(t)} aria-label={`Email ${t.venue?.name || 'venue'}`}>✉</button>
                                </div>
                              </article>
                            );
                          })}
                          {col.length === 0 && <p className={styles.dropHint}>Drop here</p>}
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {view === 'outreach' && (
              <div className={styles.stack}>
                <StageFilter value={outreachFilter} counts={counts} onChange={setOutreachFilter} label="Filter outreach by stage" />
                {outreachRows.length === 0
                  ? <Empty title={targets.length === 0 ? 'No outreach yet' : 'Nothing at this stage'}>{targets.length === 0 ? 'Add venues to a tour’s target pool to start tracking.' : undefined}</Empty>
                  : (
                    <div className="venues-table-wrap">
                      <table className="venues-table">
                        <caption className="sr-only">Tour outreach</caption>
                        <thead><tr><th scope="col">Venue</th><th scope="col">Tour</th><th scope="col">Stage</th><th scope="col">Last contact</th><th scope="col">Since</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                        <tbody>
                          {outreachRows.map(t => (
                            <tr key={t.id}>
                              <td><strong>{t.venue?.name || 'Venue'}</strong><div className={styles.muted}>{town(t.venue)}</div></td>
                              <td>{t.tour?.name || '—'}</td>
                              <td><StagePill stage={t.status} /></td>
                              <td className={styles.nowrap}>{shortDate(lastTouch(t))}</td>
                              <td>
                                <DaysCell iso={lastTouch(t)} />
                                {isOverdueFollowUp(t) && <span className={`tour-badge tour-badge--urgent ${styles.inlineBadge}`}>Follow up</span>}
                              </td>
                              <td>{targetActions(t)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                {threads.length > 0 && (
                  <section className={styles.stack} aria-labelledby="threads-title">
                    <h2 className="venues-section-title" id="threads-title">Booking emails · {threads.length} active</h2>
                    <div className="venues-table-wrap">
                      <table className="venues-table">
                        <caption className="sr-only">Booking email threads</caption>
                        <thead><tr><th scope="col">Venue</th><th scope="col">Show</th><th scope="col">Stage</th><th scope="col">Last contact</th><th scope="col">Next step</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                        <tbody>
                          {threads.map(b => {
                            const a = nextAction(b, now);
                            return (
                              <tr key={b.id}>
                                <td><strong>{b.venue?.name || 'Venue'}</strong><div className={styles.muted}>{town(b.venue)}</div></td>
                                <td className={styles.nowrap}>{shortDate(b.show_date)}</td>
                                <td>{b.email_stage ? <span className={styles.stage}>{BOOKING_STAGE_LABELS[b.email_stage] ?? b.email_stage}</span> : <span className={styles.muted}>Not started</span>}</td>
                                <td className={styles.nowrap}>{shortDate(b.last_contact_date)}</td>
                                <td><span className={`${styles.days} ${toneClass(a.tone)}`}><span className={styles.dot} aria-hidden="true" />{a.label}</span></td>
                                <td>
                                  <div className={styles.rowActions}>
                                    {a.next && (
                                      <button type="button" className="btn btn-ghost btn-sm venues-accent" onClick={() => setComposeThread({ thread: b, category: a.next! })}>
                                        ✉ {BOOKING_STAGE_LABELS[a.next] ?? a.next}
                                      </button>
                                    )}
                                    {b.email_stage === 'follow_up_2' && a.tone === 'late' && (
                                      <button type="button" className="btn btn-ghost btn-sm" disabled={busyId === b.id} onClick={() => void markCold(b.id)}>Mark cold</button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </div>
            )}

            {view === 'outbox' && (data.outbox.length === 0
              ? <Empty title="Nothing sent yet">Emails you send from Camel Ranch show up here with their delivery status.</Empty>
              : (
                <ul className={styles.msgList}>
                  {data.outbox.map(e => (
                    <MessageRow
                      key={e.id}
                      title={e.venue?.name || e.recipient || 'Recipient'}
                      address={e.recipient}
                      subject={e.subject}
                      body={plainText(e.body)}
                      when={e.sent_at}
                      open={openMsg === e.id}
                      onToggle={() => setOpenMsg(o => (o === e.id ? null : e.id))}
                      tag={e.status ? <span className={`${styles.days} ${toneClass(SENT_TONE[e.status] ?? 'done')}`}><span className={styles.dot} aria-hidden="true" />{e.status}</span> : undefined}
                      actions={<button type="button" className="btn btn-ghost btn-sm" disabled={busyId === e.id} onClick={() => void archiveMail(e.id)}>Archive</button>}
                      meta={<>To {e.recipient} · {longDate(e.sent_at)}</>}
                    />
                  ))}
                </ul>
              ))}

            {view === 'drafts' && (data.drafts.length === 0
              ? <Empty title="No drafts">Use “Save draft” in the composer and it waits here.</Empty>
              : (
                <ul className={styles.msgList}>
                  {data.drafts.map(d => (
                    <li key={d.id} className={styles.msg}>
                      <div className={styles.msgRow}>
                        <button type="button" className={styles.msgMain} onClick={() => setComposeDraft(d)} aria-label={`Edit draft to ${d.venue?.name || d.recipient || 'recipient'}`}>
                          <span className={styles.unreadDot} aria-hidden="true" />
                          <span className={styles.msgText}>
                            <span className={styles.msgFrom}>
                              <strong>{d.venue?.name || d.recipient || 'No recipient yet'}</strong>
                              {d.category && <span className={styles.stage}>{BOOKING_STAGE_LABELS[d.category] ?? d.category}</span>}
                            </span>
                            <span className={styles.msgSubject}>{d.subject || '(no subject)'}</span>
                          </span>
                          <span className={styles.msgDate}>{shortDate(d.updated_at)}</span>
                        </button>
                        <div className={styles.msgActions}>
                          <button type="button" className="btn btn-ghost btn-sm venues-accent" onClick={() => setComposeDraft(d)}>Edit</button>
                          <button type="button" className="btn btn-ghost btn-sm venues-danger" disabled={busyId === d.id} onClick={() => void deleteDraft(d.id)}>Delete</button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ))}

            {view === 'archive' && (
              <div className={styles.stack}>
                <div className="venues-filters" role="search">
                  <label className="sr-only" htmlFor="archive-search">Search archive</label>
                  <input id="archive-search" type="search" className="input venues-search" placeholder="Search venue or subject…"
                    value={archiveQ.search} onChange={e => setArchiveQ(q => ({ ...q, search: e.target.value }))} />
                  <label className={styles.dateLabel} htmlFor="archive-from">From</label>
                  <input id="archive-from" type="date" className="input" value={archiveQ.start} onChange={e => setArchiveQ(q => ({ ...q, start: e.target.value }))} />
                  <label className={styles.dateLabel} htmlFor="archive-to">To</label>
                  <input id="archive-to" type="date" className="input" value={archiveQ.end} onChange={e => setArchiveQ(q => ({ ...q, end: e.target.value }))} />
                  {(archiveQ.search || archiveQ.start || archiveQ.end) && (
                    <button type="button" className="venues-link-btn" onClick={() => setArchiveQ({ search: '', start: '', end: '' })}>Clear</button>
                  )}
                  <span className="tours-sort-note" role="status">{archived === null ? 'Loading…' : plural(archiveRows.length, 'email')}</span>
                </div>
                {archived !== null && (archiveRows.length === 0
                  ? <Empty title={archived.length === 0 ? 'Archive is empty' : 'No matches'} />
                  : (
                    <ul className={styles.msgList}>
                      {archiveRows.map(e => {
                        const incoming = e.direction === 'received';
                        return (
                          <MessageRow
                            key={e.id}
                            title={e.venue?.name || (incoming ? e.from_address : e.recipient) || 'Unknown'}
                            address={incoming ? e.from_address : e.recipient}
                            subject={e.subject}
                            body={plainText(e.body)}
                            when={e.sent_at}
                            open={openMsg === e.id}
                            onToggle={() => setOpenMsg(o => (o === e.id ? null : e.id))}
                            tag={<span className="tour-badge tour-badge--outline">{incoming ? 'Received' : 'Sent'}</span>}
                            actions={<button type="button" className="btn btn-ghost btn-sm" disabled={busyId === e.id} onClick={() => void restoreMail(e.id)}>Restore</button>}
                            meta={<>{incoming ? `From ${e.from_address}` : `To ${e.recipient}`} · {longDate(e.sent_at)}</>}
                          />
                        );
                      })}
                    </ul>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {archiveTarget && (
        <ArchiveTargetDialog
          target={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onKeep={() => { const id = archiveTarget.id; setArchiveTarget(null); void setTargetStatus([id], 'declined'); }}
          onRemove={() => { const id = archiveTarget.id; setArchiveTarget(null); void removeTarget(id); }}
        />
      )}

      {composeNew && data?.actId && (
        <EmailComposer actId={data.actId} defaultCategory="target" onClose={() => { setComposeNew(false); reload(); }} />
      )}
      {composeTarget && (
        <EmailComposer
          tourVenueId={composeTarget.id}
          actId={composeTarget.tour?.act_id || data?.actId || ''}
          venueId={composeTarget.venue?.id}
          contactEmail={composeTarget.venue?.email || ''}
          defaultCategory="target"
          onClose={() => { setComposeTarget(null); reload(); }}
        />
      )}
      {composeThread && (
        <EmailComposer
          bookingId={composeThread.thread.id}
          actId={composeThread.thread.act?.id || data?.actId || ''}
          venueId={composeThread.thread.venue?.id}
          contactId={composeThread.thread.contact?.id}
          contactEmail={composeThread.thread.contact?.email || composeThread.thread.venue?.email || ''}
          defaultCategory={composeThread.category}
          onClose={() => { setComposeThread(null); reload(); }}
        />
      )}
      {composeDraft && (
        <EmailComposer
          actId={data?.actId || ''}
          venueId={composeDraft.venue_id || undefined}
          contactEmail={composeDraft.recipient || undefined}
          defaultCategory={composeDraft.category || 'target'}
          initialSubject={composeDraft.subject || undefined}
          initialBody={composeDraft.body || undefined}
          initialAttachments={Array.isArray(composeDraft.attachments) ? composeDraft.attachments : undefined}
          draftId={composeDraft.id}
          onClose={() => { setComposeDraft(null); reload(); }}
        />
      )}
      {drawerVenueId && <VenueDrawer venueId={drawerVenueId} isOpen={true} onClose={() => setDrawerVenueId(null)} />}
    </AppShell>
  );
}
