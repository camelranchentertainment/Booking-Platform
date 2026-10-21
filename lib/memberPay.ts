// lib/memberPay.ts
//
// Builds a band member's yearly pay statement from the rows returned by
// GET /api/member/shows (the member's own roster spots, RLS-scoped, with pay
// resolved server-side: the band admin's set amount, else the member's usual
// rate as an estimate).
//
// Pure functions only — no fetching — so the page stays thin and this is
// unit-testable.

export type Rsvp = 'pending' | 'confirmed' | 'declined';

/** One row from /api/member/shows (only the fields this module reads). */
export interface MemberShowRow {
  id: string;
  status: Rsvp | string;
  show_date: string | null;
  booking_status: string | null;
  venue: { name: string | null; city: string | null; state: string | null } | null;
  pay: { amount: number; source: 'confirmed' | 'estimated' } | null;
}

export type PayKind = 'played' | 'upcoming';

export interface PayLine {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  venue: string;
  place: string;
  kind: PayKind;
  rsvp: Rsvp;
  /** null when the band admin set no pay and the member has no usual rate */
  amount: number | null;
  estimated: boolean;
}

export interface PayMonth {
  /** 0-11 */
  month: number;
  lines: PayLine[];
  played: number;
  upcoming: number;
}

export interface PayStatement {
  year: number;
  months: PayMonth[];
  /** pay for shows dated before today */
  played: number;
  /** pay for shows dated today or later */
  upcoming: number;
  playedCount: number;
  upcomingCount: number;
  /** how many included lines use the member's usual rate, not a set amount */
  estimatedCount: number;
  /** how many included lines have no pay at all */
  unpricedCount: number;
}

/** Shows that never count toward a member's pay. */
function isExcluded(row: MemberShowRow): boolean {
  return !row.show_date || row.status === 'declined' || row.booking_status === 'cancelled';
}

function normaliseRsvp(status: string): Rsvp {
  return status === 'confirmed' || status === 'declined' ? status : 'pending';
}

/** Rounds to cents so float sums never print as 1049.9999999. */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Years that have at least one countable show, newest first, always including
 * the current year so the page never opens on an empty picker.
 */
export function payYears(rows: readonly MemberShowRow[], currentYear: number): number[] {
  const years = new Set<number>([currentYear]);
  for (const row of rows) {
    if (isExcluded(row)) continue;
    years.add(Number(row.show_date!.slice(0, 4)));
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * The member's pay for one calendar year, grouped by month.
 *
 * Excluded: shows the member declined, cancelled shows, rows without a date.
 * "Played" means dated before `today`; "upcoming" means today or later. Pay
 * a band admin set counts as-is; otherwise the member's usual rate counts and
 * is flagged as an estimate.
 *
 * @param rows  rows from /api/member/shows
 * @param year  calendar year to report
 * @param today local date as YYYY-MM-DD (lib/formatDate localToday)
 */
export function buildPayStatement(rows: readonly MemberShowRow[], year: number, today: string): PayStatement {
  const prefix = `${year}-`;
  const lines: PayLine[] = rows
    .filter((row) => !isExcluded(row) && row.show_date!.startsWith(prefix))
    .map((row) => {
      const date = row.show_date!.slice(0, 10);
      const venue = row.venue;
      return {
        id: row.id,
        date,
        venue: venue?.name ?? 'Venue TBA',
        place: [venue?.city, venue?.state].filter(Boolean).join(', '),
        kind: date < today ? 'played' : 'upcoming',
        rsvp: normaliseRsvp(row.status),
        amount: row.pay ? cents(row.pay.amount) : null,
        estimated: row.pay?.source === 'estimated',
      } satisfies PayLine;
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const byMonth = new Map<number, PayMonth>();
  for (const line of lines) {
    const month = Number(line.date.slice(5, 7)) - 1;
    const bucket = byMonth.get(month) ?? { month, lines: [], played: 0, upcoming: 0 };
    bucket.lines.push(line);
    if (line.amount !== null) bucket[line.kind] = cents(bucket[line.kind] + line.amount);
    byMonth.set(month, bucket);
  }

  const months = [...byMonth.values()].sort((a, b) => a.month - b.month);
  return {
    year,
    months,
    played: cents(months.reduce((sum, m) => sum + m.played, 0)),
    upcoming: cents(months.reduce((sum, m) => sum + m.upcoming, 0)),
    playedCount: lines.filter((l) => l.kind === 'played').length,
    upcomingCount: lines.filter((l) => l.kind === 'upcoming').length,
    estimatedCount: lines.filter((l) => l.estimated).length,
    unpricedCount: lines.filter((l) => l.amount === null).length,
  };
}
