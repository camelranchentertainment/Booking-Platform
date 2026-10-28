// __tests__/api/analyticsRoleGuard.test.ts
//
// /api/analytics returns the band's earnings and runs with the service role.
// It used to answer any signed-in user with an act, so a band Member could
// read the money. Members must get 403 before any band data is read; the
// recommendations route is gated the same way.

const mockGetUser = jest.fn();
let mockProfile: Record<string, unknown> | null = null;
const touched: string[] = [];

jest.mock('../../lib/supabase', () => ({
  getServiceClient: () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      touched.push(table);
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'in', 'order']) c[m] = () => c;
      c.single = () => Promise.resolve({ data: mockProfile, error: null });
      c.maybeSingle = () => Promise.resolve({ data: mockProfile, error: null });
      c.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(f);
      return c;
    },
  }),
}));
jest.mock('../../lib/platformSettings', () => ({ getSetting: jest.fn().mockResolvedValue(null) }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import type { NextApiRequest, NextApiResponse } from 'next';
import analyticsHandler from '../../pages/api/analytics';
import recommendationsHandler from '../../pages/api/analytics/recommendations';

function call(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>, method: string) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json, end: jest.fn() });
  const setHeader = jest.fn();
  const req = { method, query: {}, body: {}, headers: { authorization: 'Bearer tok' } } as unknown as NextApiRequest;
  return handler(req, { status, json, setHeader } as unknown as NextApiResponse).then(() => ({ status, json }));
}

describe('analytics routes are band-admin only', () => {
  beforeEach(() => {
    touched.length = 0;
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  });

  it.each([
    ['GET /api/analytics', analyticsHandler, 'GET'],
    ['POST /api/analytics/recommendations', recommendationsHandler, 'POST'],
  ])('%s refuses a band Member before reading band data', async (_name, handler, method) => {
    mockProfile = { act_id: 'act-1', role: 'member' };
    const { status } = await call(handler, method);
    expect(status).toHaveBeenCalledWith(403);
    expect(touched).toEqual(['profiles']);
  });

  it('GET /api/analytics answers a band admin', async () => {
    mockProfile = { act_id: 'act-1', role: 'band_admin' };
    const { status, json } = await call(analyticsHandler, 'GET');
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toEqual(expect.objectContaining({ funnel: expect.any(Array), months: expect.any(Array) }));
  });

  it('recommendations says plainly when AI is not configured', async () => {
    mockProfile = { act_id: 'act-1', role: 'band_admin' };
    const { status } = await call(recommendationsHandler, 'POST');
    expect(status).toHaveBeenCalledWith(503);
  });
});
