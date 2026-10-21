// __tests__/lib/booker/summary.test.ts
// Counting behind the agent Home, Bands and Shows pages.
import {
  bandCards,
  bandsForTab,
  deskSummary,
  plural,
  rosterSummary,
  rosterTabCounts,
  showTabCounts,
  showsForTab,
  showsSummary,
  groupInOrder,
  searchVenues,
  venueBookSummary,
  venueCards,
  venueKindCounts,
} from '../../../lib/booker/summary';
import type { BookerContact, BookerShow, BookerVenue, RosterBand } from '../../../lib/booker/types';

const ts = { created_at: '', updated_at: '', deleted_at: null };

const band = (over: Partial<RosterBand> = {}): RosterBand => ({
  id: 'b1',
  booker_id: 'k',
  band_name: 'The Jackwagons',
  genre: null,
  home_city: null,
  home_state: null,
  contact_name: null,
  contact_email: null,
  contact_phone: null,
  commission_pct: 10,
  color: null,
  notes: null,
  status: 'active',
  ...ts,
  ...over,
});

let seq = 0;
const show = (over: Partial<BookerShow> = {}): BookerShow => ({
  id: `s${++seq}`,
  booker_id: 'k',
  roster_id: 'b1',
  venue_id: null,
  venue_name: 'Possum Kingdom',
  venue_city: 'Graford',
  show_date: '2026-10-24',
  load_in_time: null,
  door_time: null,
  set_time: null,
  set_length_min: null,
  status: 'confirmed',
  deal_type: null,
  fee: 600,
  actual_amount: null,
  commission_pct_override: null,
  deal_notes: null,
  internal_notes: null,
  followup_on: null, hold_rank: null, hold_expires_on: null, answer_by: null, challenge_note: null,
  ...ts,
  ...over,
});

// Wednesday 2026-10-21: "this weekend" is Fri 23 – Sun 25.
const TODAY = '2026-10-21';

describe('deskSummary', () => {
  const bands = [band(), band({ id: 'b2', band_name: 'Second Act', commission_pct: 15 }), band({ id: 'b3', status: 'inactive' }), band({ id: 'b4', deleted_at: '2026-01-01' })];

  it('counts active bands, weekend shows and the bands playing them', () => {
    const shows = [
      show({ show_date: '2026-10-23' }),
      show({ show_date: '2026-10-24' }),
      show({ roster_id: 'b2', show_date: '2026-10-25' }),
      show({ show_date: '2026-10-24', status: 'hold' }),
      show({ show_date: '2026-10-24', status: 'cancelled' }),
      show({ show_date: '2026-10-26' }),
    ];
    const s = deskSummary(bands, shows, TODAY, 60);
    expect(s.activeBands).toBe(2);
    expect(s.weekendConfirmed).toBe(3);
    expect(s.weekendBands).toBe(2);
  });

  it('projects commission only on confirmed shows inside the window', () => {
    const shows = [
      show({ show_date: '2026-10-22', fee: 1000 }), // 10% → 100
      show({ roster_id: 'b2', show_date: '2026-11-01', fee: 500 }), // 15% → 75
      show({ show_date: '2027-02-01', fee: 9999 }), // outside 60 days
      show({ show_date: '2026-10-22', fee: 1000, status: 'hold' }), // holds earn nothing
      show({ show_date: '2026-10-20', fee: 1000 }), // past
    ];
    const s = deskSummary(bands, shows, TODAY, 60);
    expect(s.windowConfirmed).toBe(2);
    expect(s.windowCommission).toBe(175);
    expect(s.nextShow?.show_date).toBe('2026-10-22');
  });

  it('counts upcoming holds and those with a follow-up due', () => {
    const shows = [
      show({ status: 'hold', show_date: '2026-11-01', followup_on: '2026-10-20' }),
      show({ status: 'pending', show_date: '2026-11-02', followup_on: '2026-10-21' }),
      show({ status: 'hold', show_date: '2026-11-03', followup_on: '2026-10-30' }),
      show({ status: 'hold', show_date: '2026-10-01' }), // past: not "in play"
      show({ status: 'hold', show_date: '2026-11-04', deleted_at: '2026-10-01' }),
    ];
    const s = deskSummary(bands, shows, TODAY, 60);
    expect(s.holds).toBe(3);
    expect(s.holdsFollowupDue).toBe(2);
  });

  it('finds the next confirmed show even beyond the window', () => {
    const s = deskSummary(bands, [show({ show_date: '2027-03-01' })], TODAY, 60);
    expect(s.windowConfirmed).toBe(0);
    expect(s.nextShow?.show_date).toBe('2027-03-01');
  });
});

