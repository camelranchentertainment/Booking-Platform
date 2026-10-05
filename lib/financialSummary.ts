/**
 * Year-scoped expense helpers for the Financials page.
 *
 * Why this exists: the summary cards (Earned / Expenses / Net Income) are
 * year-scoped on the income side, so the expense side must be scoped to the
 * same year. Summing an unfiltered expense list produced a net-income figure
 * that mixed one year of income with every year of expenses.
 */

export interface ExpenseLike {
  expense_date: string;
  amount: number | string;
}

/** True when an ISO date string (YYYY-MM-DD) falls in the given calendar year. */
export function isInYear(isoDate: string | null | undefined, year: number): boolean {
  return typeof isoDate === 'string' && isoDate.startsWith(`${year}-`);
}

/** Returns only the expenses dated in the given calendar year. */
export function expensesForYear<T extends ExpenseLike>(expenses: readonly T[], year: number): T[] {
  return expenses.filter(e => isInYear(e.expense_date, year));
}

/** Sums expense amounts, coercing numeric strings and ignoring non-finite values. */
export function sumExpenses(expenses: readonly ExpenseLike[]): number {
  return expenses.reduce((total, e) => {
    const n = Number(e.amount);
    return Number.isFinite(n) ? total + n : total;
  }, 0);
}

/** Expense total for one calendar year. */
export function yearExpenseTotal(expenses: readonly ExpenseLike[], year: number): number {
  return sumExpenses(expensesForYear(expenses, year));
}

/** Expense total for one month (0-11) of one calendar year. */
export function monthExpenseTotal(expenses: readonly ExpenseLike[], year: number, monthIndex: number): number {
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}-`;
  return sumExpenses(expenses.filter(e => typeof e.expense_date === 'string' && e.expense_date.startsWith(prefix)));
}
