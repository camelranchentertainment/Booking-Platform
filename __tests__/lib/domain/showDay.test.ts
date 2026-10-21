// __tests__/lib/domain/showDay.test.ts
import {
  SHOW_DAY_STATUSES, formatClock, runOfShow, missingTimes, logisticsRows, dealSummary,
  cityLine, mapsLink, addDays, daysBetween, tourPosition, heroSummary,
} from '../../../lib/domain/showDay';

const times = (load: string | null, sound: string | null, set: string | null, end: string | null) => ({
  load_in_time: load, soundcheck_time: sound, set_time: set, end_time: end,
});

describe('SHOW_DAY_STATUSES', () => {
  it('includes advancing and contract shows, not just confirmed', () => {
    expect(SHOW_DAY_STATUSES).toEqual(expect.arrayContaining(['contract', 'confirmed', 'advancing']));
  });
  it('never includes cancelled shows or outreach stages', () => {
    for (const s of ['cancelled', 'pitch', 'hold', 'negotiation']) expect(SHOW_DAY_STATUSES).not.toContain(s);
  });
});

describe('formatClock', () => {
  it.each([
    ['17:30:00', '5:30 PM'],
    ['09:05', '9:05 AM'],
    ['00:15', '12:15 AM'],
    ['12:00:00', '12:00 PM'],
  ])('%s → %s', (input, out) => expect(formatClock(input)).toBe(out));

  it('returns null for blank or junk values', () => {
    expect(formatClock(null)).toBeNull();
    expect(formatClock('')).toBeNull();
    expect(formatClock('soon')).toBeNull();
    expect(formatClock('25:00')).toBeNull();
  });
});

describe('runOfShow / missingTimes', () => {
  it('keeps the four steps in show order', () => {
    expect(runOfShow(times('15:00', '17:00', '21:00', null)).map(s => s.key))
      .toEqual(['load_in', 'soundcheck', 'showtime', 'end']);
  });
  it('flags only the required blanks', () => {
    expect(missingTimes(times(null, '17:00', null, null))).toEqual(['Load-in', 'Showtime']);
    expect(missingTimes(times('15:00', '17:00', '21:00', null))).toEqual([]);
  });
});

describe('logisticsRows', () => {
  it('marks sorted items ok and unknown sound as TBD', () => {
    const rows = logisticsRows({ sound_system: null, meals_provided: true, drinks_provided: null, hotel_booked: false });
    expect(rows).toEqual([
      { label: 'Sound', value: 'TBD', ok: false },
      { label: 'Meals', value: 'Provided', ok: true },
      { label: 'Drinks', value: 'Not provided', ok: false },
      { label: 'Hotel', value: 'Not booked', ok: false },
    ]);
  });
  it('labels house and self-provided sound', () => {
    expect(logisticsRows({ sound_system: 'house', meals_provided: null, drinks_provided: null, hotel_booked: null })[0].value).toBe('House PA');
    expect(logisticsRows({ sound_system: 'self', meals_provided: null, drinks_provided: null, hotel_booked: null })[0].value).toBe('Bringing our own');
  });
});

describe('dealSummary', () => {
  it('joins the deal type and amount', () => {
    expect(dealSummary({ deal_type: 'guarantee', agreed_amount: 1500 })).toBe('Guarantee · $1,500');
  });
  it('handles a missing type or amount', () => {
    expect(dealSummary({ deal_type: 'door_split', agreed_amount: null })).toBe('Door split');
    expect(dealSummary({ deal_type: null, agreed_amount: 800 })).toBe('Deal TBD · $800');
    expect(dealSummary({ deal_type: null, agreed_amount: null })).toBeNull();
  });
});

describe('cityLine / mapsLink', () => {
  it('builds a town line from whatever is present', () => {
    expect(cityLine({ city: 'Fayetteville', state: 'AR' })).toBe('Fayetteville, AR');
    expect(cityLine({ city: null, state: 'AR' })).toBe('AR');
    expect(cityLine(null)).toBeNull();
  });
  it('prefers the street address for maps and URL-encodes it', () => {
    const link = mapsLink({ id: 'v', name: 'Roadhouse', city: 'Austin', state: 'TX', address: '1 Main St, Austin, TX', phone: null });
    expect(link).toBe('https://www.google.com/maps/search/?api=1&query=1%20Main%20St%2C%20Austin%2C%20TX');
  });
  it('falls back to name and town', () => {
    expect(mapsLink({ id: 'v', name: 'Roadhouse', city: 'Austin', state: 'TX', address: null, phone: null }))
      .toContain('Roadhouse%20Austin%20TX');
    expect(mapsLink({ id: 'v', name: null, city: null, state: null, address: null, phone: null })).toBeNull();
  });
});

describe('addDays / daysBetween', () => {
  it('rolls over month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('counts across the November DST change without drift', () => {
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-10-20', '2026-10-20')).toBe(0);
  });
});

describe('tourPosition', () => {
  it('ranks the show among dated tour shows', () => {
    const shows = [
      { id: 'c', show_date: '2026-10-22' },
      { id: 'a', show_date: '2026-10-20' },
      { id: 'x', show_date: null },
      { id: 'b', show_date: '2026-10-21' },
    ];
    expect(tourPosition('b', shows)).toEqual({ current: 2, total: 3 });
    expect(tourPosition('zzz', shows)).toBeNull();
  });
});

describe('heroSummary', () => {
  const venue = (name: string | null, city: string | null = 'Tulsa', state: string | null = 'OK') =>
    ({ id: 'v', name, city, state, address: null, phone: null });

  it('names tonight’s venue on a show day', () => {
    expect(heroSummary({ todayShows: [{ venue: venue('Cain’s Ballroom') }], tomorrowShows: [], next: null, today: '2026-10-20' }))
      .toBe('Show day — Cain’s Ballroom in Tulsa, OK.');
  });
  it('counts multiple shows', () => {
    expect(heroSummary({ todayShows: [{ venue: null }, { venue: null }], tomorrowShows: [], next: null, today: '2026-10-20' }))
      .toBe('Show day — 2 shows on the books today.');
  });
  it('points at tomorrow or the next show on an off day', () => {
    expect(heroSummary({ todayShows: [], tomorrowShows: [{ venue: null }], next: null, today: '2026-10-20' }))
      .toBe('Off day — you play again tomorrow.');
    expect(heroSummary({ todayShows: [], tomorrowShows: [], next: { show_date: '2026-10-25', venue: venue('The Blue Door') }, today: '2026-10-20' }))
      .toBe('Off day — The Blue Door in 5 days.');
  });
  it('says so when nothing is booked', () => {
    expect(heroSummary({ todayShows: [], tomorrowShows: [], next: null, today: '2026-10-20' }))
      .toBe('Off day — nothing on the books yet.');
  });
});
