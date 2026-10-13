// lib/domain/tourProgress.ts
//
// Pure, framework-free logic behind the Tours page: how full each run is,
// which stage it's in, and the roll-up metrics shown above the tour grid.
// Kept out of the page component so it can be unit-tested
// (__tests__/lib/domain/tourProgress.test.ts).
//
// Definitions (agreed with Scott, Oct 2026):
// - "Nights" in a run = every calendar day from start_date to end_date,
//   inclusive. A run missing either date has no night count ("dates TBD").
// - A night is "filled" when it has at least one booked show — a booking whose
//   status is in BOOKED_SHOW_STATUSES (contract, confirmed, advancing,
//   completed). Two shows on one day still fill one night.
// - Pre-planning = getting shows confirmed. A run leaves pre-planning for
//   "advancing" once every night is filled, and is "on the road" while today
//   falls inside its dates.
// - "Pitched" = distinct venues being pitched for the run: bookings in pitch /
//   followup, plus open targets (tour_venues target / follow_up) that have
//   been emailed (pitched_at). A venue in both counts once.
// - Money follows the platform rules: Potential = agreed_amount on confirmed
//   FUTURE shows only; Earned = actual_amount_received on completed shows only.

import { BOOKED_SHOW_STATUSES } from '../types';
import { OPEN_TARGET_STATUSES } from './tourPlaceholders';
import { parseLocalDate } from '../formatDate';

/** Booking fields this module reads. Status is a plain string because the
 *  database enum has values (e.g. `followup`) the TS union doesn't list. */
export interface TourBookingRow {
  tour_id: string | null;
  /** Used to count a venue once when it is both a pitch booking and a pitched target. */
  venue_id?: string | null;
  status: string | null;
  show_date: string | null;
  agreed_amount: number | string | null;
  actual_amount_received: number | string | null;
}

/**
 * A venue on a run's target list (tour_venues). It counts as pitched once an
 * email has gone to it (pitched_at set) while it is still an open target.
 */
export interface TourTargetRow {
  tour_id: string | null;
  venue_id: string | null;
  status: string | null;
  pitched_at: string | null;
}

export interface TourRow {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

export type TourStage = 'pre_planning' | 'advancing' | 'on_road' | 'completed' | 'cancelled';
export type TourTab = 'upcoming' | 'past' | 'all';

export interface TourProgress {
  tour: TourRow;
  /** True when the run belongs on the Upcoming tab. */
  upcoming: boolean;
  stage: TourStage;
  /** Days in the date window, or null when a date is missing. */
  nights: number | null;
  /** Distinct days with a booked show. */
  filledNights: number;
  /** Booked shows (not nights) — used on past runs ("3 shows played"). */
  bookedShows: number;
  pitched: number;
  holds: number;
  /** 0–100, or null when nights is unknown. */
  fillPct: number | null;
  /** Whole days from today to start_date; negative once started; null if no start. */
  daysUntilStart: number | null;
  /** Upcoming, inside the urgency window, and still has unfilled nights. */
  needsDates: boolean;
  potential: number;
  earned: number;
}

export interface ToursSummary {
  upcomingCount: number;
  pastCount: number;
  /** Nights across upcoming runs that have a full date window. */
  totalNights: number;
  filledNights: number;
  openNights: number;
  fillPct: number;
  /** Upcoming runs with dates set and zero nights filled. */
  emptyRuns: number;
  pitched: number;
  holds: number;
  stageCounts: Record<Exclude<TourStage, 'cancelled'>, number>;
  /** The soonest upcoming run that hasn't started yet. */
  nextOut: TourProgress | null;
}

/** Runs starting within this many days with open nights get flagged. */
export const NEEDS_DATES_WINDOW_DAYS = 30;

const PITCH_STATUSES: ReadonlySet<string> = new Set(['pitch', 'followup']);
const HOLD_STATUSES: ReadonlySet<string> = new Set(['hold', 'negotiation']);
const OPEN_TARGET: ReadonlySet<string> = new Set(OPEN_TARGET_STATUSES);
const BOOKED: ReadonlySet<string> = new Set(BOOKED_SHOW_STATUSES);
const MS_PER_DAY = 86_400_000;

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD), DST-safe. */
export function daysBetween(from: string, to: string): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  // Compare at UTC midnight of each local calendar day so a DST shift
  // (23- or 25-hour day) can't round the result off by one.
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / MS_PER_DAY);
}

/** Inclusive day count of a run, or null if either date is missing or inverted. */
export function nightsInWindow(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const span = daysBetween(start, end);
  return span < 0 ? null : span + 1;
}

function toAmount(v: number | string | null): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * A run is upcoming until it has concluded. Matches the page's long-standing
 * rule: a run with no end_date is never hidden as "past".
 */
export function isUpcomingTour(t: TourRow, today: string): boolean {
  if (t.status === 'completed' || t.status === 'cancelled') return false;
  return !t.end_date || t.end_date >= today;
}

