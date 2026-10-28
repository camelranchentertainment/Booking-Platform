// lib/domain/bookingsList.ts
//
// Pure helpers for the Bookings page (pages/bookings/index.tsx): which shows
// a view includes, the pipeline stage counts, month grouping, and the shows
// that were played but never settled. No I/O, so each is unit-tested.

import { BOOKING_STATUS_ORDER, type BookingStatus } from '../types';

export interface ListBooking {
  id: string;
  show_date: string | null;
  status: string;
  agreed_amount?: number | string | null;
  fee?: number | string | null;
  venue?: { name?: string | null; city?: string | null; state?: string | null } | null;
  tour?: { name?: string | null } | null;
}

export type BookingsTab = 'upcoming' | 'past' | 'all';

/** Statuses that mean the show is on the books but not yet settled. */
const OPEN_BOOKED = new Set(['contract', 'confirmed', 'advancing']);

/** A show dated before today. Undated shows are never past. */
export function isPast(b: ListBooking, today: string): boolean {
  return b.show_date != null && b.show_date < today;
}

/** Played (date passed) and still booked, so nobody has marked it played and paid. */
export function needsSettling(b: ListBooking, today: string): boolean {
  return isPast(b, today) && OPEN_BOOKED.has(b.status);
}

/** agreed_amount, else fee; null when neither is a number. */
export function dealAmount(b: ListBooking): number | null {
  for (const v of [b.agreed_amount, b.fee]) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** "Tipsy Taco Lee's Summit MO Winter Run" — what the search box matches against. */
function haystack(b: ListBooking): string {
  return [b.venue?.name, b.venue?.city, b.venue?.state, b.tour?.name].filter(Boolean).join(' ').toLowerCase();
}

export interface BookingsFilter {
  tab: BookingsTab;
  /** Limit to one pipeline stage; null for every stage. */
  status: BookingStatus | null;
  query: string;
}

/**
 * The bookings a view shows, in display order.
 *
 * - Upcoming: dated today or later, undated, or past but not settled (so they
 *   don't vanish before someone marks them played). Soonest first; undated last.
 * - Past: dated before today. Most recent first.
 * - All: every booking, soonest first.
 *
 * Cancelled bookings are never listed.
 */
export function filterBookings(list: readonly ListBooking[], f: BookingsFilter, today: string): ListBooking[] {
  const q = f.query.trim().toLowerCase();
  const rows = list.filter(b => {
    if (b.status === 'cancelled') return false;
    if (f.status && b.status !== f.status) return false;
    if (q && !haystack(b).includes(q)) return false;
    if (f.tab === 'upcoming') return !isPast(b, today) || needsSettling(b, today);
    if (f.tab === 'past') return isPast(b, today);
    return true;
  });
  const key = (b: ListBooking) => b.show_date ?? '9999-99-99';
  rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  if (f.tab === 'past') rows.reverse();
  return rows;
}

/** Count per pipeline stage, in pipeline order (cancelled left out). */
export function stageCounts(list: readonly ListBooking[]): Array<{ status: BookingStatus; count: number }> {
  return BOOKING_STATUS_ORDER.map(status => ({ status, count: list.filter(b => b.status === status).length }));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface MonthGroup {
  /** YYYY-MM, or "tbd" for undated shows. */
  key: string;
  label: string;
  items: ListBooking[];
}

/** Groups an already-sorted list by show month, keeping the list's order. */
export function groupByMonth(list: readonly ListBooking[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const b of list) {
    const key = b.show_date ? b.show_date.slice(0, 7) : 'tbd';
    let g = groups.find(x => x.key === key);
    if (!g) {
      const label = key === 'tbd' ? 'Date to be set' : `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
      g = { key, label, items: [] };
      groups.push(g);
    }
    g.items.push(b);
  }
  return groups;
}

/** The next booked show (contract / confirmed / advancing) dated today or later. */
export function nextShow(list: readonly ListBooking[], today: string): ListBooking | null {
  return list
    .filter(b => OPEN_BOOKED.has(b.status) && b.show_date != null && b.show_date >= today)
    .sort((a, b) => (a.show_date! < b.show_date! ? -1 : 1))[0] ?? null;
}
