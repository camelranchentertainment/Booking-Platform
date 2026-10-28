// lib/domain/financials.ts
//
// Pure money math for the Financials page (pages/financials.tsx). No I/O, so
// every figure is unit-tested on its own (__tests__/lib/domain/financials.test.ts).
//
// Rules (CLAUDE.md, and the same as the mobile app's lib/moneySummary.ts so
// the website and the app never disagree):
//   Earned      = actual_amount_received on completed shows marked "received".
//   On the books (Potential)
//               = agreed_amount (else fee) on confirmed shows dated today or later.
//   Still owed  = shows dated before today, confirmed or completed, not marked
//                 "received": the agreed amount less anything already recorded.
//   Net         = Earned − expenses dated in the year.
//
// Reports for the accountant (Income & expenses, Tax summary) count income as
// money actually received in the date range — never money only promised.

export interface FinancialBooking {
  id: string;
  show_date: string | null;
  status: string;
  fee: number | string | null;
  agreed_amount: number | string | null;
  actual_amount_received: number | string | null;
  payment_status: string | null;
  venue: { name: string | null; city: string | null; state: string | null } | null;
}

export interface FinancialExpense {
  id: string;
  expense_date: string;
  category: string;
  amount: number | string;
  notes?: string | null;
  tour_id?: string | null;
  booking_id?: string | null;
  personnel_id?: string | null;
}

/** Category used by the show Lineup for paying band members (has a named payee). */
export const BAND_PAY = 'band_pay';
/** Older free-form category for band pay entered without a payee. */
export const BAND_MEMBER_PAYMENTS = 'Band Member Payments';
/** Federal 1099-NEC reporting threshold for payments to one contractor in a year. */
export const NEC_THRESHOLD = 600;

/** Categories offered when adding an expense by hand. */
export const EXPENSE_CATEGORIES = ['Gas / Mileage', 'Hotel / Lodging', BAND_MEMBER_PAYMENTS, 'Food / Meals', 'Equipment', 'Other'] as const;

/** Display name for a stored category. */
export function categoryLabel(category: string): string {
  return category === BAND_PAY ? 'Band pay (lineup)' : category;
}

/** A number from a DB value, or null when empty / not a number. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Rounds to cents so float sums don't print as $1,234.0000001. */
export function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ShowMoneyState = 'paid' | 'owed' | 'upcoming' | 'other';

export interface ShowMoney {
  id: string;
  date: string;
  status: string;
  venue: string;
  place: string;
  /** agreed_amount, else fee; null when neither is set. */
  contracted: number | null;
  /** actual_amount_received as recorded (may be partial on an owed show). */
  received: number | null;
  /** Still to collect on an owed show; 0 otherwise. */
  owed: number;
  state: ShowMoneyState;
}

/**
 * Where one show stands, money-wise.
 *
 * @param today local date YYYY-MM-DD
 */
export function showMoney(b: FinancialBooking, today: string): ShowMoney | null {
  if (!b.show_date) return null;
  if (b.status !== 'confirmed' && b.status !== 'completed') return null;
  const contracted = num(b.agreed_amount) ?? num(b.fee);
  const received = num(b.actual_amount_received);
  const paid = b.payment_status === 'received';
  let state: ShowMoneyState = 'other';
  if (b.status === 'completed' && paid) state = 'paid';
  else if (!paid && b.show_date < today) state = 'owed';
  else if (b.status === 'confirmed' && b.show_date >= today) state = 'upcoming';
  const owed = state === 'owed' ? Math.max(0, cents((contracted ?? 0) - (received ?? 0))) : 0;
  return {
    id: b.id,
    date: b.show_date,
    status: b.status,
    venue: b.venue?.name || 'Venue TBA',
    place: [b.venue?.city, b.venue?.state].filter(Boolean).join(', '),
    contracted,
    received,
    owed,
    state,
  };
}

const sum = <T,>(rows: readonly T[], pick: (r: T) => number) => cents(rows.reduce((t, r) => t + pick(r), 0));

/** Sum of expense amounts, ignoring anything that isn't a number. */
export function sumExpenses(rows: readonly Pick<FinancialExpense, 'amount'>[]): number {
  return sum(rows, e => num(e.amount) ?? 0);
}