/** Builds the progress view of one run from its own bookings. */
export function computeTourProgress(
  tour: TourRow,
  bookings: readonly TourBookingRow[],
  today: string,
  targets: readonly TourTargetRow[] = [],
): TourProgress {
  const filledDays = new Set<string>();
  let bookedShows = 0;
  const pitchedVenues = new Set<string>();
  let pitchedWithoutVenue = 0;
  let holds = 0;
  let potential = 0;
  let earned = 0;

  for (const b of bookings) {
    const status = b.status ?? '';
    if (BOOKED.has(status)) {
      bookedShows += 1;
      if (b.show_date) filledDays.add(b.show_date);
    } else if (PITCH_STATUSES.has(status)) {
      if (b.venue_id) pitchedVenues.add(b.venue_id);
      else pitchedWithoutVenue += 1;
    } else if (HOLD_STATUSES.has(status)) {
      holds += 1;
    }
    if (status === 'confirmed' && b.show_date && b.show_date >= today) potential += toAmount(b.agreed_amount);
    if (status === 'completed') earned += toAmount(b.actual_amount_received);
  }

  for (const t of targets) {
    if (t.pitched_at && t.venue_id && OPEN_TARGET.has(t.status ?? '')) pitchedVenues.add(t.venue_id);
  }
  const pitched = pitchedVenues.size + pitchedWithoutVenue;

  const nights = nightsInWindow(tour.start_date, tour.end_date);
  // Only count filled days that fall inside the window, so a stray show
  // dated outside the run can't push the fill past 100%.
  const filledNights = nights === null
    ? filledDays.size
    : [...filledDays].filter(d => d >= tour.start_date! && d <= tour.end_date!).length;
  const fillPct = nights === null ? null : Math.min(100, Math.round((filledNights / nights) * 100));
  const daysUntilStart = tour.start_date ? daysBetween(today, tour.start_date) : null;
  const upcoming = isUpcomingTour(tour, today);

  let stage: TourStage;
  if (tour.status === 'cancelled') stage = 'cancelled';
  else if (!upcoming) stage = 'completed';
  else if (tour.start_date && tour.start_date <= today && (!tour.end_date || tour.end_date >= today)) stage = 'on_road';
  else if (nights !== null && filledNights >= nights) stage = 'advancing';
  else stage = 'pre_planning';

  const needsDates = stage === 'pre_planning'
    && daysUntilStart !== null
    && daysUntilStart <= NEEDS_DATES_WINDOW_DAYS;

  return {
    tour, upcoming, stage, nights, filledNights, bookedShows,
    pitched, holds, fillPct, daysUntilStart, needsDates, potential, earned,
  };
}

/** Groups rows by tour_id, skipping rows without one. */
function groupByTour<T extends { tour_id: string | null }>(rows: readonly T[]): Map<string, T[]> {
  const byTour = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.tour_id) continue;
    const list = byTour.get(r.tour_id);
    if (list) list.push(r);
    else byTour.set(r.tour_id, [r]);
  }
  return byTour;
}

/** Groups bookings and targets by tour and builds a progress row for every tour. */
export function buildTourProgress(
  tours: readonly TourRow[],
  bookings: readonly TourBookingRow[],
  today: string,
  targets: readonly TourTargetRow[] = [],
): TourProgress[] {
  const bookingsByTour = groupByTour(bookings);
  const targetsByTour = groupByTour(targets);
  return tours.map(t => computeTourProgress(t, bookingsByTour.get(t.id) ?? [], today, targetsByTour.get(t.id) ?? []));
}

/** Roll-up numbers for the metric trackers and stage strip. */
export function summarizeTours(rows: readonly TourProgress[]): ToursSummary {
  const upcoming = rows.filter(r => r.upcoming);
  const withWindow = upcoming.filter(r => r.nights !== null);
  const totalNights = withWindow.reduce((s, r) => s + (r.nights ?? 0), 0);
  const filledNights = withWindow.reduce((s, r) => s + r.filledNights, 0);

  const nextOut = upcoming
    .filter(r => r.daysUntilStart !== null && r.daysUntilStart >= 0)
    .sort((a, b) => (a.daysUntilStart ?? 0) - (b.daysUntilStart ?? 0))[0] ?? null;

  return {
    upcomingCount: upcoming.length,
    pastCount: rows.length - upcoming.length,
    totalNights,
    filledNights,
    openNights: totalNights - filledNights,
    fillPct: totalNights === 0 ? 0 : Math.round((filledNights / totalNights) * 100),
    emptyRuns: withWindow.filter(r => r.filledNights === 0).length,
    pitched: upcoming.reduce((s, r) => s + r.pitched, 0),
    holds: upcoming.reduce((s, r) => s + r.holds, 0),
    stageCounts: {
      pre_planning: rows.filter(r => r.stage === 'pre_planning').length,
      advancing: rows.filter(r => r.stage === 'advancing').length,
      on_road: rows.filter(r => r.stage === 'on_road').length,
      completed: rows.filter(r => r.stage === 'completed').length,
    },
    nextOut,
  };
}

/**
 * Rows for a tab. Upcoming runs soonest-first (no start date last); past runs
 * most-recent-first; "all" is upcoming then past.
 */
export function rowsForTab(rows: readonly TourProgress[], tab: TourTab): TourProgress[] {
  const byStartAsc = (a: TourProgress, b: TourProgress): number =>
    (a.tour.start_date ?? '9999-12-31').localeCompare(b.tour.start_date ?? '9999-12-31');
  const upcoming = rows.filter(r => r.upcoming).sort(byStartAsc);
  const past = rows.filter(r => !r.upcoming).sort((a, b) => byStartAsc(b, a));
  if (tab === 'upcoming') return upcoming;
  if (tab === 'past') return past;
  return [...upcoming, ...past];
}
