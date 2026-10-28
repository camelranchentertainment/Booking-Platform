import {
  dealAmount, filterBookings, groupByMonth, isPast, needsSettling, nextShow, stageCounts, type ListBooking,
} from '../../../lib/domain/bookingsList';

const TODAY = '2026-10-28';
const bk = (id: string, show_date: string | null, status: string, extra: Partial<ListBooking> = {}): ListBooking =>
  ({ id, show_date, status, venue: { name: `Venue ${id}`, city: 'Austin', state: 'TX' }, ...extra });

const LIST: ListBooking[] = [
  bk('a', '2026-11-07', 'confirmed', { agreed_amount: 800, tour: { name: 'Winter Run' } }),
  bk('b', '2026-10-28', 'advancing'),
  bk('c', '2026-12-01', 'pitch'),
  bk('d', null, 'hold'),
  bk('e', '2026-10-10', 'confirmed'), // played, never settled
  bk('f', '2026-09-12', 'completed'),
  bk('g', '2026-08-01', 'pitch'), // old pitch, date passed
  bk('h', '2026-11-20', 'cancelled'),
  bk('i', '2026-11-02', 'contract', { venue: { name: "George's Majestic", city: 'Fayetteville', state: 'AR' } }),
];

describe('isPast / needsSettling', () => {
  it('treats today as not past and undated as never past', () => {
    expect(isPast(LIST[1], TODAY)).toBe(false);
    expect(isPast(LIST[3], TODAY)).toBe(false);
    expect(isPast(LIST[4], TODAY)).toBe(true);
  });
  it('flags only booked shows whose date has passed', () => {
    expect(needsSettling(LIST[4], TODAY)).toBe(true);
    expect(needsSettling(LIST[5], TODAY)).toBe(false);
    expect(needsSettling(LIST[6], TODAY)).toBe(false);
  });
});

describe('filterBookings', () => {
  const ids = (tab: 'upcoming' | 'past' | 'all', extra: object = {}) =>
    filterBookings(LIST, { tab, status: null, query: '', ...extra }, TODAY).map(b => b.id);

  it('upcoming: today onward, unsettled past shows, undated last; never cancelled', () => {
    expect(ids('upcoming')).toEqual(['e', 'b', 'i', 'a', 'c', 'd']);
  });
  it('past: most recent first', () => {
    expect(ids('past')).toEqual(['e', 'f', 'g']);
  });
  it('all: everything but cancelled, soonest first', () => {
    expect(ids('all')).toEqual(['g', 'f', 'e', 'b', 'i', 'a', 'c', 'd']);
  });
  it('filters by stage and by search across venue, city, state and tour', () => {
    expect(ids('all', { status: 'pitch' })).toEqual(['g', 'c']);
    expect(ids('all', { query: 'winter' })).toEqual(['a']);
    expect(ids('all', { query: '  fayette ' })).toEqual(['i']);
    expect(ids('all', { query: 'ar' })).toEqual(['i']);
  });
});

describe('stageCounts', () => {
  it('counts each pipeline stage in order, without cancelled', () => {
    const counts = stageCounts(LIST);
    expect(counts.map(c => c.status)).toEqual(['pitch', 'negotiation', 'hold', 'contract', 'confirmed', 'advancing', 'completed']);
    expect(Object.fromEntries(counts.map(c => [c.status, c.count]))).toMatchObject({ pitch: 2, hold: 1, confirmed: 2, completed: 1, negotiation: 0 });
  });
});

describe('groupByMonth', () => {
  it('keeps order and puts undated shows under "Date to be set"', () => {
    const g = groupByMonth(filterBookings(LIST, { tab: 'upcoming', status: null, query: '' }, TODAY));
    expect(g.map(x => [x.label, x.items.length])).toEqual([
      ['October 2026', 2], ['November 2026', 2], ['December 2026', 1], ['Date to be set', 1],
    ]);
  });
});

describe('nextShow / dealAmount', () => {
  it('finds the next booked show from today', () => {
    expect(nextShow(LIST, TODAY)?.id).toBe('b');
  });
  it('prefers the agreed amount, then the fee', () => {
    expect(dealAmount({ id: 'x', show_date: null, status: 'pitch', agreed_amount: '500', fee: 300 })).toBe(500);
    expect(dealAmount({ id: 'x', show_date: null, status: 'pitch', agreed_amount: null, fee: 300 })).toBe(300);
    expect(dealAmount({ id: 'x', show_date: null, status: 'pitch' })).toBeNull();
  });
});
