import type { NextApiRequest, NextApiResponse } from 'next';

// Mock lib/supabase before importing handler (module-level createClient would fail without env vars)
jest.mock('../../../lib/supabase', () => ({
  supabase: {},
  getServiceClient: jest.fn(),
}));

import handler from '../../../pages/api/auth/register';
import { getServiceClient } from '../../../lib/supabase';

function mockReq(overrides: { method?: string; body?: Record<string, any> } = {}): NextApiRequest {
  return {
    method: overrides.method ?? 'POST',
    body:   overrides.body   ?? {},
    headers: {},
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

function buildAdminMock() {
  const insertMock = jest.fn().mockResolvedValue({ error: null });
  const upsertMock = jest.fn().mockResolvedValue({ error: null });
  const fromMock   = jest.fn().mockReturnValue({ insert: insertMock, upsert: upsertMock });
  const adminMock  = {
    auth: {
      admin: {
        createUser: jest.fn().mockResolvedValue({
          data:  { user: { id: 'new-user-id' } },
          error: null,
        }),
        deleteUser: jest.fn().mockResolvedValue({}),
      },
    },
    from: fromMock,
  };
  (getServiceClient as jest.Mock).mockReturnValue(adminMock);
  return adminMock;
}

// ─── Method guard ────────────────────────────────────────────────────────────

describe('POST /api/auth/register — method guard', () => {
  it('returns 405 for GET requests', async () => {
    const req = mockReq({ method: 'GET' });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ─── Input validation ────────────────────────────────────────────────────────

describe('POST /api/auth/register — validation', () => {
  it('returns 400 when email is missing', async () => {
    const req = mockReq({ body: { password: 'pass1234', role: 'act_admin', displayName: 'Jake' } });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(inner.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Missing required fields' }));
  });

  it('returns 400 when password is missing', async () => {
    const req = mockReq({ body: { email: 'a@b.com', role: 'act_admin', displayName: 'Jake' } });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when displayName is missing', async () => {
    const req = mockReq({ body: { email: 'a@b.com', password: 'pass1234', role: 'act_admin' } });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for invalid role', async () => {
    const req = mockReq({ body: { email: 'a@b.com', password: 'pass1234', role: 'agent', displayName: 'Jake' } });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(inner.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid role' }));
  });

  it('returns 400 for superadmin role (cannot self-register)', async () => {
    const req = mockReq({ body: { email: 'a@b.com', password: 'pass1234', role: 'superadmin', displayName: 'Jake' } });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(inner.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid role' }));
  });

  it('returns 400 for invalid planTier', async () => {
    const req = mockReq({ body: { email: 'a@b.com', password: 'pass1234', role: 'act_admin', displayName: 'Jake', planTier: 'agent_tier' } });
    const { res, inner } = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(inner.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid plan tier' }));
  });
});

// ─── Success path ─────────────────────────────────────────────────────────────

describe('POST /api/auth/register — success', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildAdminMock();
  });

  it('returns 200 for a valid act_admin registration with act name', async () => {
    const req = mockReq({
      body: { email: 'jake@band.com', password: 'secure123', role: 'act_admin', displayName: 'Jake', actName: 'The Jakes', planTier: 'band_admin' },
    });
    const { res, inner } = mockRes();
    await handler(req, res);
    // handler uses res.status(200).json({ ok: true })
    expect(inner.json).toHaveBeenCalledWith({ ok: true });
  });

  it('creates an act record when actName is provided for act_admin', async () => {
    const admin = buildAdminMock();
    const req = mockReq({
      body: { email: 'jake@band.com', password: 'secure123', role: 'act_admin', displayName: 'Jake', actName: 'The Jakes' },
    });
    const { res } = mockRes();
    await handler(req, res);
    expect(admin.from).toHaveBeenCalledWith('acts');
  });

  it('does not create an act record when actName is omitted', async () => {
    const admin = buildAdminMock();
    const req = mockReq({
      body: { email: 'jake@band.com', password: 'secure123', role: 'act_admin', displayName: 'Jake' },
    });
    const { res } = mockRes();
    await handler(req, res);
    // from('acts') is only called if actName is truthy
    const actsCalls = (admin.from as jest.Mock).mock.calls.filter((c: any[]) => c[0] === 'acts');
    expect(actsCalls.length).toBe(0);
  });
});
