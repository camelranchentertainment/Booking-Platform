// lib/domain/analytics.ts
//
// Pure builders for the Analytics page (/api/analytics → pages/analytics.tsx).
// No I/O, so each figure is unit-tested on its own.
//
// Two rules carried from CLAUDE.md:
//   - Earned    = actual_amount_received on completed shows only.
//   - Potential = agreed_amount on confirmed FUTURE shows only.

/** Booking statuses that mean the show is on the books (not a hold, not cancelled). */
export const BOOKED_STATUSES = ['contract', 'confirmed', 'advancing', 'completed'] as const;

export interface AnalyticsBooking {
  show_date: string | null;
  status: string;
  agreed_amount?: number | null;
  actual_amount_received?: number | null;
  venue_id?: string | null;
  tour_id?: string | null;
  venue?: { name?: string | null; city?: string | null; state?: string | null } | null;
}

export interface AnalyticsTourVenue {
  id: string;
  status: string;
  tour_id: string;
  venue_id: string | null;
  pitched_at?: string | null;
  last_contacted_at?: string | null;
}

export interface AnalyticsEmail {
  sent_at: string | null;
  direction: string | null;
  venue_id?: string | null;
}

const isBooked = (status: string) => (BOOKED_STATUSES as readonly string[]).includes(status);

/** Whole-number percentage, 0 when the denominator is 0. */
export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

// ── Outreach funnel ──────────────────────────────────────────────────────────

export interface FunnelStep {
  key: 'pipeline' | 'pitched' | 'replied' | 'booked';
  label: string;
  count: number;
  /** Share of the step before it (100 for the first step). */
  ofPrevious: number;
  /** Share of everything in the pipeline. */
  ofTotal: number;
}

/**
 * A real funnel: each step is a subset of the one before, so the step-to-step
 * rates are always 0–100%. (The old page compared stage *counts* — 5 targets vs
 * 32 follow-ups — and printed "-540%".)
 *
 * - Pipeline: every tour target.
 * - Pitched:  emailed at least once (pitched_at / last contact), or moved past "target".
 * - Replied:  pitched, and the venue has written back (a received email).
 * - Booked:   replied or not, the target is confirmed / thanked, or the band has a
 *             booked show at that venue on that tour.
 *
 * Booked is counted within Pitched so the funnel stays nested; a show booked
 * without any recorded email still counts as pitched (the band reached them).
 */
export function buildFunnel(
  targets: readonly AnalyticsTourVenue[],
  repliedVenueIds: ReadonlySet<string>,
  bookings: readonly AnalyticsBooking[],
): FunnelStep[] {
  const bookedPairs = new Set(
    bookings
      .filter(b => isBooked(b.status) && b.venue_id && b.tour_id)
      .map(b => `${b.tour_id}:${b.venue_id}`),
  );
  const booked = (t: AnalyticsTourVenue) =>
    ['confirmed', 'thank_you'].includes(t.status) || (t.venue_id != null && bookedPairs.has(`${t.tour_id}:${t.venue_id}`));
  const pitched = (t: AnalyticsTourVenue) =>
    booked(t) || t.status !== 'target' || Boolean(t.pitched_at) || Boolean(t.last_contacted_at);
  const replied = (t: AnalyticsTourVenue) =>
    pitched(t) && (booked(t) || (t.venue_id != null && repliedVenueIds.has(t.venue_id)));

  const total = targets.length;
  const counts = [
    total,
    targets.filter(pitched).length,
    targets.filter(replied).length,
    targets.filter(booked).length,
  ];
  const meta: Array<Pick<FunnelStep, 'key' | 'label'>> = [
    { key: 'pipeline', label: 'In the pipeline' },
    { key: 'pitched', label: 'Pitched' },
    { key: 'replied', label: 'Wrote back' },
    { key: 'booked', label: 'Booked' },
  ];
  return meta.map((m, i) => ({
    ...m,
    count: counts[i],
    ofPrevious: i === 0 ? 100 : pct(counts[i], counts[i - 1]),
    ofTotal: pct(counts[i], total),
  }));
}

// ── Shows by month ───────────────────────────────────────────────────────────

