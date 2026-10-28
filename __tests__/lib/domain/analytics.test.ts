import { buildFunnel, emailByWeek, pct, showsByMonth, showsByState, topVenues, type AnalyticsBooking, type AnalyticsTourVenue } from '../../../lib/domain/analytics';

const tv = (id: string, status: string, extra: Partial<AnalyticsTourVenue> = {}): AnalyticsTourVenue => ({
  id, status, tour_id: 't1', venue_id: `v-${id}`, pitched_at: null, last_contacted_at: null, ...extra,
});

describe('pct', () => {
  it('rounds and guards a zero denominator', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
  });
});

describe('buildFunnel', () => {
  it('is nested, so step rates are never negative or over 100% (the old page showed -540%)', () => {
    // Jake's real mix on Oct 27: 5 targets, 32 follow-ups, 2 declined.
    const targets = [
      ...Array.from({ length: 5 }, (_, i) => tv(`t${i}`, 'target')),
      ...Array.from({ length: 32 }, (_, i) => tv(`f${i}`, 'follow_up', { pitched_at: '2026-10-01T00:00:00Z' })),
      tv('d1', 'declined', { pitched_at: '2026-10-01T00:00:00Z' }),
      tv('d2', 'declined', { pitched_at: '2026-10-01T00:00:00Z' }),
    ];
    const replied = new Set(['v-f0', 'v-f1', 'v-f2']);
    const steps = buildFunnel(targets, replied, []);
    expect(steps.map(s => s.count)).toEqual([39, 34, 3, 0]);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].count).toBeLessThanOrEqual(steps[i - 1].count);
      expect(steps[i].ofPrevious).toBeGreaterThanOrEqual(0);
      expect(steps[i].ofPrevious).toBeLessThanOrEqual(100);
    }
    expect(steps[1].ofPrevious).toBe(87);
  });

  it('counts a target booked through a show at that venue on that tour', () => {
    const targets = [tv('a', 'follow_up', { last_contacted_at: '2026-10-01T00:00:00Z' }), tv('b', 'target')];
    const bookings: AnalyticsBooking[] = [
      { show_date: '2026-11-01', status: 'confirmed', venue_id: 'v-a', tour_id: 't1' },
      { show_date: '2026-11-02', status: 'cancelled', venue_id: 'v-b', tour_id: 't1' },
    ];
    const steps = buildFunnel(targets, new Set(), bookings);
    expect(steps.find(s => s.key === 'booked')!.count).toBe(1);
    // booked implies pitched and wrote back, keeping the funnel nested
    expect(steps.find(s => s.key === 'replied')!.count).toBe(1);
  });

  it('treats a target whose status says confirmed as booked even without a show row', () => {
    const steps = buildFunnel([tv('a', 'confirmed')], new Set(), []);
    expect(steps.map(s => s.count)).toEqual([1, 1, 1, 1]);
  });

  it('handles an empty pipeline', () => {
    expect(buildFunnel([], new Set(), []).map(s => [s.count, s.ofTotal])).toEqual([[0, 0], [0, 0], [0, 0], [0, 0]]);
  });
});

describe('showsByMonth', () => {
  const bookings: AnalyticsBooking[] = [
    { show_date: '2026-03-07', status: 'completed', actual_amount_received: 400, agreed_amount: 450 },
    { show_date: '2026-03-21', status: 'completed', actual_amount_received: null },
    { show_date: '2026-11-14', status: 'confirmed', agreed_amount: 800 },
    { show_date: '2026-11-15', status: 'hold' },
    { show_date: '2026-12-01', status: 'cancelled' },
    { show_date: '2025-03-01', status: 'completed', actual_amount_received: 999 },
    { show_date: null, status: 'confirmed' },
  ];
  it('splits played and upcoming per month and counts only money received on played shows', () => {
    const m = showsByMonth(bookings, 2026);
    expect(m).toHaveLength(12);
    expect(m[2]).toEqual({ month: 2, played: 2, upcoming: 0, earned: 400 });
    expect(m[10]).toEqual({ month: 10, played: 0, upcoming: 1, earned: 0 });
    expect(m[11].played + m[11].upcoming).toBe(0); // cancelled ignored
  });
});

describe('emailByWeek', () => {
  it('buckets sent and received into Monday-based weeks, oldest first', () => {
    const now = new Date('2026-10-28T12:00:00Z'); // Wednesday
    const weeks = emailByWeek([
      { sent_at: '2026-10-27T23:31:00Z', direction: 'sent' },
      { sent_at: '2026-10-26T01:00:00Z', direction: 'received' },
      { sent_at: '2026-10-25T23:00:00Z', direction: 'sent' }, // Sunday → previous week
      { sent_at: '2026-01-01T00:00:00Z', direction: 'sent' }, // too old
      { sent_at: null, direction: 'sent' },
    ], now, 12);
    expect(weeks).toHaveLength(12);
    expect(weeks[11]).toEqual({ weekStart: '2026-10-26', sent: 1, received: 1 });
    expect(weeks[10]).toEqual({ weekStart: '2026-10-19', sent: 1, received: 0 });
    expect(weeks[0].weekStart).toBe('2026-08-10');
  });
});

describe('showsByState / topVenues', () => {
  const v = (id: string, name: string, state: string) => ({ venue_id: id, venue: { name, city: 'Town', state } });
  const bookings: AnalyticsBooking[] = [
    { show_date: '2026-02-01', status: 'completed', actual_amount_received: 500, ...v('v1', 'Tipsy Taco', 'mo') },
    { show_date: '2026-03-01', status: 'completed', actual_amount_received: 700, ...v('v1', 'Tipsy Taco', 'MO') },
    { show_date: '2026-04-01', status: 'completed', actual_amount_received: 900, ...v('v2', 'Chrome', 'KS') },
    { show_date: '2026-12-01', status: 'confirmed', agreed_amount: 5000, ...v('v3', 'Big Room', 'TX') },
    { show_date: '2026-05-01', status: 'cancelled', actual_amount_received: 100, ...v('v4', 'Gone', 'OK') },
  ];

  it('groups booked shows by state with earned from played shows only', () => {
    expect(showsByState(bookings, 2026)).toEqual([
      { state: 'MO', shows: 2, earned: 1200 },
      { state: 'KS', shows: 1, earned: 900 },
      { state: 'TX', shows: 1, earned: 0 },
    ]);
  });

  it('ranks venues by money received on played shows; future agreed amounts never count', () => {
    const top = topVenues(bookings, 2026, 5);
    expect(top.map(t => [t.name, t.earned, t.shows])).toEqual([['Tipsy Taco', 1200, 2], ['Chrome', 900, 1]]);
    expect(top[0].where).toBe('Town, mo');
  });
});
