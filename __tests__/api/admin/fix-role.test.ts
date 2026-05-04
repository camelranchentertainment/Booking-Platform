jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));

import handler from '../../../pages/api/admin/fix-role';
import { getServiceClient } from '../../../lib/supabase';
import type { NextApiRequest, NextApiResponse } from 'next';

function mockReq(method: string, body: Record<string, any> = {}, token = 'valid-token'): NextApiRequest {
  return {
    method,
    body,
    headers: { authorization: `Bearer ${token}` },
  } as unknown as NextApiRequest;
}

function mockRes() {
  const inner = { json: jest.fn(), end: jest.fn() };
  const res = { status: jest.fn().mockReturnValue(inner), json: jest.fn() } as unknown as NextApiResponse;
  return { res, inner };
}

// Builds a service mock that returns different data based on which `from()` table is queried.
// First call to from() is always for auth (getUser), subsequent chain calls for user_profiles.
function buildServiceMock({ callerRole = 'superadmin', targetRole = 'act_admin' } = {}) {
  let callCount = 0;
  const profileChain = (role: string) => ({
    select: () => profileChain(role),
    eq: () => profileChain(role),
    update: () => profileChain(role),
    single: () => Promise.resolve({ data: { role }, error: null }),
    then(resolve: any) { return Promise.resolve({ data: null, error: null }).then(resolve); },
  });

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'caller-id' } } }),
    },
    from: jest.fn().mockImplementation(() => {
      callCount++;
      // First from('user_profiles') call = look up caller role
      // Second from('user_profiles') call = look up target role
      const role = callCount === 1 ? callerRole : targetRole;
      return profileChain(role);
    }),
  };
}

const VALID_BODY = { userId: 'target-id', newRole: 'act_admin' };

describe('POST /api/admin/fix-role', () => {
  afterEach(() => jest.clearAllMocks());

  it('rejects non-POST', async () => {
    const { res } = mockRes();
    await handler(mockReq('GET'), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('rejects when no auth token', async () => {
    const mock = buildServiceMock({ callerRole: 'superadmin' });
    (getServiceClient as jest.Mock).mockReturnValue(mock);
    const req = { method: 'POST', body: VALID_BODY, headers: {} } as unknown as NextApiRequest;
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(inner.json).toHaveBeenCalledWith({ error: 'Superadmin only' });
  });

  it('rejects non-superadmin caller', async () => {
    const mock = buildServiceMock({ callerRole: 'act_admin' });
    (getServiceClient as jest.Mock).mockReturnValue(mock);
    const { res, inner } = mockRes();
    await handler(mockReq('POST', VALID_BODY), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(inner.json).toHaveBeenCalledWith({ error: 'Superadmin only' });
  });

  it('rejects missing userId', async () => {
    const mock = buildServiceMock();
    (getServiceClient as jest.Mock).mockReturnValue(mock);
    const { res, inner } = mockRes();
    await handler(mockReq('POST', { newRole: 'act_admin' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(inner.json).toHaveBeenCalledWith({ error: 'userId and newRole required' });
  });

  it('rejects invalid role', async () => {
    const mock = buildServiceMock();
    (getServiceClient as jest.Mock).mockReturnValue(mock);
    const { res, inner } = mockRes();
    await handler(mockReq('POST', { userId: 'target-id', newRole: 'superadmin' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(inner.json).toHaveBeenCalledWith({ error: 'Invalid role' });
  });

  it('rejects changing superadmin target role', async () => {
    const mock = buildServiceMock({ callerRole: 'superadmin', targetRole: 'superadmin' });
    (getServiceClient as jest.Mock).mockReturnValue(mock);
    const { res, inner } = mockRes();
    await handler(mockReq('POST', VALID_BODY), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(inner.json).toHaveBeenCalledWith({ error: 'Cannot change superadmin role' });
  });

  it('returns ok for valid role change', async () => {
    const mock = buildServiceMock({ callerRole: 'superadmin', targetRole: 'act_admin' });
    (getServiceClient as jest.Mock).mockReturnValue(mock);
    const { res } = mockRes();
    await handler(mockReq('POST', VALID_BODY), res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
