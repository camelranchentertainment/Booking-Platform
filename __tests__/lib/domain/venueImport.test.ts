// __tests__/lib/domain/venueImport.test.ts
import { parseVenueImport, parseCapacity } from '../../../lib/domain/venueImport';

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

describe('parseCapacity', () => {
  it.each([
    ['120', 120], ['1,200', 1200], [' 300 ', 300], ['', null], ['TBD', null], ['0', null], ['-5', null],
  ])('%p → %p', (raw, out) => expect(parseCapacity(raw)).toBe(out));
});