export interface MonthMoney {
  /** 0–11 */
  month: number;
  shows: number;
  earned: number;
  /** On the books: confirmed shows still to play that month. */
  booked: number;
  owed: number;
  expenses: number;
  /** earned − expenses */
  net: number;
}

export interface VenueMoney {
  key: string;
  name: string;
  place: string;
  shows: number;
  contracted: number;
  earned: number;
  owed: number;
}

export interface YearMoney {
  year: number;
  shows: ShowMoney[];
  showCount: number;
  earned: number;
  paidCount: number;
  /** Paid shows with no amount recorded — they add $0 to Earned until fixed. */
  paidMissingAmount: ShowMoney[];
  potential: number;
  upcomingCount: number;
  outstanding: number;
  owedShows: ShowMoney[];
  expenses: number;
  net: number;
  months: MonthMoney[];
  venues: VenueMoney[];
  /** Expense totals by category for the year, largest first. */
  categories: Array<{ category: string; total: number; count: number }>;
}

/**
 * The selected year's money: headline figures, a month-by-month breakdown,
 * venues and expense categories.
 *
 * @param today local date YYYY-MM-DD
 */
export function summarizeYear(
  year: number,
  bookings: readonly FinancialBooking[],
  expenses: readonly FinancialExpense[],
  today: string,
): YearMoney {
  const prefix = `${year}-`;
  const shows = bookings
    .filter(b => b.show_date?.startsWith(prefix))
    .map(b => showMoney(b, today))
    .filter((s): s is ShowMoney => s !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const yearExpenses = expenses.filter(e => typeof e.expense_date === 'string' && e.expense_date.startsWith(prefix));

  const paid = shows.filter(s => s.state === 'paid');
  const upcoming = shows.filter(s => s.state === 'upcoming');
  const owedShows = shows.filter(s => s.state === 'owed');
  const earned = sum(paid, s => s.received ?? 0);
  const expenseTotal = sumExpenses(yearExpenses);

  const months: MonthMoney[] = Array.from({ length: 12 }, (_, month) => {
    const mm = `${prefix}${String(month + 1).padStart(2, '0')}-`;
    const inMonth = shows.filter(s => s.date.startsWith(mm));
    const e = sumExpenses(yearExpenses.filter(x => x.expense_date.startsWith(mm)));
    const monthEarned = sum(inMonth.filter(s => s.state === 'paid'), s => s.received ?? 0);
    return {
      month,
      shows: inMonth.length,
      earned: monthEarned,
      booked: sum(inMonth.filter(s => s.state === 'upcoming'), s => s.contracted ?? 0),
      owed: sum(inMonth, s => s.owed),
      expenses: e,
      net: cents(monthEarned - e),
    };
  });

  const venueMap = new Map<string, VenueMoney>();
  for (const s of shows) {
    const key = `${s.venue}|${s.place}`;
    const row = venueMap.get(key) ?? { key, name: s.venue, place: s.place, shows: 0, contracted: 0, earned: 0, owed: 0 };
    row.shows += 1;
    row.contracted = cents(row.contracted + (s.contracted ?? 0));
    if (s.state === 'paid') row.earned = cents(row.earned + (s.received ?? 0));
    row.owed = cents(row.owed + s.owed);
    venueMap.set(key, row);
  }
  const venues = [...venueMap.values()].sort((a, b) => b.earned - a.earned || b.contracted - a.contracted || a.name.localeCompare(b.name));

  const catMap = new Map<string, { category: string; total: number; count: number }>();
  for (const e of yearExpenses) {
    const row = catMap.get(e.category) ?? { category: e.category, total: 0, count: 0 };
    row.total = cents(row.total + (num(e.amount) ?? 0));
    row.count += 1;
    catMap.set(e.category, row);
  }
  const categories = [...catMap.values()].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));

  return {
    year,
    shows,
    showCount: shows.length,
    earned,
    paidCount: paid.length,
    paidMissingAmount: paid.filter(s => s.received === null),
    potential: sum(upcoming, s => s.contracted ?? 0),
    upcomingCount: upcoming.length,
    outstanding: sum(owedShows, s => s.owed),
    owedShows,
    expenses: expenseTotal,
    net: cents(earned - expenseTotal),
    months,
    venues,
    categories,
  };
}

