// lib/domain/showDay.ts
//
// Pure helpers behind the Today page (pages/today.tsx): which shows count as
// "on the books" for a day, the run-of-show timeline, the logistics rows, and
// the plain-English line in the page hero. No Supabase, no React — the page
// loads rows and renders; everything that can be wrong lives here, unit-tested
// in __tests__/lib/domain/showDay.test.ts.

import { BOOKED_SHOW_STATUSES } from '../types';
import { parseLocalDate } from '../formatDate';

/** Booking statuses that put a show on the Today page (contract onward, never cancelled). */
export const SHOW_DAY_STATUSES: readonly string[] = BOOKED_SHOW_STATUSES;

/** The booking fields the Today page reads. Everything is optional/nullable on purpose: day sheets are often half-filled. */
export interface ShowDayBooking {
  id: string;
  show_date: string | null;
  status: string;
  tour_id: string | null;
  load_in_time: string | null;
  soundcheck_time: string | null;
  set_time: string | null;
  end_time: string | null;
  sound_system: string | null;
  meals_provided: boolean | null;
  drinks_provided: boolean | null;
  hotel_booked: boolean | null;
  lodging_details: string | null;
  venue_contact_name: string | null;
  special_requirements: string | null;
  advance_notes: string | null;
  deal_type: string | null;
  agreed_amount: number | null;
  venue: ShowDayVenue | null;
  tour: { id: string; name: string } | null;
}

export interface ShowDayVenue {
  id: string;
  name: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
}

/** One stop on the run-of-show strip. `time` is the raw HH:MM[:SS] value, or null when not set yet. */
export interface RunOfShowStep {
  key: 'load_in' | 'soundcheck' | 'showtime' | 'end';
  label: string;
  time: string | null;
  /** Load-in, soundcheck and showtime are needed to play the show; end time is nice to have. */
  required: boolean;
}

export interface LogisticsRow {
  label: string;
  value: string;
  /** true when the answer is a "yes, sorted" (meals provided, hotel booked…). Drives the green dot. */
  ok: boolean;
}

export const DEAL_LABELS: Readonly<Record<string, string>> = {
  guarantee: 'Guarantee',
  door_split: 'Door split',
  percentage: 'Percentage',
  flat_fee: 'Flat fee',
  other: 'Other',
};

const TIME = /^(\d{1,2}):(\d{2})/;

/**
 * "17:30:00" → "5:30 PM". Returns null for empty or unparseable input so the
 * caller decides how to show a missing time (the page says "TBD").
 */
export function formatClock(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = TIME.exec(t.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  if (hour > 23) return null;
  return `${hour % 12 || 12}:${m[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

/** Load-in → Soundcheck → Showtime → End, in that order. */
export function runOfShow(b: Pick<ShowDayBooking, 'load_in_time' | 'soundcheck_time' | 'set_time' | 'end_time'>): RunOfShowStep[] {
  return [
    { key: 'load_in', label: 'Load-in', time: b.load_in_time || null, required: true },
    { key: 'soundcheck', label: 'Soundcheck', time: b.soundcheck_time || null, required: true },
    { key: 'showtime', label: 'Showtime', time: b.set_time || null, required: true },
    { key: 'end', label: 'End', time: b.end_time || null, required: false },
  ];
}

/** Labels of the required run-of-show times that are still blank. */
export function missingTimes(b: Pick<ShowDayBooking, 'load_in_time' | 'soundcheck_time' | 'set_time' | 'end_time'>): string[] {
  return runOfShow(b).filter(s => s.required && !s.time).map(s => s.label);
}

function soundLabel(sound: string | null): { value: string; ok: boolean } {
  if (sound === 'house') return { value: 'House PA', ok: true };
  if (sound === 'self') return { value: 'Bringing our own', ok: true };
  return { value: 'TBD', ok: false };
}

/** The always-shown logistics rows (sound, meals, drinks, hotel). Free-text fields are rendered separately. */
export function logisticsRows(b: Pick<ShowDayBooking, 'sound_system' | 'meals_provided' | 'drinks_provided' | 'hotel_booked'>): LogisticsRow[] {
  const sound = soundLabel(b.sound_system);
  return [
    { label: 'Sound', value: sound.value, ok: sound.ok },
    { label: 'Meals', value: b.meals_provided ? 'Provided' : 'Not provided', ok: !!b.meals_provided },
    { label: 'Drinks', value: b.drinks_provided ? 'Provided' : 'Not provided', ok: !!b.drinks_provided },
    { label: 'Hotel', value: b.hotel_booked ? 'Booked' : 'Not booked', ok: !!b.hotel_booked },
  ];
}

/** "Guarantee · $1,500", "Door split", or null when there is nothing to show. */
export function dealSummary(b: Pick<ShowDayBooking, 'deal_type' | 'agreed_amount'>): string | null {
  const type = b.deal_type ? (DEAL_LABELS[b.deal_type] ?? b.deal_type) : null;
  const amount = typeof b.agreed_amount === 'number' && b.agreed_amount > 0
    ? b.agreed_amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : null;
  if (!type && !amount) return null;
  return [type ?? 'Deal TBD', amount].filter(Boolean).join(' · ');
}

/** "Fayetteville, AR", "Fayetteville", "AR", or null. */
export function cityLine(v: Pick<ShowDayVenue, 'city' | 'state'> | null | undefined): string | null {
  if (!v) return null;
  const parts = [v.city?.trim(), v.state?.trim()].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** Google Maps search link for a venue's address (or name + town when there is no street address). */
export function mapsLink(v: ShowDayVenue | null | undefined): string | null {
  if (!v) return null;
  const q = v.address?.trim() || [v.name, v.city, v.state].filter(Boolean).join(' ').trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** YYYY-MM-DD plus `days`, in local calendar terms (no UTC day-shift). */
export function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD). DST-safe. */
export function daysBetween(from: string, to: string): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
}

/** 1-based position of a show among its tour's booked dates, or null if it isn't in the list. */
export function tourPosition(showId: string, tourShows: ReadonlyArray<{ id: string; show_date: string | null }>): { current: number; total: number } | null {
  const dated = tourShows
    .filter(s => !!s.show_date)
    .slice()
    .sort((a, b) => (a.show_date! < b.show_date! ? -1 : a.show_date! > b.show_date! ? 1 : 0));
  const i = dated.findIndex(s => s.id === showId);
  return i === -1 ? null : { current: i + 1, total: dated.length };
}

/** The status line under the hero title. */
export function heroSummary(input: {
  todayShows: ReadonlyArray<Pick<ShowDayBooking, 'venue'>>;
  tomorrowShows: ReadonlyArray<Pick<ShowDayBooking, 'venue'>>;
  next: { show_date: string; venue: Pick<ShowDayVenue, 'name' | 'city' | 'state'> | null } | null;
  today: string;
}): string {
  const { todayShows, tomorrowShows, next, today } = input;
  if (todayShows.length > 1) return `Show day — ${todayShows.length} shows on the books today.`;
  if (todayShows.length === 1) {
    const v = todayShows[0].venue;
    const where = cityLine(v);
    const name = v?.name?.trim();
    return `Show day — ${name || 'venue TBD'}${where ? ` in ${where}` : ''}.`;
  }
  if (tomorrowShows.length > 0) return 'Off day — you play again tomorrow.';
  if (next) {
    const n = daysBetween(today, next.show_date);
    const name = next.venue?.name?.trim() || 'the next show';
    return `Off day — ${name} in ${n} ${n === 1 ? 'day' : 'days'}.`;
  }
  return 'Off day — nothing on the books yet.';
}
