// pages/calendar.tsx
//
// Calendar — every show and tour night for the signed-in band.
//
// Layout (Phase 3 redesign, Oct 2026 — matches the Tours page):
//   1. Illustrated billboard hero with "+ Add show" and Export.
//   2. Four trackers: booked this month, next show, next 30 days, in outreach.
//   3. Toolbar: Month / Week / List, period navigation, Today, legend.
//   4. Month grid with a day panel and Upcoming list; Week strip; List table.
//
// Dates, the grid, the legend and the counts live in lib/domain/calendarView.ts
// (unit-tested). Tour placeholders come from lib/domain/tourPlaceholders.ts.
// Styles are in styles/calendar.module.css.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppShell from '../components/layout/AppShell';
import PageHero from '../components/layout/PageHero';
import BillboardScene from '../components/calendar/BillboardScene';
import { useModalKeys } from '../components/venues/useModalKeys';
import { supabase } from '../lib/supabase';
import { getActId, getBandBookings } from '../lib/bookingQueries';
import { BOOKING_STATUS_LABELS, BOOKED_SHOW_STATUSES, isVisibleOnAppCalendar } from '../lib/types';
import {
  buildTourPlaceholders, type PlaceholderTarget, type PlaceholderTour, type TourPlaceholder,
} from '../lib/domain/tourPlaceholders';
import { formatShowDate, localToday, parseLocalDate } from '../lib/formatDate';
import { buildIcal, downloadIcal } from '../lib/ical';
import {
  monthGrid, weekDays, toDateStr, statusColor, inkOn, statusLegend, summarizeCalendar, byDate, clock,
} from '../lib/domain/calendarView';
import styles from '../styles/calendar.module.css';

type ViewMode = 'month' | 'week' | 'list';
type LoadState = 'loading' | 'ready' | 'error';

/** The booking fields this page reads (getBandBookings selects `*` plus venue and act). */
interface CalBooking {
  id: string;
  act_id: string;
  show_date: string | null;
  status: string;
  set_time: string | null;
  agreed_amount: number | null;
  venue: { id: string; name: string | null; city: string | null; state: string | null } | null;
  act: { id: string; act_name: string } | null;
}

interface VenuePick { id: string; name: string; city: string | null; state: string | null }

const VIEW_LABELS: Readonly<Record<ViewMode, string>> = { month: 'Month', week: 'Week', list: 'List' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TARGET_STATUS_LABEL: Readonly<Record<string, string>> = { target: 'Targeted', follow_up: 'Following up' };
const LEGEND = statusLegend();
const BLANK_FORM = { venue_id: '', status: 'pitch', set_time: '', fee: '', notes: '' };

const statusLabel = (s: string): string => BOOKING_STATUS_LABELS[s as keyof typeof BOOKING_STATUS_LABELS] ?? s;
const money = (n: number): string => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const where = (v: CalBooking['venue']): string => [v?.city, v?.state].filter(Boolean).join(', ');

/** "LONE STAR · 17 targeted" — the text on a placeholder tile. */
const placeholderLabel = (p: TourPlaceholder): string =>
  `${p.tourName} · ${p.targets.length === 0 ? 'no venues yet' : `${p.targets.length} targeted`}`;

/**
 * Shapes a tour_venues row for the placeholder builder. PostgREST may return the
 * venue join as an object or a one-item array; anything malformed is dropped.
 */
function normalizeTarget(row: unknown): PlaceholderTarget | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.tour_id !== 'string' || typeof r.status !== 'string') return null;
  const rawVenue = Array.isArray(r.venue) ? r.venue[0] : r.venue;
  const v = rawVenue && typeof rawVenue === 'object' ? (rawVenue as Record<string, unknown>) : null;
  const str = (x: unknown): string | null => (typeof x === 'string' ? x : null);
  return {
    id: r.id,
    tour_id: r.tour_id,
    status: r.status,
    booking_date: str(r.booking_date),
    last_contacted_at: str(r.last_contacted_at),
    venue: v && typeof v.id === 'string' ? { id: v.id, name: str(v.name), city: str(v.city), state: str(v.state) } : null,
  };
}

type LoadResult =
  | { kind: 'ok'; actId: string; actName: string; shows: CalBooking[]; venues: VenuePick[]; tours: PlaceholderTour[]; targets: PlaceholderTarget[] }
  | { kind: 'no-band' }
  | { kind: 'error' };

