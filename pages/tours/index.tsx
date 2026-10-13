// pages/tours/index.tsx
//
// Tours — routing & run management for the signed-in band.
//
// Layout (Phase 3 redesign, Oct 2026):
//   1. Illustrated highway hero with the title and "+ New Tour".
//   2. Four metric trackers for pre-planning (getting shows confirmed).
//   3. A stage strip: Pre-planning → Advancing → On the road → Completed.
//   4. Upcoming / Past / All toggle and a two-column grid of compact cards.
//
// All of the counting lives in lib/domain/tourProgress.ts (unit-tested);
// this file only loads rows, holds UI state and renders.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import TourHighwayHero from '../../components/tours/TourHighwayHero';
import { supabase } from '../../lib/supabase';
import { getActId } from '../../lib/bookingQueries';
import { formatShowDate, localToday } from '../../lib/formatDate';
import {
  buildTourProgress, summarizeTours, rowsForTab,
  type TourProgress, type TourRow, type TourBookingRow, type TourTargetRow, type TourTab, type TourStage,
} from '../../lib/domain/tourProgress';

type ActPick = { id: string; act_name: string };
type LoadState = 'loading' | 'ready' | 'error';

const EMPTY_FORM = { name: '', act_id: '', description: '', start_date: '', end_date: '' };

const TAB_LABELS: Readonly<Record<TourTab, string>> = { upcoming: 'Upcoming', past: 'Past', all: 'All' };

const STAGE_STEPS: ReadonlyArray<{ key: Exclude<TourStage, 'cancelled'>; label: string }> = [
  { key: 'pre_planning', label: 'Pre-planning' },
  { key: 'advancing', label: 'Advancing' },
  { key: 'on_road', label: 'On the road' },
  { key: 'completed', label: 'Completed' },
];

const money = (n: number): string =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** "Oct 16 – 18", "Oct 30 – Nov 1", "Jan 7 – 9, 2027", or "Dates TBD". */
function formatRange(start: string | null, end: string | null, today: string): string {
  if (!start && !end) return 'Dates TBD';
  const thisYear = today.slice(0, 4);
  const fmt = (d: string, withMonth: boolean): string => {
    const opts: Intl.DateTimeFormatOptions = withMonth ? { month: 'short', day: 'numeric' } : { day: 'numeric' };
    return formatShowDate(d, opts);
  };
  const yearSuffix = (d: string): string => (d.slice(0, 4) === thisYear ? '' : `, ${d.slice(0, 4)}`);
  if (start && !end) return `${fmt(start, true)}${yearSuffix(start)} – TBD`;
  if (!start && end) return `TBD – ${fmt(end, true)}${yearSuffix(end)}`;
  if (start === end) return `${fmt(start!, true)}${yearSuffix(start!)}`;
  const sameMonth = start!.slice(0, 7) === end!.slice(0, 7);
  return `${fmt(start!, true)} – ${fmt(end!, !sameMonth)}${yearSuffix(end!)}`;
}

function whenLabel(p: TourProgress): string {
  if (p.stage === 'completed') return 'Completed';
  if (p.stage === 'cancelled') return 'Cancelled';
  if (p.stage === 'on_road') return 'On the road now';
  if (p.daysUntilStart === null) return 'No start date';
  if (p.daysUntilStart === 0) return 'Starts today';
  if (p.daysUntilStart === 1) return 'Starts tomorrow';
  return `in ${p.daysUntilStart} days`;
}

function badgeFor(p: TourProgress): { text: string; variant: string } {
  switch (p.stage) {
    case 'cancelled': return { text: 'Cancelled', variant: 'muted' };
    case 'completed': return { text: 'Completed', variant: 'muted' };
    case 'on_road': return { text: 'On the road', variant: 'live' };
    case 'advancing': return { text: 'Fully booked', variant: 'done' };
    default: return p.needsDates
      ? { text: 'Needs dates', variant: 'urgent' }
      : { text: 'Pre-planning', variant: 'outline' };
  }
}

type LoadResult =
  | { kind: 'ok'; act: ActPick | null; tours: TourRow[]; bookings: TourBookingRow[]; targets: TourTargetRow[] }
  | { kind: 'no-band' }
  | { kind: 'error' };

/**
 * Loads every tour for the signed-in user's band (the Past tab needs concluded
 * runs too) plus that band's tour-linked bookings. RLS scopes both queries to
 * the caller's band; the act_id filter keeps them explicit and index-friendly.
 * Never throws: failures are logged and returned as { kind: 'error' }.
 */
