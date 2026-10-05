// Shared date formatting for Postgres `date` columns (show_date, start_date,
// end_date, booking_date, expense_date, date_paid, last_contact_date, ...).
//
// These arrive as date-only strings ("2026-08-08"). Per the JS spec,
// `new Date("2026-08-08")` parses as *UTC* midnight, so formatting it in any
// timezone behind UTC renders the previous day ("Aug 7"). Building the Date
// from its parts pins it to *local* midnight, which always formats as the
// stored calendar day.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a date string safely: date-only strings become local midnight;
 *  full timestamps fall through to the normal Date constructor. */
export function parseLocalDate(dateStr: string): Date {
  if (DATE_ONLY.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(dateStr);
}

/** Format a date-only string for display without the UTC day-shift. */
export function formatShowDate(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' },
): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', options);
}

/**
 * Today's date as YYYY-MM-DD in the browser's local time zone.
 * (toISOString() would give the UTC date, which is "tomorrow" every evening
 * in the US and would hide tonight's targets early.)
 */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
