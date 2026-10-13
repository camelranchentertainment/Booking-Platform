// __tests__/lib/placeLocality.test.ts
import {
  formatLocality,
  localityFromComponents,
  localityFromFormattedAddress,
  nearbyTag,
  normalizeCity,
  normalizeState,
  sameLocality,
  searchSummary,
  streetFromComponents,
  type AddressComponent,
} from '../../lib/placeLocality';

describe('localityFromFormattedAddress', () => {
  it('reads town, state and ZIP from a full US address', () => {
    expect(localityFromFormattedAddress('427 S College St, Lebanon, TN 37087, USA')).toEqual({ city: 'Lebanon', state: 'TN', postalCode: '37087' });
  });
  it('handles a suite in the street part', () => {
    expect(localityFromFormattedAddress('595 Hillsboro Rd #321, Franklin, TN 37064, United States')).toEqual({
      city: 'Franklin',
      state: 'TN',
      postalCode: '37064',
    });
  });
  it('handles ZIP+4 and a missing country', () => {
    expect(localityFromFormattedAddress('10067 TN-46, Bon Aqua, TN 37025-1234')).toEqual({ city: 'Bon Aqua', state: 'TN', postalCode: '37025-1234' });
  });
  it('handles a town-only address with no ZIP', () => {
    expect(localityFromFormattedAddress('Decherd, TN, USA')).toEqual({ city: 'Decherd', state: 'TN', postalCode: null });
  });
  it('accepts a full state name', () => {
    expect(localityFromFormattedAddress('1 Main St, Monteagle, Tennessee 37356, USA')?.state).toBe('TN');
  });
  it('returns null rather than calling a street line a town', () => {
    expect(localityFromFormattedAddress('123 Main St, TN 37324, USA')).toBeNull();
  });
  it('returns null for non-US and empty addresses', () => {
    expect(localityFromFormattedAddress('1 First Street, Manchester M15 4RP, UK')).toBeNull();
    expect(localityFromFormattedAddress('')).toBeNull();
    expect(localityFromFormattedAddress(undefined)).toBeNull();
  });
});

const lebanon: AddressComponent[] = [
  { long_name: '427', short_name: '427', types: ['street_number'] },
  { long_name: 'South College Street', short_name: 'S College St', types: ['route'] },
  { long_name: 'Lebanon', short_name: 'Lebanon', types: ['locality', 'political'] },
  { long_name: 'Wilson County', short_name: 'Wilson County', types: ['administrative_area_level_2', 'political'] },
  { long_name: 'Tennessee', short_name: 'TN', types: ['administrative_area_level_1', 'political'] },
  { long_name: '37087', short_name: '37087', types: ['postal_code'] },
];

describe('localityFromComponents', () => {
  it('uses locality and the state code', () => {
    expect(localityFromComponents(lebanon)).toEqual({ city: 'Lebanon', state: 'TN', postalCode: '37087' });
  });
  it('falls back to a county subdivision for unincorporated places', () => {
    const rural: AddressComponent[] = [
      { long_name: 'Bon Aqua', short_name: 'Bon Aqua', types: ['administrative_area_level_3', 'political'] },
      { long_name: 'Tennessee', short_name: 'TN', types: ['administrative_area_level_1', 'political'] },
    ];
    expect(localityFromComponents(rural)?.city).toBe('Bon Aqua');
  });
  it('returns null without a town or a state', () => {
    expect(localityFromComponents([lebanon[4]])).toBeNull();
    expect(localityFromComponents([lebanon[2]])).toBeNull();
    expect(localityFromComponents(undefined)).toBeNull();
  });
});

describe('streetFromComponents', () => {
  it('joins number and short route', () => {
    expect(streetFromComponents(lebanon)).toBe('427 S College St');
  });
  it('is null without a route', () => {
    expect(streetFromComponents([lebanon[0]])).toBeNull();
  });
});

describe('normalizeState / normalizeCity / sameLocality', () => {
  it('normalises state names and codes', () => {
    expect(normalizeState('Tennessee')).toBe('TN');
    expect(normalizeState(' tn ')).toBe('TN');
    expect(normalizeState('Ontario')).toBe('ONTARIO');
  });
  it('ignores case, punctuation and abbreviations in town names', () => {
    expect(normalizeCity('St. Louis')).toBe(normalizeCity('saint louis'));
    expect(normalizeCity('Ft. Worth')).toBe(normalizeCity('Fort Worth'));
    expect(normalizeCity('City of Franklin')).toBe('franklin');
  });
  it('matches the same town and rejects a neighbour', () => {
    expect(sameLocality({ city: 'Decherd', state: 'Tennessee' }, { city: 'decherd', state: 'TN' })).toBe(true);
    expect(sameLocality({ city: 'Lebanon', state: 'TN' }, { city: 'Decherd', state: 'TN' })).toBe(false);
    expect(sameLocality({ city: 'Franklin', state: 'TN' }, { city: 'Franklin', state: 'KY' })).toBe(false);
  });
});

describe('labels', () => {
  it('formats a locality', () => {
    expect(formatLocality('Lebanon', 'TN')).toBe('Lebanon, TN');
    expect(formatLocality(null, null)).toBe('');
  });
  it('summarises in-town and nearby counts', () => {
    expect(searchSummary([{ in_searched_city: true }, { in_searched_city: false }, { in_searched_city: false }], 'Decherd')).toBe('1 in Decherd · 2 nearby');
    expect(searchSummary([{ in_searched_city: true }], 'Decherd')).toBe('1 in Decherd');
  });
  it('tags nearby results with their own town, and never in-town ones', () => {
    expect(nearbyTag({ in_searched_city: false, city: 'Lebanon', state: 'TN' })).toBe('Nearby · Lebanon, TN');
    expect(nearbyTag({ in_searched_city: false, city: null, state: null })).toBe('Nearby · town not listed');
    expect(nearbyTag({ in_searched_city: true, city: 'Decherd', state: 'TN' })).toBeNull();
  });
});
