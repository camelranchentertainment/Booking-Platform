import {
  availableYears, categoryLabel, rangeReport, showMoney, summarizeYear, toCsv,
  type FinancialBooking, type FinancialExpense,
} from '../../../lib/domain/financials';

const TODAY = '2026-06-15';

function b(over: Partial<FinancialBooking> & { id: string; show_date: string; status: string }): FinancialBooking {
  return {
    fee: null, agreed_amount: null, actual_amount_received: null, payment_status: null,
    venue: { name: 'The Hall', city: 'Austin', state: 'TX' },
    ...over,
  };
}
function e(over: Partial<FinancialExpense> & { id: string; expense_date: string; amount: number | string }): FinancialExpense {
  return { category: 'Other', ...over };
}

const BOOKINGS: FinancialBooking[] = [
  // paid
  b({ id: 'p1', show_date: '2026-02-10', status: 'completed', payment_status: 'received', agreed_amount: 800, actual_amount_received: 750 }),
  // played, not completed, not paid → owed (full agreed)
  b({ id: 'o1', show_date: '2026-03-05', status: 'confirmed', agreed_amount: 500 }),
  // completed but not received, partial recorded → owed the rest
  b({ id: 'o2', show_date: '2026-04-01', status: 'completed', agreed_amount: 600, actual_amount_received: 200, payment_status: 'partial' }),
  // today and later, confirmed → on the books (fee fallback)
  b({ id: 'u1', show_date: TODAY, status: 'confirmed', fee: 400 }),
  b({ id: 'u2', show_date: '2026-09-01', status: 'confirmed', agreed_amount: '1000' }),
  // paid but no amount
  b({ id: 'p2', show_date: '2026-01-20', status: 'completed', payment_status: 'received' }),
  // not counted: other statuses, other years, no date
  b({ id: 'x1', show_date: '2026-05-05', status: 'hold', agreed_amount: 999 }),
  b({ id: 'x2', show_date: '2025-12-31', status: 'completed', payment_status: 'received', actual_amount_received: 5000 }),
  { ...b({ id: 'x3', show_date: '2026-01-01', status: 'confirmed', agreed_amount: 50 }), show_date: null },
];

const EXPENSES: FinancialExpense[] = [
  e({ id: 'e1', expense_date: '2026-02-11', amount: 100, category: 'Gas / Mileage' }),
  e({ id: 'e2', expense_date: '2026-02-12', amount: '50.5', category: 'Food / Meals' }),
  e({ id: 'e3', expense_date: '2026-03-06', amount: 700, category: 'band_pay', personnel_id: 'm1' }),
  e({ id: 'e4', expense_date: '2026-03-07', amount: 300, category: 'band_pay', personnel_id: 'm2' }),
  e({ id: 'e5', expense_date: '2026-03-08', amount: 120, category: 'Band Member Payments' }),
  e({ id: 'e6', expense_date: '2025-11-01', amount: 9999, category: 'Other' }),
  e({ id: 'e7', expense_date: '2026-07-01', amount: 'oops', category: 'Other' }),
];

describe('showMoney', () => {
  it('classifies paid, owed, upcoming', () => {
    expect(showMoney(BOOKINGS[0], TODAY)?.state).toBe('paid');
    expect(showMoney(BOOKINGS[1], TODAY)).toMatchObject({ state: 'owed', owed: 500 });
    expect(showMoney(BOOKINGS[2], TODAY)).toMatchObject({ state: 'owed', owed: 400 });
    expect(showMoney(BOOKINGS[3], TODAY)).toMatchObject({ state: 'upcoming', contracted: 400, owed: 0 });
  });
  it('ignores holds and undated shows', () => {
    expect(showMoney(BOOKINGS[6], TODAY)).toBeNull();
    expect(showMoney(BOOKINGS[8], TODAY)).toBeNull();
  });
  it('never owes a negative amount when more was received than agreed', () => {
    const s = showMoney(b({ id: 'z', show_date: '2026-01-02', status: 'completed', agreed_amount: 100, actual_amount_received: 150 }), TODAY);
    expect(s?.owed).toBe(0);
  });
});