describe('bandCards', () => {
  it('lists active bands first, by name, and drops archived ones', () => {
    const cards = bandCards(
      [band({ id: 'z', band_name: 'Zeta', status: 'inactive' }), band({ id: 'b', band_name: 'Bravo' }), band({ id: 'a', band_name: 'Alpha' }), band({ id: 'x', deleted_at: '2026-01-01' })],
      [],
      TODAY,
    );
    expect(cards.map(c => c.band.band_name)).toEqual(['Alpha', 'Bravo', 'Zeta']);
  });

  it('counts booked, holds and played, and prefers a confirmed next show', () => {
    const [card] = bandCards(
      [band()],
      [
        show({ status: 'hold', show_date: '2026-10-22' }),
        show({ status: 'confirmed', show_date: '2026-11-05' }),
        show({ status: 'played', show_date: '2026-09-01' }),
        show({ status: 'cancelled', show_date: '2026-10-30' }),
      ],
      TODAY,
    );
    expect(card.booked).toBe(1);
    expect(card.holds).toBe(1);
    expect(card.played).toBe(1);
    expect(card.nextShow?.show_date).toBe('2026-11-05');
  });

  it('falls back to the next hold, and flags active bands with no rate', () => {
    const [card] = bandCards([band({ commission_pct: null })], [show({ status: 'pending', show_date: '2026-11-01' })], TODAY);
    expect(card.nextShow?.status).toBe('pending');
    expect(card.needsRate).toBe(true);
    const [inactive] = bandCards([band({ commission_pct: null, status: 'inactive' })], [], TODAY);
    expect(inactive.needsRate).toBe(false);
  });
});

describe('roster tabs and summary', () => {
  const cards = bandCards(
    [band({ id: 'a', band_name: 'A' }), band({ id: 'b', band_name: 'B', commission_pct: null }), band({ id: 'c', band_name: 'C', status: 'inactive' })],
    [show({ roster_id: 'a', show_date: '2026-11-01' }), show({ roster_id: 'a', status: 'hold', show_date: '2026-11-02' }), show({ roster_id: 'c', show_date: '2026-11-03' })],
    TODAY,
  );

  it('filters and counts by tab', () => {
    expect(bandsForTab(cards, 'active').map(c => c.band.id)).toEqual(['a', 'b']);
    expect(bandsForTab(cards, 'inactive').map(c => c.band.id)).toEqual(['c']);
    expect(bandsForTab(cards, 'all')).toHaveLength(3);
    expect(rosterTabCounts(cards)).toEqual({ active: 2, inactive: 1, all: 3 });
  });

  it('summarises active bands only', () => {
    expect(rosterSummary(cards)).toEqual({ activeBands: 2, booked: 1, holds: 1, needsRate: 1, idleBands: 1 });
  });
});

describe('show tabs and summary', () => {
  const shows = [
    show({ id: 'p1', show_date: '2026-09-01', status: 'played' }),
    show({ id: 'p2', show_date: '2025-12-01', status: 'played' }),
    show({ id: 'u1', show_date: '2026-11-10' }),
    show({ id: 'u0', show_date: '2026-10-21', status: 'hold' }),
    show({ id: 'c1', show_date: '2026-10-10' }), // confirmed, past → to settle
    show({ id: 'x1', show_date: '2026-11-11', status: 'cancelled' }),
    show({ id: 'd1', show_date: '2026-11-12', deleted_at: '2026-10-01' }),
  ];

  it('orders upcoming soonest first and past most recent first', () => {
    expect(showsForTab(shows, 'upcoming', TODAY).map(s => s.id)).toEqual(['u0', 'u1', 'x1']);
    expect(showsForTab(shows, 'past', TODAY).map(s => s.id)).toEqual(['c1', 'p1', 'p2']);
    expect(showsForTab(shows, 'all', TODAY)[0].id).toBe('x1');
  });

  it('counts tabs without archived rows', () => {
    expect(showTabCounts(shows, TODAY)).toEqual({ upcoming: 3, past: 3, all: 6 });
  });

  it('summarises booked, in play, to settle and played this year', () => {
    expect(showsSummary(shows, TODAY)).toEqual({ booked: 1, inPlay: 1, toSettle: 1, playedThisYear: 1 });
  });
});

