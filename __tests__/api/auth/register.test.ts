jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));

import handler from '../../../pages/api/auth/register';
import { getServiceClient } from '../../../lib/supabase';
import type { NextApiRequest, NextApiResponse } from 'next';

function mockReq(method: string, body: Record<string, any> = {}): NextApiRequest {
  return { method, body } as unknown as NextApiRequest;
}

function mockRes() {
  const inner = { json: jest.fn(), end: jest.fn() };
  const res = { status: jest.fn().mockReturnValue(inner), json: jest.fn() } as unknown as NextApiResponse;
  return { res, inner };
}

function buildAdminMock(overrides: Partial<{
  createUserError: any;
  upsertError: any;
  actInsertError: any;
}> = {}) {
  return {
    auth: {
      admin: {
        createUser: jest.fn().mockResolvedValue(
          overrides.createUserError
            ? { data: null, error: overrides.createUserError }
            : { data: { user: { id: 'user-123' } }, error: null }
        ),
        deleteUser: jest.fn().mockResolvedValue({}),
      },
    },
    from: jest.fn().mockReturnValue({
      upsert: jest.fn().mockResolvedValue({ error: overrides.upsertError || null }),
      insert: jest.fn().mockResolvedValue({ error: overrides.actInsertError || null }),
    }),
  };
}

const VALID_BODY = {
  email: 'band@example.com',
  password: 'secret123',
  role: 'act_admin',
  displayName: 'The Wildcats',
};

describe('POST /api/auth/register', () => {
  afterEach(() => jest.clearAllMocks());

  it('rejects non-POST', async () => {
    const { res, inner } = mockRes();
    await handler(mockReq('GET'), res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('rejects missing email', async () => {
    const { res, inner } = mockRes();
    await handler(mockReq('POST', { ...VALID_BODY, email: '' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(inner.json).toHaveBeenCalledWith({ error: 'Missing required fields' });
  });

  it('rejects missing password', async () => {
    const { res, inner } = mockRes();
    await handler(mockReq('POST', { ...VALID_BODY, password: '' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects invalid role', async () => {
    const { res, inner } = mockRes();
    await handler(mockReq('POST', { ...VALID_BODY, role: 'superadmin' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(inner.json).toHaveBeenCalledWith({ error: 'Invalid role' });
  });

  it('rejects invalid planTier', async () => {
    const { res, inner } = mockRes();
    await handler(mockReq('POST', { ...VALID_BODY, planTier: 'agent_tier' }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(inner.json).toHaveBeenCalledWith({ error: 'Invalid plan tier' });
  });

  it('returns 200 on successful registration', async () => {
    const mock = buildAdminMock();
    (getServiceClient as jest.Mock).mockReturnValue(mock);
    const { res } = mockRes();
    await handler(mockReq('POST', VALID_BODY), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('propagates auth creation error', async () => {
    const mock = buildAdminMock({ createUserError: { message: 'email taken' } });
    (getServiceClient as jest.Mock).mockReturnValue(mock);
    const { res, inner } = mockRes();
    await handler(mockReq('POST', VALID_BODY), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(inner.json).toHaveBeenCalledWith({ error: 'email taken' });
  });

  it('rolls back and returns 500 on profile upsert error', async () => {
    const mock = buildAdminMock({ upsertError: { message: 'db error' } });
    (getServiceClient as jest.Mock).mockReturnValue(mock);
    const { res, inner } = mockRes();
    await handler(mockReq('POST', VALID_BODY), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mock.auth.admin.deleteUser).toHaveBeenCalledWith('user-123');
  });

  it('creates act record when actName is provided', async () => {
    const mock = buildAdminMock();
    (getServiceClient as jest.Mock).mockReturnValue(mock);
    const { res } = mockRes();
    await handler(mockReq('POST', { ...VALID_BODY, actName: 'The Wildcats' }), res);
    expect(mock.from).toHaveBeenCalledWith('acts');
  });
});