describe('summarizeYear', () => {
  const y = summarizeYear(2026, BOOKINGS, EXPENSES, TODAY);

  it('earned = received on completed shows marked received, in the year', () => {
    expect(y.earned).toBe(750);
    expect(y.paidCount).toBe(2);
    expect(y.paidMissingAmount.map(s => s.id)).toEqual(['p2']);
  });
  it('potential = agreed (else fee) on confirmed shows today or later', () => {
    expect(y.potential).toBe(1400);
    expect(y.upcomingCount).toBe(2);
  });
  it('outstanding = played shows not yet paid, less anything recorded', () => {
    expect(y.outstanding).toBe(900);
    expect(y.owedShows.map(s => s.id)).toEqual(['o1', 'o2']);
  });
  it('expenses and net are scoped to the year and skip non-numbers', () => {
    expect(y.expenses).toBe(1270.5);
    expect(y.net).toBe(-520.5);
  });
  it('counts only confirmed/completed dated shows', () => {
    expect(y.showCount).toBe(6);
  });
  it('builds 12 months', () => {
    expect(y.months).toHaveLength(12);
    expect(y.months[1]).toMatchObject({ shows: 1, earned: 750, expenses: 150.5, net: 599.5 });
    expect(y.months[2]).toMatchObject({ owed: 500, expenses: 1120 });
    expect(y.months[8]).toMatchObject({ booked: 1000 });
  });
  it('rolls up venues and categories', () => {
    expect(y.venues).toHaveLength(1);
    expect(y.venues[0]).toMatchObject({ shows: 6, earned: 750, owed: 900 });
    expect(y.categories[0]).toEqual({ category: 'band_pay', total: 1000, count: 2 });
  });
});

describe('rangeReport', () => {
  const people = [{ id: 'm1', name: 'Ada' }, { id: 'm2', name: 'Bo' }];
  const r = rangeReport('2026-01-01', '2026-12-31', BOOKINGS, EXPENSES, people, TODAY);

  it('counts only money received as income', () => {
    expect(r.income).toBe(750);
    expect(r.paidShows.map(s => s.id)).toEqual(['p2', 'p1']);
    expect(r.owed).toBe(900);
  });
  it('separates lineup band pay from business expenses', () => {
    expect(r.contractorPay).toBe(1000);
    expect(r.businessExpenses).toBe(270.5);
    expect(r.expenseLines.map(([c]) => c)).toEqual(['Band Member Payments', 'Food / Meals', 'Gas / Mileage', 'Other']);
    expect(r.unassignedBandPay).toBe(120);
    expect(r.totalExpenses).toBe(1270.5);
    expect(r.net).toBe(-520.5);
  });
  it('flags payees at or above $600 for a 1099-NEC', () => {
    expect(r.payees).toEqual([
      { key: 'm1', name: 'Ada', total: 700, needs1099: true },
      { key: 'm2', name: 'Bo', total: 300, needs1099: false },
    ]);
  });
  it('respects the range bounds', () => {
    const q1 = rangeReport('2026-01-01', '2026-03-05', BOOKINGS, EXPENSES, people, TODAY);
    expect(q1.owedShows.map(s => s.id)).toEqual(['o1']);
    expect(q1.contractorPay).toBe(0);
  });
});

describe('helpers', () => {
  it('availableYears includes data years plus this and next, newest first', () => {
    expect(availableYears(BOOKINGS, EXPENSES, 2026)).toEqual([2027, 2026, 2025]);
  });
  it('toCsv quotes every cell and doubles quotes', () => {
    expect(toCsv([['a', 1], ['say "hi"', '']])).toBe('"a","1"\n"say ""hi""",""');
  });
  it('labels lineup band pay', () => {
    expect(categoryLabel('band_pay')).toBe('Band pay (lineup)');
    expect(categoryLabel('Other')).toBe('Other');
  });
});
