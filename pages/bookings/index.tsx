// pages/bookings/index.tsx
//
// Bookings — every show in the pipeline, in the Tours style: an illustrated
// header, a stage strip that doubles as a filter, Upcoming / Past / All,
// search, and a Board (one column per stage) or a List (grouped by month).
// Shows whose date has passed but were never settled are flagged so they get
// marked played and paid.
//
// Band admins only (AppShell requireRole). Bookings are read with the
// caller's session, so RLS limits them to the caller's band. The view rules
// live in lib/domain/bookingsList.ts.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '../../components/layout/AppShell';
import PageHero from '../../components/layout/PageHero';
import MarqueeScene from '../../components/bookings/MarqueeScene';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatShowDate, localToday } from '../../lib/formatDate';
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_ORDER, type BookingStatus } from '../../lib/types';
import {
  dealAmount, filterBookings, groupByMonth, needsSettling, nextShow, stageCounts,
  type BookingsTab, type ListBooking,
} from '../../lib/domain/bookingsList';
import styles from '../../styles/bookings.module.css';

type Layout = 'board' | 'list';
const LAYOUT_KEY = 'crb.bookingsLayout';
const TABS: Array<{ tab: BookingsTab; label: string }> = [
  { tab: 'upcoming', label: 'Upcoming' },
  { tab: 'past', label: 'Past' },
  { tab: 'all', label: 'All' },
];

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const stageColor = (s: string) => ({ '--stage-color': `var(--status-${s}, var(--border))` } as React.CSSProperties);

function DateBlock({ date }: { date: string | null }) {
  if (!date) return <span className={styles.dateBlock}><span className={styles.dateTbd}>TBD</span></span>;
  return (
    <span className={styles.dateBlock} aria-hidden="true">
      <span className={styles.dateMonth}>{formatShowDate(date, { month: 'short' })}</span>
      <span className={styles.dateDay}>{formatShowDate(date, { day: 'numeric' })}</span>
      <span className={styles.dateDow}>{formatShowDate(date, { weekday: 'short' })}</span>
    </span>
  );
}