export interface Payee {
  key: string;
  name: string;
  total: number;
  /** At or above the federal 1099-NEC threshold. */
  needs1099: boolean;
}

export interface RangeReport {
  start: string;
  end: string;
  /** Shows paid in the range (the income). */
  paidShows: ShowMoney[];
  income: number;
  /** Played shows in the range not yet paid — listed, never counted as income. */
  owedShows: ShowMoney[];
  owed: number;
  /** Business expenses by category (everything except lineup band pay). */
  expenseLines: Array<[string, number]>;
  businessExpenses: number;
  /** Lineup band pay (category band_pay), paid to named contractors. */
  contractorPay: number;
  payees: Payee[];
  /** "Band Member Payments" entered by hand, with no named payee. */
  unassignedBandPay: number;
  totalExpenses: number;
  net: number;
}

/**
 * The accountant reports for a date range (inclusive, YYYY-MM-DD).
 *
 * Income is money received: actual_amount_received on shows that are
 * completed and marked received, dated in the range. Promised money on future
 * or unpaid shows is not income and is listed separately.
 *
 * @param personnel names for the payee rollup
 * @param today local date YYYY-MM-DD
 */
export function rangeReport(
  start: string,
  end: string,
  bookings: readonly FinancialBooking[],
  expenses: readonly FinancialExpense[],
  personnel: ReadonlyArray<{ id: string; name: string }>,
  today: string,
): RangeReport {
  const inRange = (d: string | null | undefined) => typeof d === 'string' && d >= start && d <= end;
  const shows = bookings
    .filter(b => inRange(b.show_date))
    .map(b => showMoney(b, today))
    .filter((s): s is ShowMoney => s !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const paidShows = shows.filter(s => s.state === 'paid');
  const owedShows = shows.filter(s => s.state === 'owed');
  const rangeExpenses = expenses.filter(e => inRange(e.expense_date));

  const byCat = new Map<string, number>();
  for (const e of rangeExpenses) {
    if (e.category === BAND_PAY) continue;
    byCat.set(e.category, cents((byCat.get(e.category) ?? 0) + (num(e.amount) ?? 0)));
  }
  const expenseLines = [...byCat.entries()].sort(([a], [b]) => a.localeCompare(b));
  const businessExpenses = sum(expenseLines, ([, v]) => v);

  const names = new Map(personnel.map(p => [p.id, p.name]));
  const payeeMap = new Map<string, Payee>();
  for (const e of rangeExpenses) {
    if (e.category !== BAND_PAY) continue;
    const key = e.personnel_id ?? '__unknown__';
    const row = payeeMap.get(key) ?? { key, name: (e.personnel_id && names.get(e.personnel_id)) || 'Unknown', total: 0, needs1099: false };
    row.total = cents(row.total + (num(e.amount) ?? 0));
    payeeMap.set(key, row);
  }
  const payees = [...payeeMap.values()]
    .map(p => ({ ...p, needs1099: p.total >= NEC_THRESHOLD }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const contractorPay = sum(payees, p => p.total);

  const income = sum(paidShows, s => s.received ?? 0);
  const totalExpenses = cents(businessExpenses + contractorPay);
  return {
    start,
    end,
    paidShows,
    income,
    owedShows,
    owed: sum(owedShows, s => s.owed),
    expenseLines,
    businessExpenses,
    contractorPay,
    payees,
    unassignedBandPay: sumExpenses(rangeExpenses.filter(e => e.category === BAND_MEMBER_PAYMENTS)),
    totalExpenses,
    net: cents(income - totalExpenses),
  };
}

/** The years to offer in the picker: every year with a show or expense, plus this year and next. */
export function availableYears(bookings: readonly FinancialBooking[], expenses: readonly FinancialExpense[], thisYear: number): number[] {
  const years = new Set<number>([thisYear, thisYear + 1]);
  for (const b of bookings) if (b.show_date) years.add(Number(b.show_date.slice(0, 4)));
  for (const e of expenses) if (e.expense_date) years.add(Number(e.expense_date.slice(0, 4)));
  return [...years].filter(y => Number.isInteger(y) && y > 1990 && y < 2200).sort((a, b) => b - a);
}

/** One CSV document from rows of cells; every cell quoted, quotes doubled. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

/** Today as YYYY-MM-DD in the viewer's local time zone (show dates are local dates). */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