async function loadToursData(): Promise<LoadResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return { kind: 'no-band' };
    const actId = await getActId(supabase, user.id);
    if (!actId) return { kind: 'no-band' };

    const [actRes, toursRes, bookingsRes, targetsRes] = await Promise.all([
      supabase.from('acts').select('id, act_name').eq('id', actId).single(),
      supabase
        .from('tours')
        .select('id, name, description, start_date, end_date, status')
        .eq('act_id', actId),
      supabase
        .from('bookings')
        .select('tour_id, venue_id, status, show_date, agreed_amount, actual_amount_received')
        .eq('act_id', actId)
        .not('tour_id', 'is', null),
      // Targets on this band's runs, for the "Pitched" count (emailed targets).
      supabase
        .from('tour_venues')
        .select('tour_id, venue_id, status, pitched_at, tour:tours!inner(act_id)')
        .eq('tour.act_id', actId),
    ]);
    if (toursRes.error || bookingsRes.error || targetsRes.error) {
      console.error('[tours] load failed', { tours: toursRes.error, bookings: bookingsRes.error, targets: targetsRes.error });
      return { kind: 'error' };
    }
    return {
      kind: 'ok',
      act: (actRes.data as ActPick | null) ?? null,
      tours: (toursRes.data ?? []) as TourRow[],
      bookings: (bookingsRes.data ?? []) as TourBookingRow[],
      targets: (targetsRes.data ?? []).map(t => ({ tour_id: t.tour_id, venue_id: t.venue_id, status: t.status, pitched_at: t.pitched_at })),
    };
  } catch (err) {
    console.error('[tours] load threw', err);
    return { kind: 'error' };
  }
}

