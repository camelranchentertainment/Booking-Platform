// __tests__/lib/booker/holds.test.ts
// Real holds: positions, expiry and challenge deadlines, urgency order, and
// clashes between the agent's own bands at one venue on one date.
import { findHoldClashes, holdChipText, holdCounts, holdLabel, holdStatus, holdStatusText, holdsByUrgency, isOpenHold, venueClashes } from '../../../lib/booker/holds';
import type { BookerShow } from '../../../lib/booker/types';

const TODAY = '2026-10-21';
let n = 0;
const show = (over: Partial<BookerShow> = {}): BookerShow => ({
  id: `s${++n}`,
  booker_id: 'k',
  roster_id: 'b1',
  venue_id: 'v1',
  venue_name: null,
  venue_city: null,
  show_date: '2026-11-14',
  load_in_time: null,
  door_time: null,
  set_time: null,
  set_length_min: null,
  status: 'hold',
  deal_type: null,
  fee: null,
  actual_amount: null,
  commission_pct_override: null,
  deal_notes: null,
  internal_notes: null,
  followup_on: null,
  hold_rank: null,
  hold_expires_on: null,
  answer_by: null,
  challenge_note: null,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  ...over,
});

describe('holdLabel', () => {
  it('names hold positions', () => {
    expect([1, 2, 3, 4, 9].map(holdLabel)).toEqual(['1st hold', '2nd hold', '3rd hold', '4th hold', '9th hold']);
    expect(holdLabel(null)).toBeNull();
    expect(holdLabel(0)).toBeNull();
  });
});

describe('isOpenHold', () => {
  it('is true only for live holds and pending offers', () => {
    expect(isOpenHold(show())).toBe(true);
    expect(isOpenHold(show({ status: 'pending' }))).toBe(true);
    expect(isOpenHold(show({ status: 'confirmed' }))).toBe(false);
    expect(isOpenHold(show({ deleted_at: '2026-10-01' }))).toBe(false);
  });
});

describe('holdStatus', () => {
  it('rates a challenge deadline: overdue, due today, soon, or not yet', () => {
    expect(holdStatus(show({ answer_by: '2026-10-20' }), TODAY)).toEqual({ urgency: 'overdue', reason: 'challenge', date: '2026-10-20' });
    expect(holdStatus(show({ answer_by: TODAY }), TODAY)).toMatchObject({ urgency: 'due' });
    expect(holdStatus(show({ answer_by: '2026-10-23' }), TODAY)).toMatchObject({ urgency: 'soon' });
    expect(holdStatus(show({ answer_by: '2026-10-24' }), TODAY)).toBeNull();
  });

  it('rates an expiry with a longer warning window', () => {
    expect(holdStatus(show({ hold_expires_on: '2026-10-24' }), TODAY)).toMatchObject({ urgency: 'soon', reason: 'expiry' });
    expect(holdStatus(show({ hold_expires_on: '2026-10-25' }), TODAY)).toBeNull();
    expect(holdStatus(show({ hold_expires_on: '2026-10-19' }), TODAY)).toMatchObject({ urgency: 'overdue', reason: 'expiry' });
  });

  it('puts a challenge ahead of an expiry, and ignores shows that are no longer holds', () => {
    expect(holdStatus(show({ answer_by: '2026-10-22', hold_expires_on: '2026-10-21' }), TODAY)).toMatchObject({ reason: 'challenge' });
    expect(holdStatus(show({ status: 'confirmed', answer_by: '2026-10-20' }), TODAY)).toBeNull();
  });

  it('describes each case in plain words', () => {
    expect(holdStatusText({ urgency: 'overdue', reason: 'challenge', date: '2026-10-20' }, 2026)).toBe('Challenge answer was due Tue, Oct 20');
    expect(holdStatusText({ urgency: 'due', reason: 'challenge', date: TODAY })).toBe('Challenge answer due today');
    expect(holdStatusText({ urgency: 'soon', reason: 'expiry', date: '2026-10-23' }, 2026)).toBe('Hold expires Fri, Oct 23');
    expect(holdStatusText({ urgency: 'overdue', reason: 'expiry', date: '2026-10-19' }, 2026)).toBe('Hold expired Mon, Oct 19');
  });
});

