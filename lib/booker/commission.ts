// lib/booker/commission.ts
// Commission maths for the Booking Agent workspace. Pure functions, no I/O.
//
// Rules:
//   * Rate = the show's override if set; else, on a repeat booking (the band
//     has already played that venue), the band's repeat rate when set; else
//     the band's rate. No rate = no commission.
//   * Earned (due) only on PLAYED shows, on the actual amount received when entered,
//     otherwise on the agreed fee.
//   * Projected only on CONFIRMED shows dated today or later, on the agreed fee
//     (a confirmed show in the past is waiting to be marked played, not "potential").
//   * Holds, pending and cancelled shows carry no commission.
//   * All money is rounded to cents through integer arithmetic.

import type { BookerShow, CommissionPayment, RosterBand } from './types';

type ShowMoney = Pick<BookerShow, 'status' | 'fee' | 'actual_amount' | 'commission_pct_override' | 'show_date'>;
type BandRate = Pick<RosterBand, 'commission_pct'> & Partial<Pick<RosterBand, 'repeat_commission_pct'>>;
type PlaceShow = Pick<BookerShow, 'id' | 'roster_id' | 'venue_id' | 'venue_name' | 'show_date' | 'status' | 'deleted_at'>;

/** Coerces a numeric column (PostgREST may return numeric as string) to a finite number or null. */
export function toAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Rounds to whole cents. */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The commission rate that applies to a show, as a percent (0-100), or null when
 * neither the show nor the band has one.
 *
 * @param repeat the band has already played this venue (see repeatShowIds)
 */
export function effectiveRate(show: Pick<ShowMoney, 'commission_pct_override'>, band: BandRate | null | undefined, repeat = false): number | null {
  const override = toAmount(show.commission_pct_override);
  if (override !== null) return override;
  if (repeat) {
    const repeatRate = toAmount(band?.repeat_commission_pct ?? null);
    if (repeatRate !== null) return repeatRate;
  }
  return toAmount(band?.commission_pct ?? null);
}

/** A show's place, for matching repeat bookings: a saved venue by id, a typed venue by name. */
function placeKey(s: Pick<BookerShow, 'venue_id' | 'venue_name'>): string | null {
  if (s.venue_id) return `id:${s.venue_id}`;
  const name = s.venue_name?.trim().toLowerCase();
  return name ? `name:${name}` : null;
}

/**
 * Shows that are repeat bookings: the same band has a PLAYED show at the same
 * venue on an earlier date. Pass every show you have (not just one year), so
 * history from earlier years counts.
 */
export function repeatShowIds(shows: readonly PlaceShow[]): Set<string> {
  const firstPlayed = new Map<string, string>(); // band|place → earliest played date
  for (const s of shows) {
    if (s.deleted_at || s.status !== 'played') continue;
    const place = placeKey(s);
    if (!place) continue;
    const key = `${s.roster_id}|${place}`;
    const prev = firstPlayed.get(key);
    if (!prev || s.show_date < prev) firstPlayed.set(key, s.show_date);
  }
  const out = new Set<string>();
  for (const s of shows) {
    if (s.deleted_at) continue;
    const place = placeKey(s);
    if (!place) continue;
    const first = firstPlayed.get(`${s.roster_id}|${place}`);
    if (first && first < s.show_date) out.add(s.id);
  }
  return out;
}

/** Commission earned on a played show. Zero for any other status or when no rate is set. */
export function commissionDue(show: ShowMoney, band: BandRate | null | undefined, repeat = false): number {
  if (show.status !== 'played') return 0;
  const rate = effectiveRate(show, band, repeat);
  const basis = toAmount(show.actual_amount) ?? toAmount(show.fee);
  if (rate === null || basis === null) return 0;
  return roundCents((basis * rate) / 100);
}

/**
 * Commission expected from a confirmed show that has not happened yet.
 *
 * @param today ISO date; confirmed shows before it are not counted
 */
export function commissionProjected(show: ShowMoney, band: BandRate | null | undefined, today: string, repeat = false): number {
  if (show.status !== 'confirmed' || show.show_date < today) return 0;
  const rate = effectiveRate(show, band, repeat);
  const fee = toAmount(show.fee);
  if (rate === null || fee === null) return 0;
  return roundCents((fee * rate) / 100);
}

/** Sum of active (not archived) payments recorded against one show. */
export function paidForShow(showId: string, payments: ReadonlyArray<Pick<CommissionPayment, 'show_id' | 'amount' | 'deleted_at'>>): number {
  let cents = 0;
  for (const p of payments) {
    if (p.show_id !== showId || p.deleted_at) continue;
    cents += Math.round((toAmount(p.amount) ?? 0) * 100);
  }
  return cents / 100;
}

export interface CommissionTotals {
  due: number;
  paid: number;
  outstanding: number;
  projected: number;
}

/**
 * Totals across shows. Outstanding never goes below zero per show, so an
 * overpayment on one show does not hide money owed on another.
 *
 * @param shows    shows to total (callers pass one band, or one calendar year)
 * @param bandsById roster bands keyed by id, for each show's rate
 * @param payments all payments for those shows
 * @param today    ISO date, for what still counts as projected
 * @param repeats  ids of repeat bookings (repeatShowIds over all shows), for the repeat rate
 */
export function commissionTotals(
  shows: ReadonlyArray<ShowMoney & Pick<BookerShow, 'id' | 'roster_id' | 'deleted_at'>>,
  bandsById: ReadonlyMap<string, BandRate>,
  payments: ReadonlyArray<Pick<CommissionPayment, 'show_id' | 'amount' | 'deleted_at'>>,
  today: string,
  repeats: ReadonlySet<string> = new Set(),
): CommissionTotals {
  let due = 0;
  let paid = 0;
  let outstanding = 0;
  let projected = 0;
  for (const show of shows) {
    if (show.deleted_at) continue;
    const band = bandsById.get(show.roster_id);
    const repeat = repeats.has(show.id);
    const showDue = Math.round(commissionDue(show, band, repeat) * 100);
    const showPaid = Math.round(paidForShow(show.id, payments) * 100);
    due += showDue;
    paid += showPaid;
    outstanding += Math.max(0, showDue - showPaid);
    projected += Math.round(commissionProjected(show, band, today, repeat) * 100);
  }
  return { due: due / 100, paid: paid / 100, outstanding: outstanding / 100, projected: projected / 100 };
}

/** Formats a dollar amount for display, e.g. 1234.5 → "$1,234.50". */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
