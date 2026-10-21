// __tests__/lib/memberPay.test.ts
import { buildPayStatement, payYears, type MemberShowRow } from '../../lib/memberPay';

function row(overrides: Partial<MemberShowRow> & { id: string; show_date: string | null }): MemberShowRow {
  return {
    status: 'confirmed',
    booking_status: 'confirmed',
    venue: { name: 'The Rusty Spur Saloon', city: 'Tulsa', state: 'OK' },
    pay: { amount: 200, source: 'confirmed' },
    ...overrides,
  };
}

const TODAY = '2026-10-21';

describe('buildPayStatement', () => {
  it('splits played and upcoming pay around today and totals both', () => {
    const s = buildPayStatement(
      [
        row({ id: 'a', show_date: '2026-10-03', booking_status: 'completed' }),
        row({ id: 'b', show_date: '2026-10-21', pay: { amount: 225, source: 'confirmed' } }),
        row({ id: 'c', show_date: '2026-11-14', pay: { amount: 150, source: 'estimated' } }),
      ],
      2026,
      TODAY,
    );
    expect(s.played).toBe(200);
    expect(s.upcoming).toBe(375); // today counts as upcoming
    expect(s.playedCount).toBe(1);
    expect(s.upcomingCount).toBe(2);
    expect(s.estimatedCount).toBe(1);
    expect(s.months.map((m) => m.month)).toEqual([9, 10]);
    expect(s.months[0]).toMatchObject({ played: 200, upcoming: 225 });
  });

  it('leaves out declined, cancelled and undated shows', () => {
    const s = buildPayStatement(
      [
        row({ id: 'a', show_date: '2026-03-01', status: 'declined' }),
        row({ id: 'b', show_date: '2026-03-02', booking_status: 'cancelled' }),
        row({ id: 'c', show_date: null }),
        row({ id: 'd', show_date: '2026-03-03' }),
      ],
      2026,
      TODAY,
    );
    expect(s.months).toHaveLength(1);
    expect(s.months[0].lines.map((l) => l.id)).toEqual(['d']);
  });

  it('only includes the requested year', () => {
    const s = buildPayStatement(
      [row({ id: 'a', show_date: '2025-12-31' }), row({ id: 'b', show_date: '2026-01-01' })],
      2026,
      TODAY,
    );
    expect(s.months.flatMap((m) => m.lines.map((l) => l.id))).toEqual(['b']);
  });

  it('lists shows with no pay but keeps them out of the totals', () => {
    const s = buildPayStatement([row({ id: 'a', show_date: '2026-02-02', pay: null })], 2026, TODAY);
    expect(s.months[0].lines[0].amount).toBeNull();
    expect(s.played).toBe(0);
    expect(s.unpricedCount).toBe(1);
  });

  it('sums money to the cent without float drift', () => {
    const s = buildPayStatement(
      [
        row({ id: 'a', show_date: '2026-01-01', pay: { amount: 0.1, source: 'confirmed' } }),
        row({ id: 'b', show_date: '2026-01-02', pay: { amount: 0.2, source: 'confirmed' } }),
      ],
      2026,
      TODAY,
    );
    expect(s.played).toBe(0.3);
  });

  it('sorts lines by date and fills venue fallbacks', () => {
    const s = buildPayStatement(
      [
        row({ id: 'late', show_date: '2026-05-20' }),
        row({ id: 'early', show_date: '2026-05-02', venue: null }),
      ],
      2026,
      TODAY,
    );
    expect(s.months[0].lines.map((l) => l.id)).toEqual(['early', 'late']);
    expect(s.months[0].lines[0]).toMatchObject({ venue: 'Venue TBA', place: '' });
  });
});

describe('payYears', () => {
  it('lists years with shows, newest first, always including the current year', () => {
    const years = payYears(
      [
        row({ id: 'a', show_date: '2024-06-01' }),
        row({ id: 'b', show_date: '2025-06-01', status: 'declined' }),
      ],
      2026,
    );
    expect(years).toEqual([2026, 2024]);
  });
});