describe('holdChipText', () => {
  it('keeps row chips short', () => {
    expect(holdChipText({ urgency: 'soon', reason: 'challenge', date: '2026-10-23' }, 2026)).toBe('Answer by Fri, Oct 23');
    expect(holdChipText({ urgency: 'overdue', reason: 'challenge', date: '2026-10-20' })).toBe('Answer overdue');
    expect(holdChipText({ urgency: 'due', reason: 'expiry', date: TODAY })).toBe('Expires today');
    expect(holdChipText({ urgency: 'overdue', reason: 'expiry', date: '2026-10-19' })).toBe('Hold expired');
  });
});

describe('holdsByUrgency', () => {
  it('lists pressing deadlines first, then the rest by date and position', () => {
    const a = show({ id: 'a', show_date: '2026-11-20' });
    const b = show({ id: 'b', show_date: '2026-12-01', answer_by: '2026-10-20' });
    const c = show({ id: 'c', show_date: '2026-11-10', hold_expires_on: '2026-10-23' });
    const d = show({ id: 'd', show_date: '2026-11-20', hold_rank: 1 });
    const past = show({ id: 'p', show_date: '2026-10-01' });
    const confirmed = show({ id: 'x', status: 'confirmed' });
    expect(holdsByUrgency([a, b, c, d, past, confirmed], TODAY).map(s => s.id)).toEqual(['b', 'c', 'd', 'a']);
  });
});

describe('holdCounts', () => {
  it('counts open upcoming holds, challenged ones, and expiring ones', () => {
    const shows = [show({ answer_by: '2026-11-01' }), show({ hold_expires_on: '2026-10-22' }), show(), show({ show_date: '2026-10-01' }), show({ status: 'confirmed' })];
    expect(holdCounts(shows, TODAY)).toEqual({ open: 3, challenged: 1, expiring: 1 });
  });
});

describe('venueClashes', () => {
  const others = [
    show({ id: 'o1', roster_id: 'b2', venue_id: 'v1' }),
    show({ id: 'o2', roster_id: 'b2', venue_id: 'v2' }),
    show({ id: 'o3', roster_id: 'b3', venue_id: 'v1', status: 'cancelled' }),
    show({ id: 'o4', roster_id: 'b1', venue_id: 'v1' }),
    show({ id: 'o5', roster_id: 'b4', venue_id: null, venue_name: 'Saxon Pub' }),
  ];
  it('finds another of the agent’s bands at the same saved venue that date', () => {
    expect(venueClashes(others, { roster_id: 'b1', venue_id: 'v1', venue_name: null, show_date: '2026-11-14' }).map(s => s.id)).toEqual(['o1']);
  });
  it('matches typed venues by name, ignoring case and spaces', () => {
    expect(venueClashes(others, { roster_id: 'b1', venue_id: null, venue_name: ' saxon pub ', show_date: '2026-11-14' }).map(s => s.id)).toEqual(['o5']);
  });
  it('needs a date and a venue, and skips the show being edited', () => {
    expect(venueClashes(others, { roster_id: 'b1', venue_id: null, venue_name: '', show_date: '2026-11-14' })).toEqual([]);
    expect(venueClashes(others, { roster_id: 'b1', venue_id: 'v1', venue_name: null, show_date: '2026-11-14' }, 'o1')).toEqual([]);
  });
});

describe('findHoldClashes', () => {
  it('reports each venue-and-date clash between different bands once, flagging duplicate positions', () => {
    const clashes = findHoldClashes(
      [
        show({ id: 'a', roster_id: 'b1', hold_rank: 1 }),
        show({ id: 'b', roster_id: 'b2', hold_rank: 1 }),
        show({ id: 'c', roster_id: 'b1', venue_id: 'v2', show_date: '2026-11-20', hold_rank: 1 }),
        show({ id: 'd', roster_id: 'b2', venue_id: 'v2', show_date: '2026-11-20', hold_rank: 2 }),
        show({ id: 'e', roster_id: 'b1', venue_id: 'v3', show_date: '2026-11-21' }),
        show({ id: 'f', roster_id: 'b1', venue_id: 'v3', show_date: '2026-11-21' }),
        show({ id: 'g', roster_id: 'b2', show_date: '2026-10-01' }),
        show({ id: 'h', roster_id: 'b3', status: 'cancelled' }),
      ],
      TODAY,
    );
    expect(clashes).toEqual([
      { date: '2026-11-14', showIds: ['a', 'b'], rosterIds: ['b1', 'b2'], sameRank: true },
      { date: '2026-11-20', showIds: ['c', 'd'], rosterIds: ['b1', 'b2'], sameRank: false },
    ]);
  });
});
