// __tests__/lib/tourOutreach.test.ts
import {
  normalizeTourName,
  matchTour,
  pickContact,
  buildOutreachVenues,
  formatTargetLines,
  type TargetRow,
  type VenueContact,
} from '../../lib/domain/tourOutreach';

const tours = [
  { id: 'orion', name: 'ORION' },
  { id: 'lone', name: 'LONE STAR' },
  { id: 'nov', name: 'November Run' },
  { id: 'home', name: 'Home Tour' },
  { id: 'spring', name: 'Spring Tour' },
];

const venue = (id: string, email: string | null = `${id}@venue.test`, city = 'Ft Worth') =>
  ({ id, name: id, city, state: 'TX', email });
const row = (id: string, v = venue(id), status = 'target', booking_date: string | null = null): TargetRow =>
  ({ id: `tv-${id}`, tour_id: 'lone', status, booking_date, venue: v });
const contact = (venue_id: string, over: Partial<VenueContact> = {}): VenueContact =>
  ({ venue_id, first_name: 'Pat', last_name: 'Buyer', email: `pat@${venue_id}.test`, status: 'not_contacted', ...over });

describe('normalizeTourName', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(normalizeTourName('Lone_Star')).toBe('lonestar');
    expect(normalizeTourName('  LONE STAR ')).toBe('lonestar');
    expect(normalizeTourName(null)).toBe('');
  });
});

describe('matchTour', () => {
  it.each([
    ['LONE STAR', 'lone'],
    ['Lone_Star', 'lone'],               // what Scott typed in the agent
    ['Lone_Star tour', 'lone'],
    ['lone star', 'lone'],
    ['the targets for Lone Star', 'lone'],
    ['november', 'nov'],
    ['Home Tour', 'home'],               // "tour" is part of the real name
    ['blast the Spring Tour', 'spring'],
  ])('"%s" → %s', (typed, id) => {
    expect(matchTour(tours, typed)?.id).toBe(id);
  });

  it('returns null instead of guessing (old code fell back to the first tour)', () => {
    expect(matchTour(tours, 'Panhandle')).toBeNull();
    expect(matchTour(tours, '')).toBeNull();
  });

  it('returns null when a fragment matches more than one tour', () => {
    expect(matchTour(tours, 'ou')).toBeNull();
  });
});

describe('pickContact', () => {
  it('prefers a contact with an email and never picks do_not_contact', () => {
    const picked = pickContact([
      contact('v', { first_name: 'Nope', status: 'do_not_contact' }),
      contact('v', { first_name: 'NoMail', email: null }),
      contact('v', { first_name: 'Good' }),
    ]);
    expect(picked?.first_name).toBe('Good');
  });
  it('returns null when only do_not_contact people are saved', () => {
    expect(pickContact([contact('v', { status: 'do_not_contact' })])).toBeNull();
  });
});

describe('buildOutreachVenues', () => {
  it('builds one recipient per target with the venue email, sorted by name — 17 in, 17 out', () => {
    const rows = Array.from({ length: 17 }, (_, i) => row(`V${String(16 - i).padStart(2, '0')}`));
    const out = buildOutreachVenues(rows, []);
    expect(out).toHaveLength(17);
    expect(out[0]).toEqual({
      tourVenueId: 'tv-V00', venueId: 'V00', name: 'V00', city: 'Ft Worth', state: 'TX',
      email: 'V00@venue.test', contactName: null,
    });
    expect(out.map(v => v.name)).toEqual([...out.map(v => v.name)].sort());
  });

  it('venue email wins; contact email fills in when the venue has none', () => {
    const out = buildOutreachVenues(
      [row('A'), row('B', venue('B', null))],
      [contact('A', { email: 'pat@a.test' }), contact('B', { email: 'pat@b.test' })],
    );
    expect(out.find(v => v.venueId === 'A')?.email).toBe('A@venue.test');
    expect(out.find(v => v.venueId === 'B')?.email).toBe('pat@b.test');
    expect(out.find(v => v.venueId === 'B')?.contactName).toBe('Pat Buyer');
  });

  it('does not use a do_not_contact person’s email', () => {
    const out = buildOutreachVenues([row('B', venue('B', '  '))], [contact('B', { status: 'do_not_contact' })]);
    expect(out[0].email).toBeNull();
    expect(out[0].contactName).toBeNull();
  });

  it('drops targets whose venue is gone', () => {
    expect(buildOutreachVenues([{ ...row('A'), venue: null }], [])).toEqual([]);
  });
});

describe('formatTargetLines', () => {
  it('says "none yet" only when there really are none', () => {
    expect(formatTargetLines([])).toEqual(['    Targets: none yet']);
  });

  it('states the exact count and lists venues, flagging missing emails and pinned nights', () => {
    const lines = formatTargetLines([
      row('Stampede'),
      row('Hoots Hall', venue('Hoots Hall', null, 'Hillsboro'), 'follow_up', '2027-01-08'),
    ]);
    expect(lines[0]).toContain('Targets (2: 1 targeted, 1 following up)');
    expect(lines[1]).toBe('    - Hoots Hall, Hillsboro TX [following up · for 2027-01-08 · no email on file]');
    expect(lines[2]).toBe('    - Stampede, Ft Worth TX [targeted]');
  });

  it('caps the list but keeps the true total', () => {
    const lines = formatTargetLines(Array.from({ length: 30 }, (_, i) => row(`V${i}`)), 25);
    expect(lines[0]).toContain('Targets (30:');
    expect(lines).toHaveLength(1 + 25 + 1);
    expect(lines[lines.length - 1]).toBe('    …and 5 more');
  });
});