describe('plural', () => {
  it('picks the right noun', () => {
    expect(plural(1, 'band')).toBe('1 band');
    expect(plural(3, 'band')).toBe('3 bands');
    expect(plural(2, 'hold is', 'holds are')).toBe('2 holds are');
  });
});

describe('groupInOrder', () => {
  it('groups consecutive same-date shows and keeps the given order', () => {
    const g = groupInOrder([{ show_date: '2026-11-02' }, { show_date: '2026-11-02' }, { show_date: '2026-11-01' }]);
    expect(g.map(x => [x.date, x.shows.length])).toEqual([['2026-11-02', 2], ['2026-11-01', 1]]);
  });
});

describe('venue book', () => {
  const venue = (over: Partial<BookerVenue> = {}): BookerVenue => ({
    id: 'v1', booker_id: 'k', name: 'Gruene Hall', address: null, city: 'New Braunfels', state: 'TX', postal_code: null, capacity: null,
    website: null, notes: null, kind: 'venue', place_id: null, email: null, phone: null, last_scanned_at: null, ...ts, ...over,
  });
  const contact = (over: Partial<BookerContact> = {}): BookerContact => ({
    id: 'c1', booker_id: 'k', venue_id: 'v1', name: 'Sarah Lee', title: 'Talent buyer', email: null, phone: null, notes: null,
    share_with_bands: false, source: 'manual', ...ts, ...over,
  });
  const venues = [venue(), venue({ id: 'v2', name: 'Saxon Pub', city: 'Austin', state: 'tx', email: 'book@saxon.com' }), venue({ id: 'v3', name: 'Okie Fest', state: 'OK', kind: 'festival' }), venue({ id: 'v4', deleted_at: '2026-01-01' })];
  const contacts = [contact({ email: 'sarah@gruene.com', share_with_bands: true }), contact({ id: 'c2', name: 'Mike Ray' }), contact({ id: 'c3', venue_id: 'v3', deleted_at: '2026-01-01' })];
  const shows = [
    show({ venue_id: 'v1', show_date: '2026-09-01', status: 'played' }),
    show({ venue_id: 'v1', show_date: '2026-11-01', status: 'hold' }),
    show({ venue_id: 'v2', show_date: '2026-11-05', status: 'cancelled' }),
  ];
  const cards = venueCards(venues, contacts, shows, TODAY);

  it('builds a card per live venue with contacts, shows and email coverage', () => {
    expect(cards.map(c => c.venue.id)).toEqual(['v1', 'v2', 'v3']);
    expect(cards[0]).toMatchObject({ sharedContacts: 1, shows: 2, upcoming: 1, lastPlayed: '2026-09-01', hasEmail: true });
    expect(cards[0].contacts).toHaveLength(2);
    expect(cards[1]).toMatchObject({ shows: 0, hasEmail: true });
    expect(cards[2]).toMatchObject({ contacts: [], hasEmail: false });
  });

  it('summarises the book', () => {
    expect(venueBookSummary(cards)).toEqual({ venues: 3, states: 2, withEmail: 2, emailPct: 67, contacts: 2, sharedContacts: 1, bookedAt: 1, upcomingAt: 1 });
    expect(venueBookSummary([])).toMatchObject({ venues: 0, emailPct: 0 });
  });

  it('counts kinds present', () => {
    expect(venueKindCounts(cards)).toEqual({ venue: 2, festival: 1 });
  });

  it('searches venues and their contacts', () => {
    expect(searchVenues(cards, 'mike').map(c => c.venue.id)).toEqual(['v1']);
    expect(searchVenues(cards, 'AUSTIN').map(c => c.venue.id)).toEqual(['v2']);
    expect(searchVenues(cards, '  ')).toHaveLength(3);
  });
});
