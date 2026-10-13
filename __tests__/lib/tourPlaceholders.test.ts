// __tests__/lib/tourPlaceholders.test.ts
import {
  buildTourPlaceholders,
  datesInRange,
  MAX_TOUR_NIGHTS,
  type PlaceholderTarget,
  type PlaceholderTour,
} from '../../lib/domain/tourPlaceholders';

const loneStar: PlaceholderTour = { id: 't1', name: 'LONE STAR', start_date: '2027-01-07', end_date: '2027-01-09', status: 'planning' };
const venue = (name: string) => ({ id: name, name, city: 'Austin', state: 'TX' });
const target = (id: string, status = 'target', booking_date: string | null = null, tour_id = 't1'): PlaceholderTarget =>
  ({ id, tour_id, status, booking_date, venue: venue(id) });
const TODAY = '2026-10-12';

describe('datesInRange', () => {
  it('includes both ends', () => {
    expect(datesInRange('2027-01-07', '2027-01-09')).toEqual(['2027-01-07', '2027-01-08', '2027-01-09']);
  });
  it('crosses month and year ends', () => {
    expect(datesInRange('2026-12-31', '2027-01-01')).toEqual(['2026-12-31', '2027-01-01']);
  });
  it('returns nothing for reversed or invalid ranges', () => {
    expect(datesInRange('2027-01-09', '2027-01-07')).toEqual([]);
    expect(datesInRange('nope', '2027-01-07')).toEqual([]);
  });
  it('caps runaway ranges', () => {
    expect(datesInRange('2027-01-01', '2029-01-01')).toHaveLength(MAX_TOUR_NIGHTS);
  });
});

describe('buildTourPlaceholders', () => {
  it('gives LONE STAR one placeholder per night with all 17 unpinned targets — not 17 entries', () => {
    const targets = Array.from({ length: 17 }, (_, i) => target(`V${String(i).padStart(2, '0')}`));
    const out = buildTourPlaceholders([loneStar], targets, [], TODAY);
    expect(Object.keys(out)).toEqual(['2027-01-07', '2027-01-08', '2027-01-09']);
    for (const d of Object.keys(out)) {
      expect(out[d]).toHaveLength(1);
      expect(out[d][0]).toMatchObject({ tourId: 't1', tourName: 'LONE STAR', date: d });
      expect(out[d][0].targets).toHaveLength(17);
    }
  });

  it('a target pinned to a night counts only on that night; unpinned ones count on every night', () => {
    const out = buildTourPlaceholders([loneStar], [target('Pinned8', 'target', '2027-01-08'), target('Any')], [], TODAY);
    expect(out['2027-01-07'][0].targets.map(t => t.id)).toEqual(['Any']);
    expect(out['2027-01-08'][0].targets.map(t => t.id)).toEqual(['Any', 'Pinned8']);
    expect(out['2027-01-09'][0].targets.map(t => t.id)).toEqual(['Any']);
  });

  it('counts only open targets (target, follow_up)', () => {
    const out = buildTourPlaceholders(
      [loneStar],
      [target('A', 'target'), target('B', 'follow_up'), target('C', 'confirmed'), target('D', 'declined'), target('E', 'thank_you')],
      [],
      TODAY,
    );
    expect(out['2027-01-07'][0].targets.map(t => t.id)).toEqual(['A', 'B']);
  });

  it('still shows a night that has no targets yet', () => {
    const out = buildTourPlaceholders([loneStar], [], [], TODAY);
    expect(out['2027-01-07'][0].targets).toEqual([]);
  });

  it('a night with a booked show gets no placeholder; pitches do not block it', () => {
    const out = buildTourPlaceholders(
      [loneStar],
      [target('A')],
      [{ show_date: '2027-01-08', status: 'confirmed' }, { show_date: '2027-01-09', status: 'pitch' }],
      TODAY,
    );
    expect(Object.keys(out)).toEqual(['2027-01-07', '2027-01-09']);
  });

  it('skips finished/cancelled tours, past nights and tours with no dates', () => {
    const out = buildTourPlaceholders(
      [
        { ...loneStar, id: 'done', status: 'completed' },
        { ...loneStar, id: 'gone', status: 'cancelled' },
        { id: 'nodates', name: 'X', start_date: null, end_date: null, status: 'planning' },
        { id: 'past', name: 'Old', start_date: '2026-10-10', end_date: '2026-10-13', status: 'planning' },
      ],
      [],
      [],
      TODAY,
    );
    expect(Object.keys(out)).toEqual(['2026-10-12', '2026-10-13']);
    expect(out['2026-10-12'][0].tourId).toBe('past');
  });

  it('a one-day tour with only a start or end date gets that one night', () => {
    const out = buildTourPlaceholders([{ id: 's', name: 'Solo', start_date: '2027-02-01', end_date: null, status: 'planning' }], [], [], TODAY);
    expect(Object.keys(out)).toEqual(['2027-02-01']);
  });

  it('overlapping tours each get their own placeholder on a shared night, with their own targets', () => {
    const other: PlaceholderTour = { id: 't2', name: 'Panhandle', start_date: '2027-01-09', end_date: '2027-01-10', status: 'planning' };
    const out = buildTourPlaceholders([loneStar, other], [target('A'), target('B', 'target', null, 't2')], [], TODAY);
    expect(out['2027-01-09'].map(p => [p.tourName, p.targets.map(t => t.id)])).toEqual([['LONE STAR', ['A']], ['Panhandle', ['B']]]);
  });

  it('falls back to "Tour" for a blank name', () => {
    const out = buildTourPlaceholders([{ ...loneStar, name: '  ' }], [], [], TODAY);
    expect(out['2027-01-07'][0].tourName).toBe('Tour');
  });
});
