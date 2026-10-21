// __tests__/api/accountDelete.test.ts
jest.mock('../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import handler from '../../pages/api/account/delete';
import { getServiceClient } from '../../lib/supabase';
import { BLOCKING_USER_REFERENCES } from '../../lib/server/accountDeletion';
import type { NextApiRequest, NextApiResponse } from 'next';

interface Profile {
  role: string;
  subscription_status?: string | null;
  stripe_subscription_id?: string | null;
}

interface MockOptions {
  user?: { id: string } | null;
  profile?: Profile | null;
  ownedActs?: number;
  /** "table.column" -> row count; anything not listed counts 0 */
  references?: Record<string, number>;
  deleteError?: { message: string } | null;
}

/** Service-role client mock: profile read, head-count reads, auth admin delete. */
function buildService(opts: MockOptions = {}) {
  const {
    user = { id: 'user-1' },
    profile = { role: 'member', subscription_status: null, stripe_subscription_id: null },
    ownedActs = 0,
    references = {},
    deleteError = null,
  } = opts;

  const deleteUser = jest.fn().mockResolvedValue({ error: deleteError });

  const from = jest.fn((table: string) => {
    let column = '';
    const chain = {
      select: () => chain,
      eq: (col: string) => {
        column = col;
        return chain;
      },
      maybeSingle: () => Promise.resolve({ data: profile, error: null }),
      then: (resolve: (v: { count: number; error: null }) => unknown) => {
        const count = table === 'acts' ? ownedActs : references[`${table}.${column}`] ?? 0;
        return Promise.resolve({ count, error: null }).then(resolve);
      },
    };
    return chain;
  });

  return {
    service: {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user }, error: user ? null : { message: 'bad' } }),
        admin: { deleteUser },
      },
      from,
    },
    deleteUser,
  };
}

function mockReq(method = 'DELETE', token: string | null = 'tok'): NextApiRequest {
  return {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as NextApiRequest;
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    setHeader: jest.fn(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    end: jest.fn(),
  };
  return res as typeof res & NextApiResponse;
}

describe('DELETE /api/account/delete', () => {
  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('rejects other methods', async () => {
    const res = mockRes();
    await handler(mockReq('POST'), res);
    expect(res.statusCode).toBe(405);
  });

  it('rejects a missing token', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(buildService().service);
    const res = mockRes();
    await handler(mockReq('DELETE', null), res);
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid session', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(buildService({ user: null }).service);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res.statusCode).toBe(401);
  });

  it('deletes a member with no linked records', async () => {
    const { service, deleteUser } = buildService();
    (getServiceClient as jest.Mock).mockReturnValue(service);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('never deletes a superadmin', async () => {
    const { service, deleteUser } = buildService({ profile: { role: 'superadmin' } });
    (getServiceClient as jest.Mock).mockReturnValue(service);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'SUPERADMIN' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('blocks a band admin until the band is handed off', async () => {
    const { service, deleteUser } = buildService({ profile: { role: 'band_admin' } });
    (getServiceClient as jest.Mock).mockReturnValue(service);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'BAND_ADMIN_HANDOFF_REQUIRED' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('blocks anyone who still owns an act', async () => {
    const { service, deleteUser } = buildService({ ownedActs: 1 });
    (getServiceClient as jest.Mock).mockReturnValue(service);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res.body).toMatchObject({ code: 'BAND_ADMIN_HANDOFF_REQUIRED' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it.each([['trialing'], ['active'], ['cancelled'], [null]])(
    'deletes a member whose status is %s but who has no Stripe subscription',
    async (status) => {
      // Registration sets every account to 'trialing' and comped accounts are
      // 'active' without Stripe — neither can be billed, so neither may block.
      const { service, deleteUser } = buildService({
        profile: { role: 'member', subscription_status: status, stripe_subscription_id: null },
      });
      (getServiceClient as jest.Mock).mockReturnValue(service);
      const res = mockRes();
      await handler(mockReq(), res);
      expect(res.statusCode).toBe(200);
      expect(deleteUser).toHaveBeenCalledWith('user-1');
    },
  );

  it('blocks an account with a live Stripe subscription', async () => {
    const { service, deleteUser } = buildService({
      profile: { role: 'member', subscription_status: 'active', stripe_subscription_id: 'sub_123' },
    });
    (getServiceClient as jest.Mock).mockReturnValue(service);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'SUBSCRIPTION_ACTIVE' });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it.each(BLOCKING_USER_REFERENCES.map(({ table, column }) => [`${table}.${column}`]))(
    'blocks when the user is referenced by %s',
    async (ref) => {
      const { service, deleteUser } = buildService({ references: { [ref]: 1 } });
      (getServiceClient as jest.Mock).mockReturnValue(service);
      const res = mockRes();
      await handler(mockReq(), res);
      expect(res.statusCode).toBe(409);
      expect(res.body).toMatchObject({ code: 'ACCOUNT_HAS_BAND_RECORDS' });
      expect(deleteUser).not.toHaveBeenCalled();
    },
  );

  it('returns 500 without leaking details when the delete fails', async () => {
    const { service } = buildService({ deleteError: { message: 'db exploded' } });
    (getServiceClient as jest.Mock).mockReturnValue(service);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
