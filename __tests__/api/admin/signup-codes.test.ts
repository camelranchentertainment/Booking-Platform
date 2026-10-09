jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../../lib/server/requireSuperadmin', () => ({ requireSuperadmin: jest.fn() }));
jest.mock('../../../lib/server/signupCodes', () => ({ redeemSignupCode: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import handler from '../../../pages/api/admin/signup-codes';
import { getServiceClient } from '../../../lib/supabase';
import { AppError } from '../../../lib/apiError';
import { requireSuperadmin } from '../../../lib/server/requireSuperadmin';
import { redeemSignupCode } from '../../../lib/server/signupCodes';
import type { NextApiRequest, NextApiResponse } from 'next';

const req = (method: string, body: unknown = {}) => ({ method, body, headers: {} }) as unknown as NextApiRequest;
function res() {
  const r: Record<string, jest.Mock> = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.end = jest.fn().mockReturnValue(r);
  return r as unknown as NextApiResponse & typeof r;
}

/** Table-aware stub: every chain is awaitable and resolves with the configured result. */
function service(opts: { insertError?: { code: string }; updateError?: { code: string }; profile?: { id: string } | null } = {}) {
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'eq', 'ilike']) c[m] = jest.fn().mockReturnValue(c);
    c.maybeSingle = jest.fn().mockResolvedValue(result);
    c.then = (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok);
    return c;
  };
  return {
    from: jest.fn((table: string) => {
      if (table === 'profiles') return chain({ data: opts.profile === undefined ? { id: 'p1' } : opts.profile, error: null });
      const base = chain({ data: [], error: null });
      return {
        ...base,
        insert: jest.fn().mockResolvedValue({ error: opts.insertError ?? null }),
        update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: opts.updateError ?? null }) }),
      };
    }),
  };
}

describe('/api/admin/signup-codes', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (requireSuperadmin as jest.Mock).mockResolvedValue('admin-1');
  });
  afterEach(() => jest.clearAllMocks());

  it('blocks non-superadmins', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(service());
    (requireSuperadmin as jest.Mock).mockRejectedValue(new AppError(403, 'Superadmin only'));
    const r = res();
    await handler(req('GET'), r);
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('lists codes', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(service());
    const r = res();
    await handler(req('GET'), r);
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith({ codes: [] });
  });

  it('rejects other methods', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(service());
    const r = res();
    await handler(req('DELETE'), r);
    expect(r.status).toHaveBeenCalledWith(405);
  });

  it('validates create input', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(service());
    const r = res();
    await handler(req('POST', { action: 'create', code: 'x', label: 'L', grantDays: 365, maxUses: 10 }), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('creates a code, normalising it', async () => {
    const svc = service();
    (getServiceClient as jest.Mock).mockReturnValue(svc);
    const r = res();
    await handler(req('POST', { action: 'create', code: ' spring26 ', label: 'Spring', grantDays: 90, maxUses: 5 }), r);
    expect(r.status).toHaveBeenCalledWith(200);
    const insert = (svc.from.mock.results[0].value as { insert: jest.Mock }).insert;
    expect(insert).toHaveBeenCalledWith({ code: 'SPRING26', label: 'Spring', grant_days: 90, max_uses: 5 });
  });

  it('returns 409 for a duplicate code', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(service({ insertError: { code: '23505' } }));
    const r = res();
    await handler(req('POST', { action: 'create', code: 'BETACRB26', label: 'x', grantDays: 365, maxUses: 10 }), r);
    expect(r.status).toHaveBeenCalledWith(409);
  });

  it('returns 409 when the limit is set below uses already taken', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(service({ updateError: { code: '23514' } }));
    const r = res();
    await handler(req('POST', { action: 'set_max_uses', id: '3f2b8c1e-9d4a-4c55-8a1e-2b7d6f0e1a11', maxUses: 1 }), r);
    expect(r.status).toHaveBeenCalledWith(409);
  });

  it('applies a code to an existing account by email', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(service());
    (redeemSignupCode as jest.Mock).mockResolvedValue({ ok: true, result: {} });
    const r = res();
    await handler(req('POST', { action: 'apply_to_account', code: 'betacrb26', email: 'Band@Example.com' }), r);
    expect(redeemSignupCode).toHaveBeenCalledWith(expect.anything(), 'BETACRB26', 'p1');
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it('404s when no account has that email', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(service({ profile: null }));
    const r = res();
    await handler(req('POST', { action: 'apply_to_account', code: 'BETACRB26', email: 'nobody@example.com' }), r);
    expect(r.status).toHaveBeenCalledWith(404);
  });

  it('409s with a plain message when the code cannot be redeemed', async () => {
    (getServiceClient as jest.Mock).mockReturnValue(service());
    (redeemSignupCode as jest.Mock).mockResolvedValue({ ok: false, reason: 'code_unavailable' });
    const r = res();
    await handler(req('POST', { action: 'apply_to_account', code: 'BETACRB26', email: 'band@example.com' }), r);
    expect(r.status).toHaveBeenCalledWith(409);
  });
});
