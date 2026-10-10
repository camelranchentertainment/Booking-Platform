// lib/booker/dates.ts
// Calendar-date helpers for the Booking Agent workspace. Show dates are plain
// YYYY-MM-DD strings (Postgres `date`), so all arithmetic is done in UTC on the
// date alone; no time zone can shift a show to the day before.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when value is a real calendar date in YYYY-MM-DD form. */
export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

/** Today's date in the viewer's local time zone, as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toUtc(iso: string): Date {
  if (!isIsoDate(iso)) throw new RangeError(`Not an ISO date: ${iso}`);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Adds whole days to an ISO date. */
export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Day of week for an ISO date: 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(iso: string): number {
  return toUtc(iso).getUTCDay();
}

/**
 * The weekend an agent cares about "this weekend": Friday through Sunday.
 * Monday–Thursday → the coming Fri–Sun. Friday–Sunday → the weekend in progress.
 */
export function weekendRange(todayIsoDate: string): { start: string; end: string } {
  const dow = dayOfWeek(todayIsoDate);
  // Days back to Friday for Fri(5)/Sat(6)/Sun(0); days forward otherwise.
  const offset = dow === 5 ? 0 : dow === 6 ? -1 : dow === 0 ? -2 : 5 - dow;
  const start = addDays(todayIsoDate, offset);
  return { start, end: addDays(start, 2) };
}

/** First and last day of a calendar year. */
export function yearRange(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri, Oct 24" — or "Fri, Oct 24, 2027" when the year differs from `currentYear`. */
export function formatShowDate(iso: string, currentYear?: number): string {
  const d = toUtc(iso);
  const base = `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return currentYear !== undefined && d.getUTCFullYear() !== currentYear ? `${base}, ${d.getUTCFullYear()}` : base;
}

/** "19:30:00" or "19:30" → "7:30 PM". Returns null for empty input. */
export function formatTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}
