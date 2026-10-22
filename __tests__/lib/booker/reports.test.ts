// __tests__/lib/booker/reports.test.ts
// Reports (build list item 5): grouping a year's shows, venues that book back,
// talent buyers from offers, and spreadsheet-safe CSV.

import { bookBacks, buyerByShow, csvCell, reportRows, reportTotals, toCsv } from '../../../lib/booker/reports';
import { byId } from '../../../lib/booker/workspace';
import type { BookerShow, BookerVenue, RosterBand } from '../../../lib/booker/types';

const TODAY = '2026-10-21';
const ts = { created_at: '', updated_at: '', deleted_at: null };

const bands: Pick<RosterBand, 'id' | 'band_name' | 'commission_pct' | 'repeat_commission_pct'>[] = [
  { id: 'b1', band_name: 'The Jackwagons', commission_pct: 10, repeat_commission_pct: 5 },
  { id: 'b2', band_name: 'Prairie Fire', commission_pct: 20, repeat_commission_pct: null },
];

const venuesById = byId<BookerVenue>([
  { id: 'v1', booker_id: 'k', name: 'Gruene Hall', address: null, city: 'New Braunfels', state: 'TX', postal_code: null, capacity: null, website: null, notes: null, kind: 'venue', place_id: null, email: null, phone: null, last_scanned_at: null, tags: [], ...ts },
  { id: 'v2', booker_id: 'k', name: 'Cain’s Ballroom', address: null, city: 'Tulsa', state: 'OK', postal_code: null, capacity: null, website: null, notes: null, kind: 'venue', place_id: null, email: null, phone: null, last_scanned_at: null, tags: [], ...ts },
]);

type S = Parameters<typeof reportRows>[0]['shows'][number];
const show = (over: Partial<BookerShow>): S => ({
  id: 's',
  roster_id: 'b1',
  venue_id: 'v1',
  venue_name: null,
  venue_city: null,
  show_date: '2026-05-01',
  status: 'played',
  fee: 1000,
  actual_amount: null,
  commission_pct_override: null,
  deleted_at: null,
  ...over,
});

const shows: S[] = [
  show({ id: 'a', show_date: '2026-02-01', actual_amount: 1200 }),
  show({ id: 'b', show_date: '2026-06-01', roster_id: 'b2', venue_id: 'v2', fee: 2000 }),
  show({ id: 'c', show_date: '2026-11-15', status: 'confirmed', fee: 800 }),
  show({ id: 'd', show_date: '2026-07-01', venue_id: null, venue_name: 'Saxon Pub', venue_city: 'Austin', fee: 500 }),
  show({ id: 'hold', show_date: '2026-12-01', status: 'hold' }),
  show({ id: 'cxl', show_date: '2026-03-01', status: 'cancelled' }),
  show({ id: 'arc', show_date: '2026-03-02', deleted_at: '2026-03-03' }),
  show({ id: 'old-confirmed', show_date: '2026-10-01', status: 'confirmed' }),
  show({ id: 'last-year', show_date: '2025-08-01' }),
];

const rows = (group: Parameters<typeof reportRows>[0]['group'], extra: Partial<Parameters<typeof reportRows>[0]> = {}) =>
  reportRows({ shows, bands, venuesById, buyers: new Map(), group, year: 2026, today: TODAY, ...extra });

