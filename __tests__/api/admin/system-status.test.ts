// The status card must report keys saved in Platform Setup, not just env vars.
jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../../lib/platformSettings', () => ({ getSetting: jest.fn() }));

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../../pages/api/admin/system-status';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

function service(role: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: () => Promise.resolve({ data: { role }, error: null }),
    then: (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: jest.fn(() => chain),
  };
}

function run() {
  const json = jest.fn();
  const res = { status: jest.fn().mockReturnValue({ json, end: jest.fn() }), json } as unknown as NextApiResponse;
  const req = { method: 'GET', headers: { authorization: 'Bearer t' } } as unknown as NextApiRequest;
  return { json, res, req };
}

describe('GET /api/admin/system-status', () => {
  const env = { ...process.env };
  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.RESEND_API_KEY;
    (getSetting as jest.Mock).mockReset();
  });
  afterAll(() => { process.env = env; });

  it('reports Stripe and Resend as set when the keys are saved in settings only', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(service('superadmin'));
    (getSetting as jest.Mock).mockImplementation(async (k: string) =>
      k === 'stripe_secret_key' ? 'sk_live_x' : k === 'resend_api_key' ? 're_x' : null);
    const { json, res, req } = run();
    await handler(req, res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ stripe: true, resend: true, googleMaps: false }));
  });

  it('reports them as not set when neither place has them', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(service('superadmin'));
    (getSetting as jest.Mock).mockResolvedValue(null);
    const { json, res, req } = run();
    await handler(req, res);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ stripe: false, resend: false }));
  });

  it('refuses anyone but the superadmin', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(service('band_admin'));
    const { res, req } = run();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
