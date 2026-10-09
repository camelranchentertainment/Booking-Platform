// __tests__/api/admin/beta-applications.test.ts
jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import handler from '../../../pages/api/admin/beta-applications';
import { getServiceClient } from '../../../lib/supabase';
import { BETA_CAP } from '../../../lib/domain/betaProgram';
import type { NextApiRequest, NextApiResponse } from 'next';

const APP_ID = '0190f1e2-3a4b-7c5d-8e9f-0a1b2c3d4e5f';

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status: jest.fn(function (this: any, c: number) { this.statusCode = c; return this; }),
    json: jest.fn(function (this: any, b: unknown) { this.body = b; return this; }),
    setHeader: jest.fn(),
  };
  return res as unknown as NextApiResponse & { statusCode: number; body: any };
}

const req = (method: string, body: unknown = {}) =>
  ({ method, body, headers: { authorization: 'Bearer t' } } as unknown as NextApiRequest);

/**
 * Chainable query-builder stand-in. Every filter returns the chain; awaiting
 * it (or calling maybeSingle) resolves to `result`.
 */
function chain(result: unknown) {
  const c: any = {};
  for (const m of ['select', 'eq', 'is', 'ilike', 'order', 'limit', 'update']) c[m] = jest.fn(() => c);
  c.maybeSingle = jest.fn(() => Promise.resolve(result));
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return c;
}

function service({
  role = 'superadmin',
  rpcError = null as null | { message: string },
  declineRows = [{ id: APP_ID }],
} = {}) {
  const rpc = jest.fn().mockResolvedValue({ data: 1, error: rpcError });
  const from = jest.fn().mockImplementation((table: string) => {
    if (table === 'profiles') return chain({ data: { role }, error: null });
    // beta_applications: decline update → rows; grant lookup → approved app with no account
    const c = chain({ data: declineRows, error: null });
    c.maybeSingle = jest.fn(() => Promise.resolve({
      data: { id: APP_ID, email: 'jane@example.com', status: 'approved', granted_at: null }, error: null,
    }));
    return c;
  });
  const client = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'admin-id' } }, error: null }) },
    from,
    rpc,
  };
  (getServiceClient as jest.Mock).mockReturnValue(client);
  return client;
}

describe('/api/admin/beta-applications', () => {
  afterEach(() => jest.clearAllMocks());

  it('rejects callers who are not superadmin', async () => {
    service({ role: 'band_admin' });
    const res = mockRes();
    await handler(req('POST', { applicationId: APP_ID, action: 'approve' }), res);
    expect(res.statusCode).toBe(403);
  });

  it('rejects an invalid action or id with 400', async () => {
    service();
    const res = mockRes();
    await handler(req('POST', { applicationId: 'nope', action: 'approve' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('approves through the database function with the beta cap', async () => {
    const client = service();
    const res = mockRes();
    await handler(req('POST', { applicationId: APP_ID, action: 'approve' }), res);
    expect(client.rpc).toHaveBeenCalledWith('approve_beta_application', {
      p_application_id: APP_ID, p_reviewer: 'admin-id', p_cap: BETA_CAP,
    });
    expect(res.statusCode).toBe(200);
  });

  it('reports a full beta as 409 instead of approving an 11th band', async () => {
    service({ rpcError: { message: 'beta_full' } });
    const res = mockRes();
    await handler(req('POST', { applicationId: APP_ID, action: 'approve' }), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/already filled/);
  });

  it('only declines pending applications', async () => {
    service({ declineRows: [] });
    const res = mockRes();
    await handler(req('POST', { applicationId: APP_ID, action: 'decline' }), res);
    expect(res.statusCode).toBe(409);
  });

  it('rejects unsupported methods with 405', async () => {
    service();
    const res = mockRes();
    await handler(req('DELETE'), res);
    expect(res.statusCode).toBe(405);
  });
});