/**
 * Loads the band's calendar: shows, the band's venues (for quick add), open
 * tours and their open targets (for placeholder tiles). RLS scopes every query
 * to the caller's band; the act_id filters keep them explicit. Never throws.
 * A failure loading tours only drops placeholders — shows still appear.
 */
async function loadCalendar(today: string): Promise<LoadResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { kind: 'no-band' };
    const actId = await getActId(supabase, session.user.id);
    if (!actId) return { kind: 'no-band' };
    const [rows, actRes, venueRes, tourRes] = await Promise.all([
      getBandBookings(supabase, actId),
      supabase.from('acts').select('act_name').eq('id', actId).single(),
      supabase.from('venues').select('id, name, city, state').eq('act_id', actId).order('name').limit(1000),
      supabase.from('tours').select('id, name, start_date, end_date, status')
        .eq('act_id', actId).not('status', 'in', '("completed","cancelled")'),
    ]);
    // The rows come from the typed select in getBandBookings; the cast narrows `*` to the fields used here.
    const shows = (rows as unknown as CalBooking[]).filter(b => isVisibleOnAppCalendar(b, today));
    let tours: PlaceholderTour[] = [];
    let targets: PlaceholderTarget[] = [];
    if (tourRes.error) {
      console.error('[calendar] tours failed', tourRes.error);
    } else {
      tours = (tourRes.data ?? []) as PlaceholderTour[];
      if (tours.length > 0) {
        const { data: tv, error: tvErr } = await supabase
          .from('tour_venues')
          .select('id, tour_id, status, booking_date, last_contacted_at, venue:venues(id, name, city, state)')
          .in('tour_id', tours.map(t => t.id))
          .in('status', ['target', 'follow_up']);
        if (tvErr) console.error('[calendar] targets failed', tvErr);
        targets = ((tv ?? []) as unknown[]).map(normalizeTarget).filter((t): t is PlaceholderTarget => t !== null);
      }
    }
    return {
      kind: 'ok', actId, shows, tours, targets,
      actName: (actRes.data?.act_name as string | undefined) ?? '',
      venues: (venueRes.data ?? []) as VenuePick[],
    };
  } catch (err) {
    console.error('[calendar] load threw', err);
    return { kind: 'error' };
  }
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function ShowChip({ show, compact = false }: { show: CalBooking; compact?: boolean }) {
  const bg = statusColor(show.status);
  return (
    <span className={compact ? styles.chipCompact : styles.chip} style={{ background: bg, color: inkOn(bg) }}>
      {show.venue?.name || show.act?.act_name || 'Venue TBD'}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const bg = statusColor(status);
  return <span className={styles.pill} style={{ background: bg, color: inkOn(bg) }}>{statusLabel(status)}</span>;
}

/** The selected day's shows and tour placeholders. */
function DayPanel({ date, shows, placeholders, onClose, onAdd }: {
  date: string; shows: CalBooking[]; placeholders: TourPlaceholder[]; onClose: () => void; onAdd: () => void;
}) {
  return (
    <section className={styles.panel} aria-labelledby="day-panel-title">
      <header className={styles.panelHead}>
        <h2 className={styles.panelTitle} id="day-panel-title">{formatShowDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close day">✕</button>
      </header>
      {placeholders.map(p => (
        <section key={p.tourId} className={styles.placeholderBox} aria-label={`${p.tourName}: venues targeted for this night`}>
          <div className={styles.placeholderHead}>
            <strong>{p.tourName}</strong>
            <Link href={`/tours/${p.tourId}`} className={styles.link}>Open tour →</Link>
          </div>
          <p className={styles.muted}>
            Working on this night · {p.targets.length === 0 ? 'no venues targeted yet' : `${plural(p.targets.length, 'venue')} targeted`}
          </p>
          {p.targets.length > 0 && (
            <ul className={styles.targetList}>
              {p.targets.map(t => (
                <li key={t.id}>
                  <span className={styles.targetMain}>
                    <strong>{t.venue?.name || 'Venue'}</strong>
                    <span className={styles.muted}>
                      {[t.venue?.city, t.venue?.state].filter(Boolean).join(', ')}
                      {t.last_contacted_at ? ` · last contact ${formatShowDate(t.last_contacted_at.slice(0, 10), { month: 'short', day: 'numeric' })}` : ''}
                      {t.booking_date ? ' · this night only' : ''}
                    </span>
                  </span>
                  <span className="tour-badge tour-badge--outline">{TARGET_STATUS_LABEL[t.status] ?? t.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {shows.map(s => (
        <Link key={s.id} href={`/bookings/${s.id}`} className={styles.dayShow} style={{ borderLeftColor: statusColor(s.status) }}>
          <span className={styles.dayShowName}>{s.venue?.name || 'Venue TBD'}</span>
          <span className={styles.dayShowMeta}>
            <span className={styles.muted}>{[where(s.venue), clock(s.set_time)].filter(Boolean).join(' · ')}</span>
            <StatusPill status={s.status} />
          </span>
          {typeof s.agreed_amount === 'number' && s.agreed_amount > 0 && <span className={styles.fee}>{money(s.agreed_amount)}</span>}
        </Link>
      ))}
      <button type="button" className="venues-link-btn" onClick={onAdd}>+ Add a show on this date</button>
    </section>
  );
}

function UpcomingList({ shows }: { shows: CalBooking[] }) {
  return (
    <section className={styles.panel} aria-labelledby="upcoming-title">
      <h2 className={styles.panelTitle} id="upcoming-title">Upcoming</h2>
      {shows.length === 0 ? <p className={styles.muted}>Nothing booked ahead yet.</p> : (
        <ul className={styles.upcoming}>
          {shows.map(s => (
            <li key={s.id}>
              <Link href={`/bookings/${s.id}`} className={styles.upcomingRow}>
                <span className={styles.dateBlock} style={{ borderColor: statusColor(s.status) }}>
                  <strong>{parseLocalDate(s.show_date!).getDate()}</strong>
                  <span>{formatShowDate(s.show_date!, { month: 'short' })}</span>
                </span>
                <span className={styles.upcomingMain}>
                  <strong>{s.venue?.name || 'Venue TBD'}</strong>
                  <span className={styles.muted}>{where(s.venue) || statusLabel(s.status)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Quick "add a show on this date" dialog; opens the new booking afterwards. */
function QuickAdd({ date, actId, venues, onClose }: { date: string; actId: string; venues: VenuePick[]; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const ref = useModalKeys<HTMLDivElement>(saving ? () => undefined : onClose);
  const set = (k: keyof typeof BLANK_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Your session expired. Sign in again.'); return; }
      const fee = form.fee.trim() ? Number(form.fee) : null;
      if (fee !== null && (!Number.isFinite(fee) || fee < 0)) { setError('Fee must be a positive number.'); return; }
      const { data, error: insertError } = await supabase.from('bookings').insert({
        act_id: actId,
        created_by: session.user.id,
        show_date: date,
        venue_id: form.venue_id || null,
        status: form.status,
        set_time: form.set_time || null,
        agreed_amount: fee,
        notes: form.notes.trim() || null,
      }).select('id').single();
      if (insertError || !data) {
        console.error('[calendar] quick add failed', insertError);
        setError(insertError?.code === '23505'
          ? 'There’s already a show at that venue on this date.'
          : 'The show couldn’t be saved. Check the fields and try again.');
        return;
      }
      void router.push(`/bookings/${data.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div ref={ref} className="modal venues-modal venues-modal--narrow" role="dialog" aria-modal="true" aria-labelledby="quick-add-title">
        <div className="modal-header">
          <h3 className="modal-title" id="quick-add-title">Add show</h3>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" onClick={onClose} disabled={saving}>✕</button>
        </div>
        <p className="today-eyebrow">{formatShowDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        <form onSubmit={e => void save(e)} className="venues-form">
          <div className="field">
            <label className="field-label" htmlFor="qa-venue">Venue</label>
            <select id="qa-venue" className="select" value={form.venue_id} onChange={set('venue_id')}>
              <option value="">No venue yet / TBD</option>
              {venues.map(v => <option key={v.id} value={v.id}>{v.name}{v.city ? ` — ${v.city}, ${v.state ?? ''}` : ''}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="qa-status">Status</label>
            <select id="qa-status" className="select" value={form.status} onChange={set('status')}>
              {(Object.entries(BOOKING_STATUS_LABELS) as [string, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="qa-time">Set time</label>
              <input id="qa-time" className="input" type="time" value={form.set_time} onChange={set('set_time')} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="qa-fee">Fee ($)</label>
              <input id="qa-fee" className="input" inputMode="decimal" placeholder="0" value={form.fee} onChange={set('fee')} />
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="qa-notes">Notes</label>
            <input id="qa-notes" className="input" value={form.notes} onChange={set('notes')} placeholder="Optional" />
          </div>
          {error && <p className="venues-error" role="alert">{error}</p>}
          <div className="venues-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create & open'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [today, setToday] = useState<string | null>(null);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState<{ year: number; month: number } | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [addDate, setAddDate] = useState<string | null>(null);

  // The browser's local day, read after mount so server and browser renders agree.
  useEffect(() => {
    const td = localToday();
    let cancelled = false;
    void loadCalendar(td).then(r => {
      if (cancelled) return;
      setToday(td);
      setCursor(c => c ?? { year: Number(td.slice(0, 4)), month: Number(td.slice(5, 7)) - 1 });
      setResult(r);
    });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const ok = result?.kind === 'ok' ? result : null;
  const shows = useMemo(() => ok?.shows ?? [], [ok]);
  const showsByDate = useMemo(() => byDate(shows), [shows]);
  const placeholders = useMemo(
    () => (ok && today ? buildTourPlaceholders(ok.tours, ok.targets, ok.shows, today) : {}),
    [ok, today],
  );
  const summary = useMemo(
    () => (today && cursor ? summarizeCalendar(shows, today, cursor.year, cursor.month) : null),
    [shows, today, cursor],
  );
  const upcoming = useMemo(
    () => (today ? shows.filter(s => s.show_date && s.show_date >= today && s.status !== 'completed')
      .sort((a, b) => (a.show_date! < b.show_date! ? -1 : 1)).slice(0, 10) : []),
    [shows, today],
  );

  const step = useCallback((dir: -1 | 1): void => {
    if (view === 'week') { setWeekOffset(w => w + dir); return; }
    setCursor(c => {
      if (!c) return c;
      const m = c.month + dir;
      return m < 0 ? { year: c.year - 1, month: 11 } : m > 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: m };
    });
  }, [view]);

  const goToday = (): void => {
    if (!today) return;
    setWeekOffset(0);
    setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 });
    setSelected(today);
  };

  const openDay = (date: string): void => {
    const busy = (showsByDate[date]?.length ?? 0) + (placeholders[date]?.length ?? 0) > 0;
    if (busy) setSelected(s => (s === date ? null : date));
    else { setSelected(null); setAddDate(date); }
  };

  const exportIcal = (): void => {
    if (!ok) return;
    const booked = ok.shows.filter(s => (BOOKED_SHOW_STATUSES as readonly string[]).includes(s.status));
    downloadIcal(buildIcal(booked, `${ok.actName || 'Band'} shows`, () => ok.actName), 'shows.ics');
  };

  const anchor = today ? parseLocalDate(today) : new Date();
  const week = weekDays(anchor, weekOffset);
  const periodLabel = view === 'week'
    ? `${week[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${week[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : cursor ? new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '';

  const heroSummary = summary
    ? summary.next
      ? `Next up: ${summary.next.show.venue?.name || 'a show'} ${summary.next.daysAway === 0 ? 'tonight' : summary.next.daysAway === 1 ? 'tomorrow' : `in ${summary.next.daysAway} days`} · ${plural(summary.next30, 'show')} in the next 30 days.`
      : 'Nothing booked ahead yet — every open night is a chance.'
    : undefined;

  return (
    <AppShell requireRole="band_admin">
      <PageHero
        title="Calendar"
        subtitle="Shows, holds & tour nights"
        summary={heroSummary}
        scene={<BillboardScene />}
        actions={
          <div className={styles.heroActions}>
            <button type="button" className="btn btn-secondary tours-new-btn" onClick={exportIcal} disabled={!ok}
              title="Download booked shows for Google, Apple or Outlook Calendar">↓ Export</button>
            <button type="button" className="btn btn-primary tours-new-btn" onClick={() => today && setAddDate(today)} disabled={!ok}>+ Add show</button>
          </div>
        }
      />

      {result === null && (
        <div className="tours-body" aria-busy="true">
          <span className="sr-only" role="status">Loading the calendar…</span>
          <div className="tours-metrics">{[0, 1, 2, 3].map(i => <div key={i} className="tour-metric tour-skeleton" />)}</div>
          <div className={`tour-skeleton ${styles.skeletonGrid}`} />
        </div>
      )}

      {result?.kind === 'error' && (
        <div className="card tours-empty" role="alert">
          <div className="tours-empty-title">The calendar didn’t load</div>
          <p>Something went wrong reaching the database. Your shows are safe — try again.</p>
          <button type="button" className="btn btn-primary" onClick={() => { setResult(null); setReloadKey(k => k + 1); }}>Try again</button>
        </div>
      )}

      {result?.kind === 'no-band' && (
        <div className="card tours-empty"><div className="tours-empty-title">No band yet</div><p>Shows appear here once your account is linked to a band.</p></div>
      )}

      {ok && summary && cursor && today && (
        <div className="tours-body">
          <section className="tours-metrics" aria-label="Calendar at a glance">
            <div className="tour-metric">
              <span className="tour-metric-label">Booked in {new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-US', { month: 'long' })}</span>
              <div className="tour-metric-value"><strong>{summary.monthBooked}</strong><span>{summary.monthBooked === 1 ? 'show' : 'shows'}</span></div>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">Next show</span>
              {summary.next ? (
                <>
                  <div className="tour-metric-value">
                    {summary.next.daysAway === 0
                      ? <><strong className="tour-metric-hot">Tonight</strong><span>{summary.next.show.venue?.name || 'Venue TBD'}</span></>
                      : <><strong>{summary.next.daysAway}</strong><span>{summary.next.daysAway === 1 ? 'day' : 'days'} · {summary.next.show.venue?.name || 'Venue TBD'}</span></>}
                  </div>
                  <span className="tour-metric-note">{formatShowDate(summary.next.show.show_date!, { weekday: 'short', month: 'short', day: 'numeric' })}{where(summary.next.show.venue) ? ` · ${where(summary.next.show.venue)}` : ''}</span>
                </>
              ) : <div className="tour-metric-value"><span>Nothing booked</span></div>}
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">Next 30 days</span>
              <div className="tour-metric-value"><strong>{summary.next30}</strong><span>booked {summary.next30 === 1 ? 'show' : 'shows'}</span></div>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">In outreach</span>
              <div className="tour-metric-value">
                <strong className={summary.pipeline > 0 ? 'tour-metric-hot' : undefined}>{summary.pipeline}</strong>
                <span>pitches & holds ahead</span>
              </div>
            </div>
          </section>

          <div className="tours-toolbar">
            <div className="tours-tabs" role="group" aria-label="Calendar view">
              {(Object.keys(VIEW_LABELS) as ViewMode[]).map(v => (
                <button key={v} type="button" className={`tours-tab${view === v ? ' tours-tab--on' : ''}`} aria-pressed={view === v} onClick={() => setView(v)}>
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
            {view !== 'list' && (
              <div className={styles.periodNav}>
                <button type="button" className={styles.navBtn} onClick={() => step(-1)} aria-label={view === 'week' ? 'Previous week' : 'Previous month'}>←</button>
                <h2 className={styles.period} aria-live="polite">{periodLabel}</h2>
                <button type="button" className={styles.navBtn} onClick={() => step(1)} aria-label={view === 'week' ? 'Next week' : 'Next month'}>→</button>
                <button type="button" className="tours-tab" onClick={goToday}>Today</button>
              </div>
            )}
          </div>

          <ul className={styles.legend} aria-label="Status colours">
            {LEGEND.map(l => (
              <li key={l.label}><span className={styles.swatch} style={{ background: l.color }} aria-hidden="true" />{l.label}</li>
            ))}
            <li><span className={`${styles.swatch} ${styles.swatchDashed}`} aria-hidden="true" />Tour night · working on it</li>
          </ul>

          {view === 'month' && (
            <div className={styles.monthLayout}>
              <div className={styles.monthCard}>
                <div className={styles.dayHeads} aria-hidden="true">{DAYS.map(d => <span key={d}>{d}</span>)}</div>
                <div className={styles.grid} role="group" aria-label={periodLabel}>
                  {monthGrid(cursor.year, cursor.month).map(cell => {
                    const dayShows = showsByDate[cell.date] ?? [];
                    const dayPh = placeholders[cell.date] ?? [];
                    const busy = dayShows.length + dayPh.length;
                    const isToday = cell.date === today;
                    const label = `${formatShowDate(cell.date, { weekday: 'long', month: 'long', day: 'numeric' })}: ${busy === 0 ? 'nothing booked, add a show' : `${plural(dayShows.length, 'show')}${dayPh.length ? `, ${plural(dayPh.length, 'tour night')}` : ''}`}`;
                    return (
                      <button
                        key={cell.date}
                        type="button"
                        className={[styles.cell, !cell.inMonth && styles.cellOut, isToday && styles.cellToday, selected === cell.date && styles.cellSelected, cell.date < today && styles.cellPast].filter(Boolean).join(' ')}
                        aria-label={label}
                        aria-pressed={selected === cell.date}
                        onClick={() => openDay(cell.date)}
                      >
                        <span className={styles.dayNum}>{cell.day}</span>
                        {dayPh.map(p => <span key={p.tourId} className={styles.phChip}>{placeholderLabel(p)}</span>)}
                        {dayShows.slice(0, 3).map(s => <ShowChip key={s.id} show={s} />)}
                        {dayShows.length > 3 && <span className={styles.more}>+{dayShows.length - 3} more</span>}
                        {busy === 0 && <span className={styles.addHint} aria-hidden="true">+</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className={styles.side}>
                {selected && ((showsByDate[selected]?.length ?? 0) + (placeholders[selected]?.length ?? 0) > 0) && (
                  <DayPanel
                    date={selected}
                    shows={showsByDate[selected] ?? []}
                    placeholders={placeholders[selected] ?? []}
                    onClose={() => setSelected(null)}
                    onAdd={() => { setAddDate(selected); setSelected(null); }}
                  />
                )}
                <UpcomingList shows={upcoming} />
              </div>
            </div>
          )}

          {view === 'week' && (
            <div className={styles.weekCard}>
              {week.map(d => {
                const ds = toDateStr(d);
                const dayShows = showsByDate[ds] ?? [];
                const dayPh = placeholders[ds] ?? [];
                const busy = dayShows.length + dayPh.length > 0;
                return (
                  <section key={ds} className={`${styles.weekDay}${ds === today ? ` ${styles.weekToday}` : ''}`} aria-label={formatShowDate(ds, { weekday: 'long', month: 'long', day: 'numeric' })}>
                    <header className={styles.weekHead}>
                      <span>{DAYS[d.getDay()]}</span>
                      <strong>{d.getDate()}</strong>
                    </header>
                    {dayPh.map(p => (
                      <Link key={p.tourId} href={`/tours/${p.tourId}`} className={styles.phChip}>{placeholderLabel(p)}</Link>
                    ))}
                    {dayShows.map(s => (
                      <Link key={s.id} href={`/bookings/${s.id}`} className={styles.weekShow}>
                        <ShowChip show={s} compact />
                        {clock(s.set_time) && <span className={styles.muted}>{clock(s.set_time)}</span>}
                      </Link>
                    ))}
                    {!busy && (
                      <button type="button" className={styles.weekAdd} onClick={() => setAddDate(ds)}
                        aria-label={`Add a show on ${formatShowDate(ds, { weekday: 'long', month: 'long', day: 'numeric' })}`}>+</button>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {view === 'list' && (
            shows.length === 0 ? (
              <div className="card tours-empty">
                <div className="tours-empty-title">No shows yet</div>
                <button type="button" className="btn btn-primary" onClick={() => setAddDate(today)}>Add your first show</button>
              </div>
            ) : (
              <div className="venues-table-wrap">
                <table className="venues-table">
                  <caption className="sr-only">All shows</caption>
                  <thead>
                    <tr><th scope="col">Date</th><th scope="col">Venue</th><th scope="col">Location</th><th scope="col">Status</th><th scope="col">Fee</th></tr>
                  </thead>
                  <tbody>
                    {[...shows].filter(s => s.show_date).sort((a, b) => (a.show_date! < b.show_date! ? -1 : 1)).map(s => (
                      <tr key={s.id} className={s.show_date! < today ? styles.rowPast : undefined}>
                        <td className={styles.nowrap}>{formatShowDate(s.show_date!, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</td>
                        <td><Link href={`/bookings/${s.id}`} className="venues-row-name">{s.venue?.name || 'Venue TBD'}</Link></td>
                        <td>{where(s.venue) || '—'}</td>
                        <td><StatusPill status={s.status} /></td>
                        <td className={styles.fee}>{typeof s.agreed_amount === 'number' && s.agreed_amount > 0 ? money(s.agreed_amount) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      {addDate && ok && <QuickAdd date={addDate} actId={ok.actId} venues={ok.venues} onClose={() => setAddDate(null)} />}
    </AppShell>
  );
}
