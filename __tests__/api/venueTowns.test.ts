// __tests__/api/venueTowns.test.ts
// Request handling shared by /api/venues/towns and /api/booker/venues/towns.

jest.mock('../../lib/server/venueTownRepair', () => ({
  MAX_VENUES_PER_CHECK: 400,
  checkVenueTowns: jest.fn().mockResolvedValue({ fixes: [], checked: 0, noPlaceId: 0, unknown: 0, truncated: false }),
  applyVenueTowns: jest.fn().mockResolvedValue({ applied: [], failed: 0 }),
}));
jest.mock('../../lib/server/googlePlaces', () => ({ assertPlacesConfigured: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withHandler, AppError } from '../../lib/apiError';
import { handleVenueTowns } from '../../lib/server/venueTownRoute';
import { applyVenueTowns, checkVenueTowns } from '../../lib/server/venueTownRepair';
import { assertPlacesConfigured } from '../../lib/server/googlePlaces';

const service = {} as SupabaseClient;
const scope = { kind: 'band' as const, actId: 'act-1' };
const handler = withHandler((req, res) => handleVenueTowns(req, res, service, scope));
const ID = '11111111-1111-4111-8111-111111111111';

async function call(method: string, body?: Record<string, unknown>) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: method as 'GET', body });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData() || '{}') };
}

describe('handleVenueTowns', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET previews for the given scope', async () => {
    const r = await call('GET');
    expect(r.status).toBe(200);
    expect(checkVenueTowns).toHaveBeenCalledWith(service, scope);
    expect(applyVenueTowns).not.toHaveBeenCalled();
  });

  it('POST applies the chosen ids once each', async () => {
    const r = await call('POST', { ids: [ID, ID] });
    expect(r.status).toBe(200);
    expect(applyVenueTowns).toHaveBeenCalledWith(service, scope, [ID]);
  });

  it('rejects an empty or malformed selection with 400', async () => {
    expect((await call('POST', { ids: [] })).status).toBe(400);
    expect((await call('POST', { ids: ['not-a-uuid'] })).status).toBe(400);
    expect(applyVenueTowns).not.toHaveBeenCalled();
  });

  it('refuses other methods with 405', async () => {
    expect((await call('DELETE')).status).toBe(405);
  });

  it('says plainly when Google is not configured instead of reporting nothing to fix', async () => {
    (assertPlacesConfigured as jest.Mock).mockRejectedValueOnce(new AppError(501, 'Venue search is not configured yet.'));
    const r = await call('GET');
    expect(r.status).toBe(501);
    expect(checkVenueTowns).not.toHaveBeenCalled();
  });

  it('turns an unexpected failure into a 502 with a retry message', async () => {
    (checkVenueTowns as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const r = await call('GET');
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/try again/i);
  });
});