export interface MonthShows {
  /** 0–11 */
  month: number;
  /** Completed shows (played). */
  played: number;
  /** Booked shows not yet played (contract / confirmed / advancing). */
  upcoming: number;
  /** Earned that month: actual_amount_received on completed shows. */
  earned: number;
}

/** Twelve months of the selected year: shows played vs still to play, and money earned. */
export function showsByMonth(bookings: readonly AnalyticsBooking[], year: number): MonthShows[] {
  const months: MonthShows[] = Array.from({ length: 12 }, (_, month) => ({ month, played: 0, upcoming: 0, earned: 0 }));
  for (const b of bookings) {
    if (!b.show_date || !b.show_date.startsWith(`${year}-`) || !isBooked(b.status)) continue;
    const m = Number(b.show_date.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    if (b.status === 'completed') {
      months[m].played += 1;
      months[m].earned += Number(b.actual_amount_received ?? 0) || 0;
    } else {
      months[m].upcoming += 1;
    }
  }
  return months;
}

// ── Email activity ───────────────────────────────────────────────────────────

export interface WeekActivity {
  /** Monday of the week, YYYY-MM-DD (UTC). */
  weekStart: string;
  sent: number;
  received: number;
}

/** Monday 00:00 UTC of the week containing `d`. */
function mondayUtc(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // Mon = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

/** Emails sent and replies received per week, for the last `weeks` weeks (oldest first). */
export function emailByWeek(emails: readonly AnalyticsEmail[], now: Date, weeks = 12): WeekActivity[] {
  const thisWeek = mondayUtc(now).getTime();
  const WEEK = 7 * 86_400_000;
  const out: WeekActivity[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: new Date(thisWeek - (weeks - 1 - i) * WEEK).toISOString().slice(0, 10),
    sent: 0,
    received: 0,
  }));
  const first = thisWeek - (weeks - 1) * WEEK;
  for (const e of emails) {
    if (!e.sent_at) continue;
    const t = Date.parse(e.sent_at);
    if (!Number.isFinite(t) || t < first) continue;
    const idx = Math.floor((mondayUtc(new Date(t)).getTime() - first) / WEEK);
    if (idx < 0 || idx >= weeks) continue;
    if (e.direction === 'received') out[idx].received += 1;
    else out[idx].sent += 1;
  }
  return out;
}

// ── Where the shows are ──────────────────────────────────────────────────────

export interface StateShows {
  state: string;
  shows: number;
  earned: number;
}

/** Booked shows in the selected year, grouped by venue state (most shows first). */
export function showsByState(bookings: readonly AnalyticsBooking[], year: number): StateShows[] {
  const map = new Map<string, StateShows>();
  for (const b of bookings) {
    if (!b.show_date?.startsWith(`${year}-`) || !isBooked(b.status)) continue;
    const state = (b.venue?.state || '').trim().toUpperCase() || '—';
    const row = map.get(state) ?? { state, shows: 0, earned: 0 };
    row.shows += 1;
    if (b.status === 'completed') row.earned += Number(b.actual_amount_received ?? 0) || 0;
    map.set(state, row);
  }
  return [...map.values()].sort((a, b) => b.shows - a.shows || b.earned - a.earned || a.state.localeCompare(b.state));
}

export interface TopVenue {
  venueId: string;
  name: string;
  where: string;
  shows: number;
  earned: number;
}

/** The venues that paid the most in the selected year (completed shows), best first. */
export function topVenues(bookings: readonly AnalyticsBooking[], year: number, limit = 5): TopVenue[] {
  const map = new Map<string, TopVenue>();
  for (const b of bookings) {
    if (b.status !== 'completed' || !b.venue_id || !b.show_date?.startsWith(`${year}-`)) continue;
    const row = map.get(b.venue_id) ?? {
      venueId: b.venue_id,
      name: b.venue?.name || 'Venue',
      where: [b.venue?.city, b.venue?.state].filter(Boolean).join(', '),
      shows: 0,
      earned: 0,
    };
    row.shows += 1;
    row.earned += Number(b.actual_amount_received ?? 0) || 0;
    map.set(b.venue_id, row);
  }
  return [...map.values()]
    .sort((a, b) => b.earned - a.earned || b.shows - a.shows || a.name.localeCompare(b.name))
    .slice(0, limit);
}
