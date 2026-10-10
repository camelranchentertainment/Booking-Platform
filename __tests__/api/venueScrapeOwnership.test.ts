// __tests__/api/venueScrapeOwnership.test.ts
// /api/venues/scrape uses the service role, so it must refuse members and
// refuse to touch a venue that belongs to another band.

jest.mock('../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../lib/platformSettings', () => ({ getSetting: jest.fn().mockResolvedValue('key') }));
jest.mock('@mendable/firecrawl-js', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@anthropic-ai/sdk', () => ({ __esModule: true, default: jest.fn() }));

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/venues/scrape';
import { getServiceClient } from '../../lib/supabase';
import FirecrawlApp from '@mendable/firecrawl-js';

function chain(result: unknown, filters: Array<[string, unknown]> = []) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = (col: string, val: unknown) => {
    filters.push([col, val]);
    return c;
  };
  c.single = () => Promise.resolve(result);
  c.maybeSingle = () => Promise.resolve(result);
  return c;
}

function setup(profile: Record<string, unknown> | null, venue: Record<string, unknown> | null) {
  const venueFilters: Array<[string, unknown]> = [];
  (getServiceClient as jest.Mock).mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn((table: string) => (table === 'profiles' ? chain({ data: profile, error: null }) : chain({ data: venue, error: null }, venueFilters))),
  });
  return { venueFilters };
}

function call(body: Record<string, unknown>) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json, end: jest.fn() });
  const req = { method: 'POST', body, headers: { authorization: 'Bearer tok' } } as unknown as NextApiRequest;
  return { run: () => handler(req, { status } as unknown as NextApiResponse), status };
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/venues/scrape ownership', () => {
  it('refuses a band member', async () => {
    setup({ role: 'member', act_id: 'act-1' }, null);
    const { run, status } = call({ url: 'https://hall.com', venueId: 'v-1' });
    await run();
    expect(status).toHaveBeenCalledWith(403);
    expect(FirecrawlApp).not.toHaveBeenCalled();
  });

  it("returns 404 for another band's venue before scanning anything", async () => {
    const { venueFilters } = setup({ role: 'band_admin', act_id: 'act-1' }, null);
    const { run, status } = call({ url: 'https://hall.com', venueId: 'someone-elses-venue' });
    await run();
    expect(status).toHaveBeenCalledWith(404);
    expect(venueFilters).toEqual(expect.arrayContaining([['id', 'someone-elses-venue'], ['act_id', 'act-1']]));
    expect(FirecrawlApp).not.toHaveBeenCalled();
  });
});
