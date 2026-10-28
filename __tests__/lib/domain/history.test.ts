import {
  EMPTY_FILTER, STATE_TILES, bestRooms, filterHistory, groupByYear, historyCsvRows, historyStats,
  needsSettle, paidAmount, showsByState, toCsv, wouldReturn, type HistoryShow,
} from '../../../lib/domain/history';

const v = (id: string, name: string, city: string, state: string) => ({ id, name, city, state });
const TACO = v('v1', 'Tipsy Taco', "Lee's Summit", 'MO');
const GEORGE = v('v2', "George's", 'Fayetteville', 'AR');
const CHROME = v('v3', 'Chrome', 'Basehor', 'ks');

const LIST: HistoryShow[] = [
  { id: 'a', show_date: '2026-10-10', status: 'confirmed', venue: TACO, rebook_flag: 'yes' },
  { id: 'b', show_date: '2026-09-12', status: 'completed', venue: GEORGE, rating: 5, would_return: true, actual_amount_received: 900, payment_status: 'received' },
  { id: 'c', show_date: '2026-03-01', status: 'completed', venue: GEORGE, rating: 4, would_return: false, rebook_flag: 'yes', actual_amount_received: 700, payment_status: 'received' },
  { id: 'd', show_date: '2025-08-01', status: 'completed', venue: CHROME, rating: 3, actual_amount_received: 500, payment_status: 'partial' },
  { id: 'e', show_date: '2024-05-05', status: 'completed', venue: TACO, rebook_flag: 'no', attendance: 120 },
];

describe('wouldReturn / needsSettle / paidAmount', () => {
  it('would_return wins over the rebook flag', () => {
    expect(wouldReturn(LIST[2])).toBe(false);
    expect(wouldReturn(LIST[0])).toBe(true);
    expect(wouldReturn(LIST[3])).toBeNull();
  });
  it('anything not completed needs settling', () => {
    expect(needsSettle(LIST[0])).toBe(true);
    expect(needsSettle(LIST[1])).toBe(false);
  });
  it('pay counts only completed + received with an amount', () => {
    expect(paidAmount(LIST[1])).toBe(900);
    expect(paidAmount(LIST[3])).toBeNull();
    expect(paidAmount(LIST[4])).toBeNull();
  });
});

describe('filterHistory', () => {
  const ids = (f: Partial<typeof EMPTY_FILTER>) => filterHistory(LIST, { ...EMPTY_FILTER, ...f }).map(b => b.id);
  it('filters by search, year, state (case-insensitive), rating and would-return', () => {
    expect(ids({ query: 'fayette' })).toEqual(['b', 'c']);
    expect(ids({ year: '2026' })).toEqual(['a', 'b', 'c']);
    expect(ids({ state: 'KS' })).toEqual(['d']);
    expect(ids({ minRating: 4 })).toEqual(['b', 'c']);
    expect(ids({ returns: 'yes' })).toEqual(['a', 'b']);
    expect(ids({ returns: 'no' })).toEqual(['c', 'e']);
  });
});

describe('historyStats', () => {
  it('counts shows, venues, states and averages', () => {
    expect(historyStats(LIST)).toEqual({
      shows: 5, venues: 3, states: 3, avgRating: 4, rated: 3, returnPct: 50, answered: 4, needsSettle: 1, firstYear: 2024,
    });
  });
  it('returns nulls for an empty list', () => {
    expect(historyStats([])).toMatchObject({ shows: 0, avgRating: null, returnPct: null, firstYear: null });
  });
});

describe('bestRooms', () => {
  it('ranks rated/answered rooms first and averages only paid shows', () => {
    const rooms = bestRooms(LIST);
    expect(rooms.map(r => r.id)).toEqual(['v2', 'v3', 'v1']);
    expect(rooms[0]).toMatchObject({ shows: 2, avgRating: 4.5, returns: 1, answered: 2, avgPay: 800 });
    expect(rooms[1]).toMatchObject({ avgRating: 3, avgPay: null });
    expect(rooms[2]).toMatchObject({ avgRating: null, returns: 1, answered: 2 });
  });
});

describe('showsByState / groupByYear', () => {
  it('counts per upper-case state', () => {
    expect(Object.fromEntries(showsByState(LIST))).toEqual({ MO: 2, AR: 2, KS: 1 });
  });
  it('groups by year in order', () => {
    expect(groupByYear(LIST).map(g => [g.year, g.items.length])).toEqual([['2026', 3], ['2025', 1], ['2024', 1]]);
  });
});

describe('STATE_TILES', () => {
  it('has all 50 states + DC on distinct tiles inside 12 × 8', () => {
    const entries = Object.entries(STATE_TILES);
    expect(entries).toHaveLength(51);
    expect(new Set(entries.map(([, p]) => p.join(','))).size).toBe(51);
    for (const [, [c, r]] of entries) { expect(c).toBeLessThan(12); expect(r).toBeLessThan(8); }
  });
});

describe('historyCsvRows', () => {
  it('leaves money out for members', () => {
    const rows = historyCsvRows(LIST.slice(1, 2), false);
    expect(rows[0]).not.toContain('Received');
    expect(rows[1]).toEqual(['2026-09-12', "George's", 'Fayetteville', 'AR', 'completed', 5, '', 'Yes', '']);
  });
  it('includes money for admins and quotes safely', () => {
    const rows = historyCsvRows([{ ...LIST[1], post_show_notes: 'Great, "loud" crowd' }], true);
    expect(rows[0]).toContain('Received');
    expect(toCsv(rows).split('\n')[1]).toContain('"Great, ""loud"" crowd"');
  });
});
