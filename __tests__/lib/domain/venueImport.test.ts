// __tests__/lib/domain/venueImport.test.ts
import {
  parseVenueImport, parseCapacity, mapVenueTable, normaliseState, splitLocation,
  venueMatchKey, indexExistingVenues, isExistingVenue,
} from '../../../lib/domain/venueImport';

describe('parseVenueImport', () => {
  it('reads a markdown table and skips the separator line', () => {
    const md = [
      '| Venue Name | City | State | Booking Email | Contact Name | Capacity |',
      '|---|---|---|---|---|---|',
      '| The Blue Door | Oklahoma City | OK | book@bluedoor.com | Greg Johnson Jr | 120 |',
    ].join('\n');
    const r = parseVenueImport(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      name: 'The Blue Door', city: 'Oklahoma City', state: 'OK',
      email: 'book@bluedoor.com', contact_email: 'book@bluedoor.com',
      contact_first: 'Greg', contact_last: 'Johnson Jr', capacity: '120', selected: true,
    });
  });

  it('reads CSV with quoted cells and lower-cases the venue type', () => {
    const r = parseVenueImport('Venue Name,City,Type\n"Cheatham Street",San Marcos,Bar');
    expect(r.ok && r.rows[0]).toMatchObject({ name: 'Cheatham Street', city: 'San Marcos', venue_type: 'bar' });
  });

  it('drops rows without a city and reports how many', () => {
    const r = parseVenueImport('Venue Name,City\nA,Austin\nB,\n');
    expect(r).toMatchObject({ ok: true, skipped: 1 });
  });

  it('explains empty input, a missing header and all-invalid rows', () => {
    expect(parseVenueImport('   ')).toEqual({ ok: false, error: 'Paste your venue list first.' });
    expect(parseVenueImport('just one line').ok).toBe(false);
    const r = parseVenueImport('Venue Name,City\nA,\nB,');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('2 rows skipped');
  });
});

describe('parseVenueImport — lists people actually paste (regressions)', () => {
  it('reads a paste from Excel or Google Sheets (tab-separated)', () => {
    const r = parseVenueImport('Venue Name\tCity\tState\nGruene Hall\tNew Braunfels\tTX\nCheatham Street\tSan Marcos\tTX');
    expect(r.ok && r.rows.map(x => [x.name, x.city, x.state])).toEqual([
      ['Gruene Hall', 'New Braunfels', 'TX'], ['Cheatham Street', 'San Marcos', 'TX'],
    ]);
  });

  it('accepts a column headed just "Venue"', () => {
    const r = parseVenueImport('Venue,City,State\nGruene Hall,New Braunfels,TX');
    expect(r.ok && r.rows[0]).toMatchObject({ name: 'Gruene Hall', city: 'New Braunfels', state: 'TX' });
  });

  it('keeps a quoted address with a comma in its own column', () => {
    const r = parseVenueImport('Venue Name,Address,City,State\nGruene Hall,"1281 Gruene Rd, Suite 1",New Braunfels,TX');
    expect(r.ok && r.rows[0]).toMatchObject({ address: '1281 Gruene Rd, Suite 1', city: 'New Braunfels', state: 'TX' });
  });

  it('explains a missing venue column in words the user can act on', () => {
    const r = parseVenueImport('Club Owner,Town\nBob,Austin');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Venue or Venue Name/);
  });
});

describe('mapVenueTable', () => {
  it('splits a combined location column, spells out states and fills contact names', () => {
    const r = mapVenueTable([
      ['Venue', 'Location', 'Talent Buyer', 'E-mail', 'Facebook'],
      ['The Blue Door', 'Oklahoma City, Oklahoma', 'Greg Johnson', 'greg@bluedoor.com', 'fb.com/bluedoor'],
    ], { requireCity: true });
    expect(r.ok && r.rows[0]).toMatchObject({
      name: 'The Blue Door', city: 'Oklahoma City', state: 'OK',
      contact_first: 'Greg', contact_last: 'Johnson', email: 'greg@bluedoor.com',
      notes: 'Facebook: fb.com/bluedoor',
    });
  });

  it('keeps rows without a city when the caller allows it', () => {
    const table = [['Venue Name', 'City'], ['A', ''], ['B', 'Austin']];
    expect(mapVenueTable(table, { requireCity: false })).toMatchObject({ ok: true, skipped: 0 });
    expect(mapVenueTable(table, { requireCity: true })).toMatchObject({ ok: true, skipped: 1 });
  });

  it('reports a sheet with no venue-name column', () => {
    expect(mapVenueTable([['Date', 'Fee'], ['2026-11-06', '800']], { requireCity: false }))
      .toEqual({ ok: false, reason: 'no_name_column', skipped: 0 });
  });
});

describe('state and location helpers', () => {
  it.each([['Texas', 'TX'], ['tx', 'TX'], ['TX.', 'TX'], ['New Mexico', 'NM'], ['Ontario', 'Ontario']])(
    'normaliseState(%p) → %p', (raw, out) => expect(normaliseState(raw)).toBe(out),
  );
  it.each([
    ['Austin, TX', { city: 'Austin', state: 'TX' }],
    ['Austin, Texas 78701', { city: 'Austin', state: 'TX' }],
    ['Austin TX', { city: 'Austin', state: 'TX' }],
    ['Austin', { city: 'Austin', state: '' }],
  ])('splitLocation(%p)', (raw, out) => expect(splitLocation(raw)).toEqual(out));
});

describe('duplicate matching', () => {
  const existing = indexExistingVenues([
    { name: 'The Blue Door', city: 'Oklahoma City' },
    { name: 'Gruene Hall', city: '' },
  ]);
  it('matches name + city ignoring case and punctuation', () => {
    expect(venueMatchKey(' The  Blue-Door ', 'OKLAHOMA CITY')).toBe('the blue door|oklahoma city');
    expect(isExistingVenue(existing, 'the blue door', 'Oklahoma City')).toBe(true);
  });
  it('matches on name alone when either side has no city', () => {
    expect(isExistingVenue(existing, 'The Blue Door', '')).toBe(true);
    expect(isExistingVenue(existing, 'Gruene Hall', 'New Braunfels')).toBe(true);
  });
  it('treats the same name in another city as a different venue', () => {
    expect(isExistingVenue(existing, 'The Blue Door', 'Tulsa')).toBe(false);
  });
});

describe('parseCapacity', () => {
  it.each([
    ['120', 120], ['1,200', 1200], [' 300 ', 300], ['', null], ['TBD', null], ['0', null], ['-5', null],
    ['250-300', 250], [450, 450], [null, null],
  ])('%p → %p', (raw, out) => expect(parseCapacity(raw)).toBe(out));
});
