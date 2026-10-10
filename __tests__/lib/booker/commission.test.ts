// __tests__/lib/booker/commission.test.ts
import {
  commissionDue,
  commissionProjected,
  commissionTotals,
  effectiveRate,
  formatMoney,
  paidForShow,
  toAmount,
} from '../../../lib/booker/commission';
import type { BookerShow } from '../../../lib/booker/types';

const show = (over: Partial<BookerShow> = {}) => ({
  id: 's1',
  roster_id: 'b1',
  status: 'played' as BookerShow['status'],
  show_date: '2026-10-24',
  fee: 600,
  actual_amount: null,
  commission_pct_override: null,
  deleted_at: null,
  ...over,
});

describe('toAmount', () => {
  it('reads numbers and numeric strings, rejects junk', () => {
    expect(toAmount(12.5)).toBe(12.5);
    expect(toAmount('12.50')).toBe(12.5);
    expect(toAmount(null)).toBeNull();
    expect(toAmount('')).toBeNull();
    expect(toAmount('abc')).toBeNull();
  });
});

describe('effectiveRate', () => {
  it('prefers the show override, then the band rate', () => {
    expect(effectiveRate({ commission_pct_override: 5 }, { commission_pct: 15 })).toBe(5);
    expect(effectiveRate({ commission_pct_override: null }, { commission_pct: 15 })).toBe(15);
    expect(effectiveRate({ commission_pct_override: null }, null)).toBeNull();
  });

  it('treats a 0% override as a real rate, not "unset"', () => {
    expect(effectiveRate({ commission_pct_override: 0 }, { commission_pct: 15 })).toBe(0);
  });
});

describe('commissionDue', () => {
  it('uses the fee on a played show with no amount received', () => {
    expect(commissionDue(show(), { commission_pct: 15 })).toBe(90);
  });

  it('uses the amount actually received when entered', () => {
    expect(commissionDue(show({ actual_amount: 450 }), { commission_pct: 10 })).toBe(45);
  });

  it('is zero for every status except played', () => {
    for (const status of ['hold', 'pending', 'confirmed', 'cancelled'] as const) {
      expect(commissionDue(show({ status }), { commission_pct: 15 })).toBe(0);
    }
  });

  it('is zero when no rate is set', () => {
    expect(commissionDue(show(), { commission_pct: null })).toBe(0);
  });

  it('rounds to cents', () => {
    expect(commissionDue(show({ fee: 333.33 }), { commission_pct: 15 })).toBe(50);
    expect(commissionDue(show({ fee: 101 }), { commission_pct: 12.5 })).toBe(12.63);
  });
});

describe('commissionProjected', () => {
  const today = '2026-10-20';
  it('projects on confirmed future shows only', () => {
    expect(commissionProjected(show({ status: 'confirmed' }), { commission_pct: 10 }, today)).toBe(60);
    expect(commissionProjected(show({ status: 'confirmed', show_date: today }), { commission_pct: 10 }, today)).toBe(60);
    expect(commissionProjected(show({ status: 'played' }), { commission_pct: 10 }, today)).toBe(0);
    expect(commissionProjected(show({ status: 'hold' }), { commission_pct: 10 }, today)).toBe(0);
  });

  it('does not project a confirmed show whose date has passed', () => {
    expect(commissionProjected(show({ status: 'confirmed', show_date: '2026-10-02' }), { commission_pct: 10 }, today)).toBe(0);
  });
});

describe('paidForShow', () => {
  it('sums active payments for that show only, without float drift', () => {
    const payments = [
      { show_id: 's1', amount: 0.1, deleted_at: null },
      { show_id: 's1', amount: 0.2, deleted_at: null },
      { show_id: 's1', amount: 50, deleted_at: '2026-10-01T00:00:00Z' },
      { show_id: 's2', amount: 99, deleted_at: null },
    ];
    expect(paidForShow('s1', payments)).toBe(0.3);
  });
});

describe('commissionTotals', () => {
  it('totals due, paid, outstanding and projected', () => {
    const bands = new Map([['b1', { commission_pct: 10 }]]);
    const shows = [
      show({ id: 'a', fee: 1000 }), // due 100
      show({ id: 'b', fee: 500 }), // due 50, overpaid
      show({ id: 'c', status: 'confirmed', fee: 800 }), // projected 80
      show({ id: 'e', status: 'confirmed', fee: 700, show_date: '2026-01-01' }), // past confirmed: not projected
      show({ id: 'd', fee: 9999, deleted_at: '2026-01-01T00:00:00Z' }), // archived, ignored
    ];
    const payments = [
      { show_id: 'a', amount: 40, deleted_at: null },
      { show_id: 'b', amount: 70, deleted_at: null },
    ];
    expect(commissionTotals(shows, bands, payments, '2026-10-20')).toEqual({
      due: 150,
      paid: 110,
      // An overpayment on b does not hide the 60 still owed on a.
      outstanding: 60,
      projected: 80,
    });
  });
});

describe('formatMoney', () => {
  it('formats dollars and handles missing values', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(formatMoney(null)).toBe('—');
  });
});