/** One booking as a card; used on the board and in the list. */
function BookingCard({ b, today, showStage }: { b: ListBooking; today: string; showStage: boolean }) {
  const amount = dealAmount(b);
  const where = [b.venue?.city, b.venue?.state].filter(Boolean).join(', ');
  const settle = needsSettling(b, today);
  const label = [
    b.venue?.name || 'No venue yet',
    b.show_date ? formatShowDate(b.show_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'date to be set',
    where,
    BOOKING_STATUS_LABELS[b.status as BookingStatus] ?? b.status,
    amount != null ? money(amount) : '',
    settle ? 'needs settling' : '',
  ].filter(Boolean).join(', ');
  return (
    <Link href={`/bookings/${b.id}`} className={`${styles.card} ${settle ? styles.cardFlag : ''}`} style={stageColor(b.status)} aria-label={label}>
      <DateBlock date={b.show_date} />
      <span className={styles.cardText}>
        <span className={styles.cardVenue}>{b.venue?.name || 'No venue yet'}</span>
        <span className={styles.cardMeta}>{[where, b.tour?.name].filter(Boolean).join(' · ') || '—'}</span>
        <span className={styles.cardFoot}>
          {showStage && <span className={`${styles.tag} ${styles.tagStage}`}>{BOOKING_STATUS_LABELS[b.status as BookingStatus] ?? b.status}</span>}
          {amount != null && <span className={styles.amount}>{money(amount)}</span>}
          {settle && <span className={`${styles.tag} ${styles.tagWarn}`}>Needs settling</span>}
        </span>
      </span>
    </Link>
  );
}

export default function BookingsPage() {
  const { profile } = useAuth();
  const actId = profile?.act_id ?? null;
  const today = localToday();

  const [bookings, setBookings] = useState<ListBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [tab, setTab] = useState<BookingsTab>('upcoming');
  const [stage, setStage] = useState<BookingStatus | null>(null);
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<Layout>('board');
  // The saved layout is read after mount so the server render and the first
  // client render match.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(LAYOUT_KEY) === 'list') setLayout('list');
    } catch { /* storage unavailable: default layout */ }
  }, []);
  const pickLayout = (l: Layout) => {
    setLayout(l);
    try { window.localStorage.setItem(LAYOUT_KEY, l); } catch { /* storage unavailable: keep it for this visit only */ }
  };

  useEffect(() => {
    if (!actId) return;
    let cancelled = false;
    void (async () => {
      const { data, error: err } = await supabase
        .from('bookings')
        .select('id, show_date, status, agreed_amount, fee, venue:venues(name, city, state), tour:tours(name)')
        .eq('act_id', actId)
        .neq('status', 'cancelled')
        .order('show_date', { ascending: true, nullsFirst: false });
      if (cancelled) return;
      if (err) {
        console.error('[bookings] load failed', err);
        setError('Bookings could not be loaded.');
      } else {
        setBookings((data ?? []) as unknown as ListBooking[]);
        setError(null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [actId, reloadKey]);

  const counts = useMemo(() => stageCounts(bookings), [bookings]);
  const shown = useMemo(() => filterBookings(bookings, { tab, status: stage, query }, today), [bookings, tab, stage, query, today]);
  const unsettled = useMemo(() => bookings.filter(b => needsSettling(b, today)), [bookings, today]);
  const next = useMemo(() => nextShow(bookings, today), [bookings, today]);

  const columns = (stage ? [stage] : BOOKING_STATUS_ORDER.filter(s => tab !== 'upcoming' || s !== 'completed'))
    .map(s => ({ status: s, items: shown.filter(b => b.status === s) }));

  const inTalks = counts.filter(c => ['pitch', 'negotiation', 'hold'].includes(c.status)).reduce((n, c) => n + c.count, 0);
  const onBooks = bookings.filter(b => ['contract', 'confirmed', 'advancing'].includes(b.status) && (!b.show_date || b.show_date >= today)).length;
  const summary = loading ? undefined
    : `${plural(onBooks, 'show')} on the books · ${inTalks} in talks${next?.show_date ? ` · next up ${formatShowDate(next.show_date, { month: 'short', day: 'numeric' })}, ${next.venue?.name ?? 'venue TBA'}` : ''}.`;

  const filtered = stage != null || query.trim() !== '';

  return (
    <AppShell requireRole="band_admin">
      <div className={styles.page}>
        <PageHero
          title="Bookings"
          subtitle="Every show in the pipeline"
          summary={summary}
          scene={<MarqueeScene />}
          actions={<Link href="/bookings/new" className="btn btn-primary">+ New booking</Link>}
        />

        {error && (
          <p className={styles.error} role="alert">
            {error} <button type="button" className="btn btn-secondary" onClick={() => { setLoading(true); setReloadKey(k => k + 1); }}>Try again</button>
          </p>
        )}

        {/* Stage strip — counts, and a filter */}
        <ul className={styles.stages} aria-label="Pipeline stages">
          {counts.map(c => (
            <li key={c.status}>
              <button
                type="button"
                className={`${styles.stage} ${stage === c.status ? styles.stageOn : ''}`}
                style={stageColor(c.status)}
                aria-pressed={stage === c.status}
                onClick={() => setStage(s => (s === c.status ? null : c.status))}
              >
                <span className={styles.stageLabel}>{BOOKING_STATUS_LABELS[c.status]}</span>
                <span className={styles.stageCount}>{loading ? '–' : c.count}</span>
              </button>
            </li>
          ))}
        </ul>

        {!loading && unsettled.length > 0 && (
          <div className={styles.notice} role="status">
            <span><strong>{plural(unsettled.length, 'show has', 'shows have')} been played but not settled.</strong> Mark each one played and record what you were paid.</span>
            <button type="button" className="btn btn-secondary" onClick={() => { setTab('upcoming'); setStage(null); setQuery(''); pickLayout('list'); }}>Show them first</button>
          </div>
        )}

        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <div className="tours-tabs" role="group" aria-label="Which shows">
              {TABS.map(t => (
                <button key={t.tab} type="button" className={`tours-tab${tab === t.tab ? ' tours-tab--on' : ''}`} aria-pressed={tab === t.tab} onClick={() => setTab(t.tab)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.toolbarRight}>
            <label className={styles.search}>
              <span className="sr-only">Search bookings</span>
              <span className={styles.searchIcon} aria-hidden="true">⌕</span>
              <input type="search" className="input" placeholder="Venue, city or tour" value={query} onChange={e => setQuery(e.target.value)} />
            </label>
            <div className="tours-tabs" role="group" aria-label="Layout">
              <button type="button" className={`tours-tab${layout === 'board' ? ' tours-tab--on' : ''}`} aria-pressed={layout === 'board'} onClick={() => pickLayout('board')}>Board</button>
              <button type="button" className={`tours-tab${layout === 'list' ? ' tours-tab--on' : ''}`} aria-pressed={layout === 'list'} onClick={() => pickLayout('list')}>List</button>
            </div>
          </div>
        </div>

        {filtered && (
          <p className={styles.filterNote} aria-live="polite">
            {plural(shown.length, 'show')}{stage ? ` in ${BOOKING_STATUS_LABELS[stage]}` : ''}{query.trim() ? ` matching “${query.trim()}”` : ''}.
            <button type="button" className={styles.linkBtn} onClick={() => { setStage(null); setQuery(''); }}>Clear filters</button>
          </p>
        )}

        {loading ? (
          <div className={styles.board} aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className={`tour-skeleton ${styles.skeleton}`} style={{ minHeight: '16rem' }} />)}
          </div>
        ) : bookings.length === 0 ? (
          <div className={styles.empty}>
            <h2>No bookings yet</h2>
            <p>Add a show you&apos;ve booked, or start a tour and pitch venues. Confirmed shows land here automatically.</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Link href="/bookings/new" className="btn btn-primary">+ New booking</Link>
              <Link href="/tours" className="btn btn-secondary">Go to Tours</Link>
            </div>
          </div>
        ) : shown.length === 0 ? (
          <div className={styles.empty}>
            <h2>Nothing here</h2>
            <p>{filtered ? 'No shows match these filters.' : tab === 'past' ? 'No past shows yet.' : 'No upcoming shows. Time to pitch some venues.'}</p>
            {filtered && <button type="button" className="btn btn-secondary" onClick={() => { setStage(null); setQuery(''); }}>Clear filters</button>}
          </div>
        ) : layout === 'board' ? (
          <div className={styles.board} role="region" aria-label="Bookings board" tabIndex={0}>
            {columns.map(col => (
              <section key={col.status} className={styles.column} style={stageColor(col.status)} aria-labelledby={`col-${col.status}`}>
                <div className={styles.columnHead}>
                  <h2 id={`col-${col.status}`} className={styles.columnTitle}>{BOOKING_STATUS_LABELS[col.status]}</h2>
                  <span className={styles.columnCount}>{col.items.length}</span>
                </div>
                {col.items.length === 0 ? <p className={styles.columnEmpty}>None</p> : (
                  <ul className={styles.cards}>
                    {col.items.map(b => <li key={b.id}><BookingCard b={b} today={today} showStage={false} /></li>)}
                  </ul>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className={styles.list}>
            {groupByMonth(shown).map(g => (
              <section key={g.key} className={styles.month} aria-labelledby={`m-${g.key}`}>
                <div className={styles.monthHead}>
                  <h2 id={`m-${g.key}`} className={styles.monthTitle}>{g.label}</h2>
                  <span className={styles.monthMeta}>{plural(g.items.length, 'show')}</span>
                </div>
                <ul className={styles.rows}>
                  {g.items.map(b => <li key={b.id}><BookingCard b={b} today={today} showStage /></li>)}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