/** One compact tour card. The whole card links to the tour's detail page. */
function TourCard({ p, today }: { p: TourProgress; today: string }) {
  const badge = badgeFor(p);
  const past = !p.upcoming;
  const fillText = past
    ? `${plural(p.bookedShows, 'show')} ${p.stage === 'cancelled' ? 'booked' : 'played'}`
    : p.nights === null
      ? `${plural(p.filledNights, 'show')} confirmed`
      : `${p.filledNights} of ${plural(p.nights, 'night')} confirmed`;
  const moneyText = past
    ? (p.earned > 0 ? `${money(p.earned)} earned` : 'No payouts logged')
    : (p.potential > 0 ? `${money(p.potential)} potential` : 'Fees TBD');
  const pct = past ? 100 : (p.fillPct ?? 0);

  return (
    <Link href={`/tours/${p.tour.id}`} className={`tour-card${past ? ' tour-card--past' : ''}`}>
      <div className="tour-card-head">
        <div className="tour-card-title-block">
          <h2 className="tour-card-name">{p.tour.name}</h2>
          <span className="tour-card-dates">
            {formatRange(p.tour.start_date, p.tour.end_date, today)}
            <span className="tour-card-when"> · {whenLabel(p)}</span>
          </span>
        </div>
        <span className={`tour-badge tour-badge--${badge.variant}`}>{badge.text}</span>
      </div>

      {p.tour.description && <p className="tour-card-desc">{p.tour.description}</p>}

      <div className="tour-card-progress">
        <div className="tour-card-progress-row">
          <span className="tour-card-fill">{fillText}</span>
          <span className="tour-card-money">{moneyText}</span>
        </div>
        {(past || p.fillPct !== null) && (
          <div
            className="tour-meter"
            role="progressbar"
            aria-label={`${p.tour.name} nights confirmed`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div
              className={`tour-meter-bar${past ? ' tour-meter-bar--past' : p.stage === 'advancing' ? ' tour-meter-bar--done' : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      <div className="tour-card-foot">
        {!past && (
          <dl className="tour-card-counts">
            <div><dt>Pitched</dt><dd>{p.pitched}</dd></div>
            <div><dt>Holds</dt><dd>{p.holds}</dd></div>
            <div><dt>Confirmed</dt><dd>{p.bookedShows}</dd></div>
          </dl>
        )}
        <span className="tour-card-cta" aria-hidden="true">{past ? 'Recap →' : 'Open run →'}</span>
      </div>
    </Link>
  );
}

export default function ToursPage() {
  const router = useRouter();
  const [tours, setTours] = useState<TourRow[]>([]);
  const [bookings, setBookings] = useState<TourBookingRow[]>([]);
  const [targets, setTargets] = useState<TourTargetRow[]>([]);
  const [acts, setActs] = useState<ActPick[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [tab, setTab] = useState<TourTab>('upcoming');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const today = localToday();

  // Bumped by "Try again" to re-run the loader effect.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    // Ignore a response that lands after unmount or after a newer reload.
    let cancelled = false;
    void loadToursData().then(result => {
      if (cancelled) return;
      if (result.kind === 'error') { setLoadState('error'); return; }
      if (result.kind === 'ok') {
        if (result.act) {
          setActs([result.act]);
          setForm(f => ({ ...f, act_id: f.act_id || result.act!.id }));
        }
        setTours(result.tours);
        setBookings(result.bookings);
        setTargets(result.targets);
      }
      setLoadState('ready');
    });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const retry = (): void => { setLoadState('loading'); setReloadKey(k => k + 1); };

  const rows = useMemo(() => buildTourProgress(tours, bookings, today, targets), [tours, bookings, today, targets]);
  const summary = useMemo(() => summarizeTours(rows), [rows]);
  const shown = useMemo(() => rowsForTab(rows, tab), [rows, tab]);
  const tabCounts: Record<TourTab, number> = {
    upcoming: summary.upcomingCount,
    past: summary.pastCount,
    all: rows.length,
  };

  const save = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!form.act_id || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) { setSaveError('Your session expired. Sign in again to create a tour.'); return; }
      const { data, error } = await supabase.from('tours').insert({
        created_by: user.id,
        act_id: form.act_id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: 'planning',
      }).select('id').single();
      if (error || !data) {
        console.error('[tours] create failed', error);
        setSaveError('The tour could not be saved. Check the dates and try again.');
        return;
      }
      setShowNew(false);
      setForm({ ...EMPTY_FORM, act_id: form.act_id });
      void router.push(`/tours/${data.id}`);
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const nextOut = summary.nextOut;
  const heroSummary = loadState === 'ready' && summary.upcomingCount > 0
    ? `${plural(summary.upcomingCount, 'run')} on the books${summary.totalNights > 0 ? ` — ${plural(summary.openNights, 'open night')} still to fill` : ''}.`
    : undefined;

  return (
    <AppShell requireRole="band_admin">
      <TourHighwayHero
        title="Tours"
        subtitle="Routing & run management"
        summary={heroSummary}
        actions={
          <button type="button" className="btn btn-primary tours-new-btn" onClick={() => { setSaveError(null); setShowNew(true); }}>
            + New Tour
          </button>
        }
      />

      {loadState === 'loading' && (
        <div className="tours-body" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading tours…</span>
          <div className="tours-metrics">
            {[0, 1, 2, 3].map(i => <div key={i} className="tour-metric tour-skeleton" />)}
          </div>
          <div className="tours-grid">
            {[0, 1, 2, 3].map(i => <div key={i} className="tour-card tour-skeleton tour-skeleton--card" />)}
          </div>
        </div>
      )}

      {loadState === 'error' && (
        <div className="card tours-empty" role="alert">
          <div className="tours-empty-title">Tours didn’t load</div>
          <p>Something went wrong reaching the database. Your tours are safe — try again.</p>
          <button type="button" className="btn btn-primary" onClick={retry}>Try again</button>
        </div>
      )}

      {loadState === 'ready' && rows.length === 0 && (
        <div className="card tours-empty">
          <div className="tours-empty-title">No tours yet</div>
          <p>A tour is a date window you’re booking. Set the dates, then fill the nights with shows.</p>
          <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>Plan your first tour</button>
        </div>
      )}

      {loadState === 'ready' && rows.length > 0 && (
        <div className="tours-body">
          <section className="tours-metrics" aria-label="Pre-planning metrics">
            <div className="tour-metric">
              <span className="tour-metric-label">Pre-planning fill</span>
              <div className="tour-metric-value">
                <strong>{summary.filledNights}</strong>
                <span>of {plural(summary.totalNights, 'night')} confirmed</span>
              </div>
              <div
                className="tour-meter"
                role="progressbar"
                aria-label="Upcoming nights confirmed"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={summary.fillPct}
              >
                <div className="tour-meter-bar" style={{ width: `${summary.fillPct}%` }} />
              </div>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">Open nights</span>
              <div className="tour-metric-value">
                <strong className={summary.openNights > 0 ? 'tour-metric-hot' : undefined}>{summary.openNights}</strong>
                <span>still to book</span>
              </div>
              <span className="tour-metric-note">
                {summary.emptyRuns > 0 ? `${plural(summary.emptyRuns, 'run has', 'runs have')} zero shows confirmed` : 'Every run has at least one show'}
              </span>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">In the pipeline</span>
              <div className="tour-metric-value">
                <strong>{summary.pitched}</strong>
                <span>pitched · {plural(summary.holds, 'hold')}</span>
              </div>
              <span className="tour-metric-note">
                {summary.pitched + summary.holds === 0 ? 'No outreach out on upcoming runs' : 'Waiting on venues for upcoming runs'}
              </span>
            </div>
            <div className="tour-metric">
              <span className="tour-metric-label">Next out</span>
              {nextOut ? (
                <>
                  <div className="tour-metric-value">
                    <strong>{nextOut.daysUntilStart}</strong>
                    <span>{nextOut.daysUntilStart === 1 ? 'day' : 'days'} · {nextOut.tour.name}</span>
                  </div>
                  <span className="tour-metric-note">
                    {formatRange(nextOut.tour.start_date, nextOut.tour.end_date, today)}
                    {nextOut.nights !== null && ` · ${nextOut.filledNights} of ${plural(nextOut.nights, 'night')} set`}
                  </span>
                </>
              ) : (
                <div className="tour-metric-value"><span>Nothing scheduled</span></div>
              )}
            </div>
          </section>

          <ol className="tours-stages" aria-label="Tours by stage">
            {STAGE_STEPS.map((s, i) => (
              <li key={s.key} className={`tours-stage${s.key === 'pre_planning' ? ' tours-stage--lead' : ''}`}>
                <span className="tours-stage-label">{i + 1} · {s.label}</span>
                <span className="tours-stage-count">{summary.stageCounts[s.key]}</span>
              </li>
            ))}
          </ol>

          <div className="tours-toolbar">
            <div className="tours-tabs" role="group" aria-label="Show tours">
              {(Object.keys(TAB_LABELS) as TourTab[]).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`tours-tab${tab === t ? ' tours-tab--on' : ''}`}
                  aria-pressed={tab === t}
                  onClick={() => setTab(t)}
                >
                  {TAB_LABELS[t]} · {tabCounts[t]}
                </button>
              ))}
            </div>
            <span className="tours-sort-note">{tab === 'past' ? 'Most recent first' : 'Sorted by start date'}</span>
          </div>

          {shown.length === 0 ? (
            <div className="card tours-empty">
              <div className="tours-empty-title">{tab === 'upcoming' ? 'No upcoming runs' : 'No past runs yet'}</div>
              {tab === 'upcoming' && (
                <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>Plan a tour</button>
              )}
            </div>
          ) : (
            <section className="tours-grid" aria-label={`${TAB_LABELS[tab]} tours`}>
              {shown.map(p => <TourCard key={p.tour.id} p={p} today={today} />)}
            </section>
          )}
        </div>
      )}

      {showNew && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-tour-title">
            <div className="modal-header">
              <h3 className="modal-title" id="new-tour-title">New Tour</h3>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" onClick={() => setShowNew(false)}>✕</button>
            </div>
            <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="field">
                <label className="field-label" htmlFor="tour-name">Tour Name *</label>
                <input id="tour-name" className="input" value={form.name} onChange={set('name')} required autoFocus />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="tour-act">Band *</label>
                <select id="tour-act" className="select" value={form.act_id} onChange={set('act_id')} required>
                  <option value="">Select band...</option>
                  {acts.map(a => <option key={a.id} value={a.id}>{a.act_name}</option>)}
                </select>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label className="field-label" htmlFor="tour-start">Start Date</label>
                  <input id="tour-start" className="input" type="date" value={form.start_date} onChange={set('start_date')} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="tour-end">End Date</label>
                  <input id="tour-end" className="input" type="date" value={form.end_date} min={form.start_date || undefined} onChange={set('end_date')} />
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="tour-desc">Description</label>
                <textarea id="tour-desc" className="textarea" value={form.description} onChange={set('description')} />
              </div>
              {saveError && <p className="tours-form-error" role="alert">{saveError}</p>}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !form.act_id}>{saving ? 'Saving...' : 'Create Tour'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
