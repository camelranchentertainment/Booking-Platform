// __tests__/api/booker/venueAdd.test.ts
// The venue's town is saved from Google's structured address, not from what
// the browser posts: a result found by searching "Decherd" that is really in
// Lebanon must be saved as Lebanon.

jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../../lib/server/requireBooker', () => ({ requireBooker: jest.fn().mockResolvedValue({ bookerId: 'bk-1' }) }));
jest.mock('../../../lib/server/googlePlaces', () => ({ placeDetails: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../../pages/api/booker/venues/add';
import { getServiceClient } from '../../../lib/supabase';
import { placeDetails } from '../../../lib/server/googlePlaces';

const NO_DETAILS = { website: null, phone: null, name: null, city: null, state: null, postal_code: null, street: null };

function setup() {
  const inserts: Array<Record<string, unknown>> = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is']) chain[m] = () => chain;
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  chain.insert = (row: Record<string, unknown>) => {
    inserts.push(row);
    const after: Record<string, unknown> = {};
    after.select = () => after;
    after.single = () => Promise.resolve({ data: { id: 'v-1', ...row }, error: null });
    return after;
  };
  (getServiceClient as jest.Mock).mockReturnValue({ from: () => chain });
  return inserts;
}

function call(body: Record<string, unknown>) {
  const res = { statusCode: 0, body: undefined as unknown, setHeader: jest.fn() } as unknown as NextApiResponse & { statusCode: number; body: unknown };
  res.status = ((code: number) => {
    res.statusCode = code;
    return res;
  }) as NextApiResponse['status'];
  res.json = ((b: unknown) => {
    res.body = b;
    return res;
  }) as NextApiResponse['json'];
  const req = { method: 'POST', body, headers: { authorization: 'Bearer t' }, query: {} } as unknown as NextApiRequest;
  return handler(req, res).then(() => res);
}

describe('POST /api/booker/venues/add', () => {
  beforeEach(() => jest.clearAllMocks());

  it("saves Google's town even when the browser posts the searched town", async () => {
    const inserts = setup();
    (placeDetails as jest.Mock).mockResolvedValue({
      ...NO_DETAILS, name: 'Cahoots', city: 'Lebanon', state: 'TN', postal_code: '37087', street: '427 S College St',
    });
    const res = await call({ place_id: 'p-cahoots', name: 'Cahoots', city: 'Decherd', state: 'TN' });
    expect(res.statusCode).toBe(200);
    expect(inserts[0]).toMatchObject({ city: 'Lebanon', state: 'TN', postal_code: '37087', address: '427 S College St', booker_id: 'bk-1' });
  });

  it('falls back to the posted town (state normalised) when Google has no address', async () => {
    const inserts = setup();
    (placeDetails as jest.Mock).mockResolvedValue(NO_DETAILS);
    await call({ place_id: 'p-x', name: 'X', city: 'Lebanon', state: 'Tennessee', address: '1 Main St' });
    expect(inserts[0]).toMatchObject({ city: 'Lebanon', state: 'TN', address: '1 Main St', postal_code: null });
  });

  it('accepts a result whose town Google did not give, saving no town', async () => {
    const inserts = setup();
    (placeDetails as jest.Mock).mockResolvedValue(NO_DETAILS);
    const res = await call({ place_id: 'p-y', name: 'Y', city: null, state: null });
    expect(res.statusCode).toBe(200);
    expect(inserts[0]).toMatchObject({ city: null, state: null });
  });
});
