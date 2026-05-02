import type { NextApiRequest, NextApiResponse } from 'next';

jest.mock('../../../lib/supabase', () => ({
  supabase: {},
  getServiceClient: jest.fn(),
}));

import handler from '../../../pages/api/admin/fix-role';
import { getServiceClient } from '../../../lib/supabase';

function mockReq(overrides: { method?: string; body?: Record<string, any>; headers?: Record<string, string> } = {}): NextApiRequest {
  return {
    method:  overrides.method  ?? 'POST',
    body:    overrides.body    ?? {},
    headers: overrides.headers ?? {},
  } as unknown as NextApiRequest;
}

function mockRes() {
  const inner = { json: jest.fn(), end: jest.fn() };
  const res = {
    status: jest.fn().mockReturnValue(inner),
    json:   jest.fn(),
    end:    jest.fn(),
  } as unknown as NextApiResponse;
  return { res, inner };
}

// Build a mock service client that simulates role lookups
function buildServiceMock({
  callerRole = 'superadmin',
  targetRole = 'act_admin',
}: {
  callerRole?: string;
  targetRole?: string;
} = {}) {
  const updateMock = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });

  const fromMock = jest.fn().mockImplementation((table: string) => {
    const singleValue = table === 'user_profiles' ? { role: targetRole } : null;
    return {
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      update: updateMock,
      single: jest.fn().mockResolvedValue({ data: singleValue }),
    };
  });

  const service = {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'caller-id' } } }),
    },
    from: fromMock,
  };

  // The first call to service.from('user_profiles').select('role').eq(id).single()
  // returns callerRole (auth check), the second returns targetRole (target check).
  let profileCallCount = 0;
  fromMock.mockImplementation((table: string) => {
    if (table === 'user_profiles') {
      profileCallCount++;
      const role = profileCallCount === 1 ? callerRole : targetRole;
      return {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        update: updateMock,
        single: jest.fn().mockResolvedValue({ data: { role } }),
      };
    }
    return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null }) };
  });

  (getServiceClient as jest.Mock).mockReturnValue(service);
  return { service, updateMock };
}

// ─── Method guard ─────────────────────────────────────────────────────────────

describe('POST /api/admin/fix-role — method guard', () => {
  it('returns 405 for GET', async () => {
    const req = mockReq({ method: 'GET' });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ─── Auth guard ───────────────────────────────────────────────────────────────

describe('POST /api/admin/fix-role — auth guard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 when no authorization header is provided', async () => {
    buildServiceMock({ callerRole: 'act_admin' });
    // No Bearer token → getUser returns null user
    const service = { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) }, from: jest.fn() };
    (getServiceClient as jest.Mock).mockReturnValue(service);

    const req = mockReq({ body: { userId: 'u1', newRole: 'member' } });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 when caller is not superadmin', async () => {
    buildServiceMock({ callerRole: 'act_admin' });
    const req = mockReq({
      headers: { authorization: 'Bearer some-token' },
      body: { userId: 'u1', newRole: 'member' },
    });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe('POST /api/admin/fix-role — validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildServiceMock({ callerRole: 'superadmin', targetRole: 'act_admin' });
  });

  it('returns 400 when userId is missing', async () => {
    const req = mockReq({
      headers: { authorization: 'Bearer tok' },
      body: { newRole: 'member' },
    });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(inner.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'userId and newRole required' }));
  });

  it('returns 400 when newRole is missing', async () => {
    const req = mockReq({
      headers: { authorization: 'Bearer tok' },
      body: { userId: 'u1' },
    });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for invalid role "agent"', async () => {
    const req = mockReq({
      headers: { authorization: 'Bearer tok' },
      body: { userId: 'u1', newRole: 'agent' },
    });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(inner.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid role' }));
  });

  it('returns 400 for invalid role "superadmin" (cannot assign via UI)', async () => {
    const req = mockReq({
      headers: { authorization: 'Bearer tok' },
      body: { userId: 'u1', newRole: 'superadmin' },
    });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(inner.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid role' }));
  });
});

// ─── Superadmin protection ────────────────────────────────────────────────────

describe('POST /api/admin/fix-role — superadmin protection', () => {
  it('returns 403 when trying to change a superadmin\'s role', async () => {
    buildServiceMock({ callerRole: 'superadmin', targetRole: 'superadmin' });
    const req = mockReq({
      headers: { authorization: 'Bearer tok' },
      body: { userId: 'superadmin-user-id', newRole: 'member' },
    });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(inner.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Cannot change superadmin role' }));
  });
});
