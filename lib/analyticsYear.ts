/**
 * Year scoping for the Analytics booking numbers.
 *
 * Bands review their money one calendar year at a time (year-over-year and tax
 * season), so Analytics must report a single selected year instead of all-time
 * totals. All helpers work on ISO `YYYY-MM-DD` show dates.
 */

export interface DatedBooking {
  show_date: string | null;
}

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/**
 * Parses the `year` query value. Accepts a plain 4-digit integer between
 * 2000 and 2100; anything else (missing, repeated, malformed, out of range)
 * falls back to `fallback`.
 */
export function resolveYear(raw: string | string[] | undefined, fallback: number): number {
  if (typeof raw !== 'string' || !/^\d{4}$/.test(raw)) return fallback;
  const year = Number(raw);
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : fallback;
}

/** True when an ISO date string falls in the given calendar year. */
export function isInYear(isoDate: string | null | undefined, year: number): boolean {
  return typeof isoDate === 'string' && isoDate.startsWith(`${year}-`);
}

/** Returns only the bookings whose show date is in the given calendar year. */
export function bookingsInYear<T extends DatedBooking>(bookings: readonly T[], year: number): T[] {
  return bookings.filter(b => isInYear(b.show_date, year));
}

/**
 * Distinct years that have at least one dated booking, plus `currentYear`,
 * sorted newest first. Used to populate the year picker.
 */
export function availableBookingYears(bookings: readonly DatedBooking[], currentYear: number): number[] {
  const years = new Set<number>([currentYear]);
  for (const b of bookings) {
    const match = typeof b.show_date === 'string' ? /^(\d{4})-/.exec(b.show_date) : null;
    if (match) years.add(Number(match[1]));
  }
  return [...years].sort((a, b) => b - a);
}