describe('reportRows', () => {
  it('groups by band with earned gross, commission and what is still to come', () => {
    expect(rows('band')).toEqual([
      { key: 'b2', label: 'Prairie Fire', played: 1, upcoming: 0, gross: 2000, upcomingGross: 0, commission: 400, projectedCommission: 0, lastPlayed: '2026-06-01' },
      { key: 'b1', label: 'The Jackwagons', played: 2, upcoming: 1, gross: 1700, upcomingGross: 800, commission: 170, projectedCommission: 80, lastPlayed: '2026-07-01' },
    ]);
  });

  it('leaves out holds, cancelled, archived, past-dated confirmed shows and other years', () => {
    const all = rows('band');
    expect(all.reduce((t, r) => t + r.played + r.upcoming, 0)).toBe(4);
    expect(reportRows({ shows, bands, venuesById, buyers: new Map(), group: 'band', year: 2025, today: TODAY })).toMatchObject([{ played: 1, gross: 1000 }]);
  });

  it('groups by venue and by town, saved and typed alike', () => {
    expect(rows('venue').map(r => r.label)).toEqual(['Cain’s Ballroom, Tulsa', 'Gruene Hall, New Braunfels', 'Saxon Pub, Austin']);
    expect(rows('city').map(r => r.label)).toEqual(['Tulsa, OK', 'New Braunfels, TX', 'Austin']);
  });

  it('groups by talent buyer, with a bucket for shows with none', () => {
    const buyers = new Map([
      ['a', 'Sarah Lee'],
      ['c', 'sarah lee'],
    ]);
    const out = rows('buyer', { buyers });
    expect(out.map(r => [r.label, r.played, r.upcoming])).toEqual([
      ['No buyer recorded', 2, 0],
      ['Sarah Lee', 1, 1],
    ]);
  });

  it('applies the repeat rate when given repeats', () => {
    const out = rows('band', { repeats: new Set(['d']) }).find(r => r.key === 'b1');
    expect(out?.commission).toBe(145);
  });

  it('adds up the totals line without floating-point drift', () => {
    const t = reportTotals([
      { key: 'x', label: 'x', played: 1, upcoming: 0, gross: 0.1, upcomingGross: 0, commission: 0.1, projectedCommission: 0, lastPlayed: null },
      { key: 'y', label: 'y', played: 2, upcoming: 3, gross: 0.2, upcomingGross: 0.3, commission: 0.2, projectedCommission: 0.3, lastPlayed: null },
    ]);
    expect(t).toEqual({ played: 3, upcoming: 3, gross: 0.3, upcomingGross: 0.3, commission: 0.3, projectedCommission: 0.3 });
  });
});

describe('bookBacks', () => {
  it('lists venues with two or more played shows across all years, with the next date there', () => {
    const out = bookBacks(
      [
        ...shows,
        show({ id: 'e', show_date: '2024-09-01', roster_id: 'b2', actual_amount: 900 }),
        show({ id: 'f', show_date: '2026-08-01', venue_id: null, venue_name: 'saxon pub', venue_city: 'Austin', fee: null }),
      ],
      venuesById,
      TODAY,
    );
    expect(out).toEqual([
      { key: 'id:v1', venueId: 'v1', label: 'Gruene Hall, New Braunfels', timesPlayed: 3, bands: 2, years: 3, firstPlayed: '2024-09-01', lastPlayed: '2026-02-01', averageGross: 1033.33, nextDate: '2026-11-15' },
      { key: 'name:saxon pub', venueId: null, label: 'Saxon Pub, Austin', timesPlayed: 2, bands: 1, years: 1, firstPlayed: '2026-07-01', lastPlayed: '2026-08-01', averageGross: 500, nextDate: null },
    ]);
  });

  it('is empty when nothing has been played twice', () => {
    expect(bookBacks([show({ id: 'one' })], venuesById, TODAY)).toEqual([]);
  });
});

describe('buyerByShow', () => {
  const o = (show_id: string, status: string, buyer_name: string | null, created_at: string, deleted_at: string | null = null) =>
    ({ show_id, status, buyer_name, created_at, deleted_at }) as Parameters<typeof buyerByShow>[0][number];

  it('prefers the accepted offer, then the latest sent one, and ignores drafts, withdrawn and archived', () => {
    const map = buyerByShow([
      o('s1', 'sent', 'Old Buyer', '2026-01-01'),
      o('s1', 'accepted', 'Sarah Lee', '2026-01-02'),
      o('s1', 'sent', 'Newer Sent', '2026-01-03'),
      o('s2', 'sent', 'First', '2026-01-01'),
      o('s2', 'declined', 'Second', '2026-01-05'),
      o('s3', 'draft', 'Draft Only', '2026-01-01'),
      o('s4', 'accepted', 'Archived', '2026-01-01', '2026-01-02'),
      o('s5', 'withdrawn', 'Gone', '2026-01-01'),
      o('s6', 'sent', '  ', '2026-01-01'),
    ]);
    expect(Object.fromEntries(map)).toEqual({ s1: 'Sarah Lee', s2: 'Second' });
  });
});

describe('CSV', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Cain’s, Tulsa')).toBe('"Cain’s, Tulsa"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12.5)).toBe('12.5');
  });

  it('defuses text a spreadsheet would run as a formula, but leaves numbers alone', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+1 555')).toBe("'+1 555");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-cmd')).toBe("'-cmd");
    expect(csvCell(-5)).toBe('-5');
  });

  it('builds a header and rows with CRLF line endings', () => {
    expect(toCsv(['Band', 'Gross'], [['A, B', '10.00'], ['C', null]])).toBe('Band,Gross\r\n"A, B",10.00\r\nC,');
  });
});
