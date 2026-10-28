import { daysUntil, mapsUrl, monthGrid, rsvpCounts, runOfShow, whenLabel } from '../../../lib/domain/memberShows';

describe('runOfShow', () => {
  it('orders the day by clock time, skips blanks and keeps late ends last', () => {
    const steps = runOfShow({ door_time: '19:00:00', load_in_time: '17:00:00', set_time: '22:00', set_length_min: 90, end_time: '01:00:00', soundcheck_time: null });
    expect(steps.map(s => [s.label, s.time])).toEqual([
      ['Load-in', '5:00 PM'], ['Doors', '7:00 PM'], ['Set', '10:00 PM'], ['End', '1:00 AM'],
    ]);
    expect(steps.find(s => s.key === 'set')?.note).toBe('90 min');
  });
  it('returns nothing when no times are set', () => {
    expect(runOfShow({})).toEqual([]);
  });
});

describe('mapsUrl', () => {
  it('searches the address (or name) with city and state', () => {
    expect(mapsUrl({ name: 'Chrome', address: '13930 Mitchell Ct', city: 'Basehor', state: 'KS' }))
      .toBe('https://www.google.com/maps/search/?api=1&query=13930%20Mitchell%20Ct%2C%20Basehor%2C%20KS');
    expect(mapsUrl({ name: 'Chrome', city: 'Basehor' })).toContain('Chrome%2C%20Basehor');
    expect(mapsUrl(null)).toBeNull();
    expect(mapsUrl({})).toBeNull();
  });
});

describe('daysUntil / whenLabel', () => {
  it('counts calendar days and words them', () => {
    expect(daysUntil('2026-11-07', '2026-10-28')).toBe(10);
    expect(whenLabel('2026-10-28', '2026-10-28')).toBe('Tonight');
    expect(whenLabel('2026-10-29', '2026-10-28')).toBe('Tomorrow');
    expect(whenLabel('2026-11-07', '2026-10-28')).toBe('In 10 days');
    expect(whenLabel('2026-12-01', '2026-10-28')).toBe('In 5 weeks');
    expect(whenLabel('2027-03-01', '2026-10-28')).toBe('In 4 months');
  });
});

describe('rsvpCounts', () => {
  it('counts only spots dated today or later', () => {
    expect(rsvpCounts([
      { status: 'pending', show_date: '2026-11-01' },
      { status: 'confirmed', show_date: '2026-10-28' },
      { status: 'declined', show_date: '2026-12-01' },
      { status: 'weird', show_date: '2026-12-02' },
      { status: 'confirmed', show_date: '2026-10-01' },
      { status: 'pending', show_date: null },
    ], '2026-10-28')).toEqual({ pending: 2, confirmed: 1, declined: 1 });
  });
});

describe('monthGrid', () => {
  it('pads to whole weeks starting Sunday', () => {
    const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(g.length % 7).toBe(0);
    expect(g.slice(0, 4).every(c => c.date === null)).toBe(true);
    expect(g[4]).toEqual({ date: '2026-10-01', day: 1 });
    expect(g.filter(c => c.date).length).toBe(31);
  });
});
