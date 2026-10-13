// __tests__/lib/server/googlePlaces.test.ts
// Regression: a search for Decherd, TN returned Cahoots (Lebanon) and The Pond
// (Franklin), and both were labelled — and saved — as "Decherd".

jest.mock('../../../lib/platformSettings', () => ({ getSetting: jest.fn().mockResolvedValue('test-key') }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import { labelBySearchedCity, placeDetails, searchVenues, type PlaceResult } from '../../../lib/server/googlePlaces';
import { AppError } from '../../../lib/apiError';

const fetchMock = jest.fn();
beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
});
beforeEach(() => fetchMock.mockReset());

function respond(body: unknown) {
  fetchMock.mockResolvedValueOnce({ json: () => Promise.resolve(body) });
}

describe('searchVenues', () => {
  it('gives each result its own town and lists the searched town first', async () => {
    respond({
      status: 'OK',
      results: [
        { place_id: 'p-cahoots', name: 'Cahoots', formatted_address: '427 S College St, Lebanon, TN 37087, USA', rating: 4.5, user_ratings_total: 900 },
        { place_id: 'p-boondox', name: 'The Boondox', formatted_address: '100 Main St, Decherd, TN 37324, USA' },
        { place_id: 'p-nowhere', name: 'Where in the Woods', formatted_address: 'Tennessee, USA' },
      ],
    });

    const r = await searchVenues('Decherd', 'Tennessee');

    expect(r.map(x => [x.name, x.city, x.state, x.in_searched_city])).toEqual([
      ['The Boondox', 'Decherd', 'TN', true],
      ['Cahoots', 'Lebanon', 'TN', false],
      ['Where in the Woods', null, null, false],
    ]);
    expect(r.every(x => x.searched_city === 'Decherd' && x.searched_state === 'Tennessee')).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain('Decherd');
  });

  it('throws a 502 AppError on a Google error status', async () => {
    respond({ status: 'REQUEST_DENIED' });
    await expect(searchVenues('Decherd', 'TN')).rejects.toMatchObject({ statusCode: 502 });
  });

  it('throws a 502 AppError when the request itself fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(searchVenues('Decherd', 'TN')).rejects.toBeInstanceOf(AppError);
  });
});

describe('labelBySearchedCity', () => {
  const base: Omit<PlaceResult, 'place_id' | 'city' | 'state'> = {
    name: 'x', address: '', formatted_address: '', rating: null, user_ratings_total: 0, types: [], google_maps_url: '',
  };
  it('keeps Google order within each group', () => {
    const r = labelBySearchedCity(
      [
        { ...base, place_id: 'a', city: 'Winchester', state: 'TN' },
        { ...base, place_id: 'b', city: 'Decherd', state: 'TN' },
        { ...base, place_id: 'c', city: 'Manchester', state: 'TN' },
        { ...base, place_id: 'd', city: 'decherd', state: 'TN' },
      ],
      'Decherd',
      'TN',
    );
    expect(r.map(x => x.place_id)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('placeDetails', () => {
  it('returns the town from structured address components', async () => {
    respond({
      status: 'OK',
      result: {
        name: 'Cahoots Dancehall',
        website: 'https://example.com',
        formatted_phone_number: '(615) 470-8112',
        address_components: [
          { long_name: '427', short_name: '427', types: ['street_number'] },
          { long_name: 'South College Street', short_name: 'S College St', types: ['route'] },
          { long_name: 'Lebanon', short_name: 'Lebanon', types: ['locality', 'political'] },
          { long_name: 'Tennessee', short_name: 'TN', types: ['administrative_area_level_1', 'political'] },
          { long_name: '37087', short_name: '37087', types: ['postal_code'] },
        ],
      },
    });
    await expect(placeDetails('p-cahoots')).resolves.toEqual({
      name: 'Cahoots Dancehall',
      website: 'https://example.com',
      phone: '(615) 470-8112',
      city: 'Lebanon',
      state: 'TN',
      postal_code: '37087',
      street: '427 S College St',
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('address_components');
  });

  it('returns all nulls instead of throwing when Google has nothing', async () => {
    respond({ status: 'NOT_FOUND' });
    const d = await placeDetails('missing');
    expect(Object.values(d).every(v => v === null)).toBe(true);
  });
});
