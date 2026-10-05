import {
  isInYear,
  expensesForYear,
  sumExpenses,
  yearExpenseTotal,
  monthExpenseTotal,
} from '../../lib/financialSummary';

const multiYear = [
  { expense_date: '2025-04-18', amount: 250 },
  { expense_date: '2025-12-31', amount: 100 },
  { expense_date: '2026-01-01', amount: 100 },
  { expense_date: '2026-01-16', amount: '250' },
  { expense_date: '2026-09-29', amount: 100 },
];

describe('isInYear', () => {
  it('matches the calendar year prefix only', () => {
    expect(isInYear('2026-01-01', 2026)).toBe(true);
    expect(isInYear('2025-12-31', 2026)).toBe(false);
  });

  it('rejects null, undefined and empty values', () => {
    expect(isInYear(null, 2026)).toBe(false);
    expect(isInYear(undefined, 2026)).toBe(false);
    expect(isInYear('', 2026)).toBe(false);
  });
});

describe('expensesForYear / yearExpenseTotal', () => {
  it('excludes other years so net income is not skewed by history', () => {
    expect(expensesForYear(multiYear, 2026)).toHaveLength(3);
    expect(yearExpenseTotal(multiYear, 2026)).toBe(450);
    expect(yearExpenseTotal(multiYear, 2025)).toBe(350);
  });

  it('returns zero for a year with no expenses', () => {
    expect(yearExpenseTotal(multiYear, 2030)).toBe(0);
  });

  it('year totals add up to the all-years total', () => {
    const all = sumExpenses(multiYear);
    expect(yearExpenseTotal(multiYear, 2025) + yearExpenseTotal(multiYear, 2026)).toBe(all);
  });
});

describe('sumExpenses', () => {
  it('coerces numeric strings and ignores non-finite values', () => {
    expect(sumExpenses([{ expense_date: '2026-01-01', amount: '12.5' }, { expense_date: '2026-01-02', amount: 'abc' }])).toBe(12.5);
  });

  it('returns 0 for an empty list', () => {
    expect(sumExpenses([])).toBe(0);
  });
});

describe('monthExpenseTotal', () => {
  it('scopes to the month and year', () => {
    expect(monthExpenseTotal(multiYear, 2026, 0)).toBe(350); // January 2026
    expect(monthExpenseTotal(multiYear, 2025, 11)).toBe(100); // December 2025
    expect(monthExpenseTotal(multiYear, 2026, 5)).toBe(0);
  });

  it('does not bleed the same month across different years', () => {
    expect(monthExpenseTotal(multiYear, 2025, 0)).toBe(0);
  });
});
