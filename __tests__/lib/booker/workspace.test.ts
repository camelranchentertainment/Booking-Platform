// __tests__/lib/booker/workspace.test.ts
import { attentionItems, bandTiles, byId, findConflicts, groupByDate, payableShows, venueLabel } from '../../../lib/booker/workspace';
import type { BookerShow, BookerVenue, RosterBand } from '../../../lib/booker/types';

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

const show = (over: Partial<BookerShow> = {}): BookerShow => ({
  id: 's1',
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
  followup_on: null,
  ...ts,
  ...over,
});

const venue: BookerVenue = { id: 'v1', booker_id: 'k', name: 'Saloon', address: null, city: 'Coleman', state: null, postal_code: null, capacity: null, website: null, notes: null, ...ts };
const venues = byId([venue]);

describe('venueLabel', () => {
  it('prefers the saved venue, falls back to the typed one', () => {
    expect(venueLabel(show({ venue_id: 'v1' }), venues)).toBe('Saloon — Coleman');
    expect(venueLabel(show(), venues)).toBe('Possum Kingdom — Graford');
    expect(venueLabel(show({ venue_name: null, venue_city: null }), venues)).toBe('Venue not set');
  });
});

describe('groupByDate', () => {
  it('groups in date order and leaves cancelled shows out', () => {
    const groups = groupByDate([
      show({ id: 'a', show_date: '2026-10-25' }),
      show({ id: 'b', show_date: '2026-10-24' }),
      show({ id: 'c', show_date: '2026-10-24', roster_id: 'b2' }),
      show({ id: 'd', show_date: '2026-10-26', status: 'cancelled' }),
    ]);
    expect(groups.map(g => [g.date, g.shows.map(s => s.id)])).toEqual([
      ['2026-10-24', ['b', 'c']],
      ['2026-10-25', ['a']],
    ]);
  });
});

describe('findConflicts', () => {
  it('finds same band, same date, ignoring itself and cancelled shows', () => {
    const shows = [show({ id: 'a' }), show({ id: 'b' }), show({ id: 'c', status: 'cancelled' }), show({ id: 'd', roster_id: 'b2' })];
    expect(findConflicts(shows, 'b1', '2026-10-24', 'a').map(s => s.id)).toEqual(['b']);
  });
});

describe('attentionItems', () => {
  const today = '2026-10-20';
  it('lists follow-ups, stale holds, unsettled shows and bands without a rate, in that order', () => {
    const items = attentionItems(
      [
        show({ id: 'f', status: 'hold', show_date: '2026-11-01', followup_on: '2026-10-20' }),
        show({ id: 'h', status: 'pending', show_date: '2026-10-10' }),
        show({ id: 'p', status: 'confirmed', show_date: '2026-10-18' }),
        show({ id: 'ok', status: 'confirmed', show_date: '2026-10-30' }),
      ],
      [band(), band({ id: 'b2', band_name: 'No Rate', commission_pct: null })],
      venues,
      today,
    );
    expect(items.map(i => i.kind)).toEqual(['followup_due', 'stale_hold', 'needs_settling', 'band_without_rate']);
  });

  it('ignores inactive bands and future follow-ups', () => {
    const items = attentionItems(
      [show({ status: 'hold', show_date: '2026-11-01', followup_on: '2026-10-21' })],
      [band({ commission_pct: null, status: 'inactive' })],
      venues,
      today,
    );
    expect(items).toEqual([]);
  });
});

describe('bandTiles', () => {
  it('summarises upcoming confirmed shows and holds per active band', () => {
    const tiles = bandTiles(
      [band(), band({ id: 'b2', status: 'inactive' })],
      [
        show({ id: 'past', show_date: '2026-10-01' }),
        show({ id: 'hold', status: 'hold', show_date: '2026-10-22' }),
        show({ id: 'next', show_date: '2026-10-24' }),
        show({ id: 'later', show_date: '2026-11-24' }),
      ],
      '2026-10-20',
    );
    expect(tiles).toHaveLength(1);
    expect(tiles[0].nextShow?.id).toBe('next');
    expect(tiles[0].upcomingCount).toBe(2);
    expect(tiles[0].holdCount).toBe(1);
  });
});

describe('payableShows', () => {
  it('lists played shows newest first with commission due', () => {
    const opts = payableShows(
      [show({ id: 'a', status: 'played', show_date: '2026-09-01' }), show({ id: 'b', status: 'played', show_date: '2026-10-01' }), show({ id: 'c' })],
      byId([band()]),
      venues,
    );
    expect(opts.map(o => [o.id, o.due])).toEqual([
      ['b', 60],
      ['a', 60],
    ]);
  });
});
