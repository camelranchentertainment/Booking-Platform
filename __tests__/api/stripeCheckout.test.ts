// __tests__/api/stripeCheckout.test.ts
jest.mock('../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../lib/platformSettings', () => ({ getSetting: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

const sessionsCreate = jest.fn();
const customersCreate = jest.fn();
jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: sessionsCreate } },
    customers: { create: customersCreate },
  })),
);

import handler from '../../pages/api/stripe/checkout';
import { getServiceClient } from '../../lib/supabase';
import { getSetting } from '../../lib/platformSettings';
import type { NextApiRequest, NextApiResponse } from 'next';

interface Profile {
  role: string;
  act_id: string | null;
  email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

const SETTINGS: Record<string, string> = {
  stripe_secret_key: 'sk_test_x',
  stripe_band_price_id: 'price_band',
  stripe_agent_price_id: 'price_agent',
};

function buildService(profile: Profile | null, hasAgentWorkspace = false) {
  const update = jest.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
  return {
    service: {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'u1@example.com' } }, error: null }) },
      from: jest.fn((table: string) => {
        if (table === 'booker_profiles') {
          const chain = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: () => Promise.resolve({ data: hasAgentWorkspace ? { id: 'b1' } : null, error: null }) };
          return chain;
        }
        const chain = { select: () => chain, eq: () => chain, maybeSingle: () => Promise.resolve({ data: profile, error: null }), update };
        return chain;
      }),
    },
    update,
  };
}

function req(): NextApiRequest {
  return { method: 'POST', headers: { authorization: 'Bearer t' }, body: { tier: 'agent' } } as unknown as NextApiRequest;
}

function res() {
  const r = {
    statusCode: 0, body: undefined as unknown, setHeader: jest.fn(), end: jest.fn(),
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return r as typeof r & NextApiResponse;
}

const band: Profile = { role: 'band_admin', act_id: 'act1', email: 'b@x.com', stripe_customer_id: 'cus_1', stripe_subscription_id: null };

describe('POST /api/stripe/checkout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSetting as jest.Mock).mockImplementation((k: string) => Promise.resolve(SETTINGS[k] ?? null));
    sessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/s' });
    customersCreate.mockResolvedValue({ id: 'cus_new' });
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('bills a band admin on the band price, ignoring the tier in the body', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(buildService(band).service);
    const r = res();
    await handler(req(), r);
    expect(r.statusCode).toBe(200);
    const args = sessionsCreate.mock.calls[0][0];
    expect(args.line_items[0].price).toBe('price_band');
    expect(args.metadata.tier).toBe('band_admin');
    expect(args.success_url).toContain('/band?subscribed=1');
  });

  it('bills an agent (no band + agent workspace) on the agent price', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(buildService({ ...band, act_id: null }, true).service);
    const r = res();
    await handler(req(), r);
    const args = sessionsCreate.mock.calls[0][0];
    expect(args.line_items[0].price).toBe('price_agent');
    expect(args.metadata.tier).toBe('agent');
    expect(args.success_url).toContain('/agent/settings?subscribed=1');
  });

  it('creates and saves a Stripe customer when the account has none', async () => {
    const { service, update } = buildService({ ...band, stripe_customer_id: null });
    (getServiceClient as jest.Mock).mockReturnValue(service);
    await handler(req(), res());
    expect(customersCreate).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ stripe_customer_id: 'cus_new' });
    expect(sessionsCreate.mock.calls[0][0].customer).toBe('cus_new');
  });

  it('refuses a second subscription', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(buildService({ ...band, stripe_subscription_id: 'sub_1' }).service);
    const r = res();
    await handler(req(), r);
    expect(r.statusCode).toBe(409);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it.each([['member'], ['superadmin']])('refuses a %s', async (role) => {
    (getServiceClient as jest.Mock).mockReturnValue(buildService({ ...band, role }).service);
    const r = res();
    await handler(req(), r);
    expect(r.statusCode).toBe(403);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('reports payments not set up when the price is missing', async () => {
    (getSetting as jest.Mock).mockImplementation((k: string) => Promise.resolve(k === 'stripe_secret_key' ? 'sk' : null));
    (getServiceClient as jest.Mock).mockReturnValue(buildService(band).service);
    const r = res();
    await handler(req(), r);
    expect(r.statusCode).toBe(500);
    expect(r.body).toEqual({ error: 'Payments are not set up yet. Please try again later.' });
  });

  it('rejects a missing token', async () => {
    const r = res();
    await handler({ method: 'POST', headers: {}, body: {} } as unknown as NextApiRequest, r);
    expect(r.statusCode).toBe(401);
  });
});
