jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../../lib/server/signupCodes', () => ({
  signupCodeExists: jest.fn(),
  redeemSignupCode: jest.fn(),
  notifyCodeRedeemed: jest.fn().mockResolvedValue(true),
}));

import handler from '../../../pages/api/auth/register';
import { getServiceClient } from '../../../lib/supabase';
import { notifyCodeRedeemed, redeemSignupCode, signupCodeExists } from '../../../lib/server/signupCodes';
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
  const actInsertChain = {
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(
      overrides.actInsertError
        ? { data: null, error: overrides.actInsertError }
        : { data: { id: 'act-456' }, error: null }
    ),
  };
  const updateChain = {
    eq: jest.fn().mockResolvedValue({ error: null }),
  };
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
    from: jest.fn().mockImplementation((table: string) => {
      if (table === 'acts') {
        return { insert: jest.fn().mockReturnValue(actInsertChain) };
      }
      if (table === 'profiles') {
        return {
          upsert: jest.fn().mockResolvedValue({ error: overrides.upsertError || null }),
          update: jest.fn().mockReturnValue(updateChain),
        };
      }
      return {
        upsert: jest.fn().mockResolvedValue({ error: overrides.upsertError || null }),
        insert: jest.fn().mockReturnValue(actInsertChain),
        update: jest.fn().mockReturnValue(updateChain),
      };
    }),
  };
}

const VALID_BODY = {
  email: 'band@example.com',
  password: 'secret123',
  role: 'band_admin',
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

  describe('signup code', () => {
    const withCode = { ...VALID_BODY, actName: 'The Wildcats', signupCode: ' betacrb26 ' };
    const redeemed = { code_id: 'c1', label: 'Founding beta', uses: 3, max_uses: 10, trial_ends_at: '2027-10-09T00:00:00Z' };

    it('rejects an unrecognised code before creating the account', async () => {
      const mock = buildAdminMock();
      (getServiceClient as jest.Mock).mockReturnValue(mock);
      (signupCodeExists as jest.Mock).mockResolvedValue(false);
      const { res, inner } = mockRes();
      await handler(mockReq('POST', withCode), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(inner.json).toHaveBeenCalledWith({ error: expect.stringContaining("isn't recognized") });
      expect(mock.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it('rejects a malformed code without querying the database', async () => {
      (getServiceClient as jest.Mock).mockReturnValue(buildAdminMock());
      const { res } = mockRes();
      await handler(mockReq('POST', { ...withCode, signupCode: 'no!' }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(signupCodeExists).not.toHaveBeenCalled();
    });

    it('applies a valid code and notifies the owner', async () => {
      (getServiceClient as jest.Mock).mockReturnValue(buildAdminMock());
      (signupCodeExists as jest.Mock).mockResolvedValue(true);
      (redeemSignupCode as jest.Mock).mockResolvedValue({ ok: true, result: redeemed });
      const { res, inner } = mockRes();
      await handler(mockReq('POST', withCode), res);
      expect(redeemSignupCode).toHaveBeenCalledWith(expect.anything(), 'BETACRB26', 'user-123');
      expect(notifyCodeRedeemed).toHaveBeenCalledWith(redeemed, expect.objectContaining({ email: 'band@example.com', actName: 'The Wildcats' }));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(inner.json).toHaveBeenCalledWith({ ok: true, codeApplied: true, trialEndsAt: redeemed.trial_ends_at });
    });

    it('still creates the account when the code has run out', async () => {
      (getServiceClient as jest.Mock).mockReturnValue(buildAdminMock());
      (signupCodeExists as jest.Mock).mockResolvedValue(true);
      (redeemSignupCode as jest.Mock).mockResolvedValue({ ok: false, reason: 'code_unavailable' });
      const { res, inner } = mockRes();
      await handler(mockReq('POST', withCode), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(inner.json).toHaveBeenCalledWith({ ok: true, codeApplied: false });
      expect(notifyCodeRedeemed).not.toHaveBeenCalled();
    });

    it('does not fail sign-up when redemption throws', async () => {
      const mock = buildAdminMock();
      (getServiceClient as jest.Mock).mockReturnValue(mock);
      (signupCodeExists as jest.Mock).mockResolvedValue(true);
      (redeemSignupCode as jest.Mock).mockRejectedValue(new Error('db down'));
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { res } = mockRes();
      await handler(mockReq('POST', withCode), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(mock.auth.admin.deleteUser).not.toHaveBeenCalled();
    });

    it('ignores the code entirely when none is entered', async () => {
      (getServiceClient as jest.Mock).mockReturnValue(buildAdminMock());
      const { res } = mockRes();
      await handler(mockReq('POST', { ...VALID_BODY, signupCode: '   ' }), res);
      expect(signupCodeExists).not.toHaveBeenCalled();
      expect(redeemSignupCode).not.toHaveBeenCalled();
    });
  });
});
