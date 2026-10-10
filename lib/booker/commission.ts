// lib/booker/commission.ts
// Commission maths for the Booking Agent workspace. Pure functions, no I/O.
//
// Rules:
//   * Rate = the show's override if set, else the band's rate. No rate = no commission.
//   * Earned (due) only on PLAYED shows, on the actual amount received when entered,
//     otherwise on the agreed fee.
//   * Projected only on CONFIRMED shows dated today or later, on the agreed fee
//     (a confirmed show in the past is waiting to be marked played, not "potential").
//   * Holds, pending and cancelled shows carry no commission.
//   * All money is rounded to cents through integer arithmetic.

import type { BookerShow, CommissionPayment, RosterBand } from './types';

type ShowMoney = Pick<BookerShow, 'status' | 'fee' | 'actual_amount' | 'commission_pct_override' | 'show_date'>;
type BandRate = Pick<RosterBand, 'commission_pct'>;

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
 */
export function effectiveRate(show: Pick<ShowMoney, 'commission_pct_override'>, band: BandRate | null | undefined): number | null {
  const override = toAmount(show.commission_pct_override);
  if (override !== null) return override;
  return toAmount(band?.commission_pct ?? null);
}

/** Commission earned on a played show. Zero for any other status or when no rate is set. */
export function commissionDue(show: ShowMoney, band: BandRate | null | undefined): number {
  if (show.status !== 'played') return 0;
  const rate = effectiveRate(show, band);
  const basis = toAmount(show.actual_amount) ?? toAmount(show.fee);
  if (rate === null || basis === null) return 0;
  return roundCents((basis * rate) / 100);
}

/**
 * Commission expected from a confirmed show that has not happened yet.
 *
 * @param today ISO date; confirmed shows before it are not counted
 */
export function commissionProjected(show: ShowMoney, band: BandRate | null | undefined, today: string): number {
  if (show.status !== 'confirmed' || show.show_date < today) return 0;
  const rate = effectiveRate(show, band);
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
 */
export function commissionTotals(
  shows: ReadonlyArray<ShowMoney & Pick<BookerShow, 'id' | 'roster_id' | 'deleted_at'>>,
  bandsById: ReadonlyMap<string, BandRate>,
  payments: ReadonlyArray<Pick<CommissionPayment, 'show_id' | 'amount' | 'deleted_at'>>,
  today: string,
): CommissionTotals {
  let due = 0;
  let paid = 0;
  let outstanding = 0;
  let projected = 0;
  for (const show of shows) {
    if (show.deleted_at) continue;
    const band = bandsById.get(show.roster_id);
    const showDue = Math.round(commissionDue(show, band) * 100);
    const showPaid = Math.round(paidForShow(show.id, payments) * 100);
    due += showDue;
    paid += showPaid;
    outstanding += Math.max(0, showDue - showPaid);
    projected += Math.round(commissionProjected(show, band, today) * 100);
  }
  return { due: due / 100, paid: paid / 100, outstanding: outstanding / 100, projected: projected / 100 };
}

/** Formats a dollar amount for display, e.g. 1234.5 → "$1,234.50". */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
