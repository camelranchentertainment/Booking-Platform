// __tests__/api/booker/register.test.ts
jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../../lib/server/signupCodes', () => ({
  signupCodeExists: jest.fn(),
  redeemSignupCode: jest.fn(),
  notifyCodeRedeemed: jest.fn().mockResolvedValue(true),
}));

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../../pages/api/booker/register';
import { getServiceClient } from '../../../lib/supabase';
import { redeemSignupCode, signupCodeExists } from '../../../lib/server/signupCodes';

const VALID = { email: 'Agent@Example.com', password: 'longenough', displayName: 'Pat Booker', agencyName: 'Lone Star Booking' };

function req(method: string, body: Record<string, unknown> = {}): NextApiRequest {
  return { method, body } as unknown as NextApiRequest;
}

function res() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const setHeader = jest.fn();
  return { r: { status, setHeader } as unknown as NextApiResponse, status, json };
}

function admin(opts: { createErr?: string; profileErr?: boolean; bookerErr?: boolean } = {}) {
  const inserts: Record<string, unknown[]> = {};
  const client = {
    auth: {
      admin: {
        createUser: jest.fn().mockResolvedValue(opts.createErr ? { data: null, error: { message: opts.createErr } } : { data: { user: { id: 'u-1' } }, error: null }),
        deleteUser: jest.fn().mockResolvedValue({}),
      },
    },
    from: jest.fn((table: string) => ({
      upsert: jest.fn((row: unknown) => {
        (inserts[table] ??= []).push(row);
        return Promise.resolve({ error: opts.profileErr ? { message: 'x' } : null });
      }),
      insert: jest.fn((row: unknown) => {
        (inserts[table] ??= []).push(row);
        return Promise.resolve({ error: opts.bookerErr ? { message: 'x' } : null });
      }),
    })),
  };
  (getServiceClient as jest.Mock).mockReturnValue(client);
  return { client, inserts };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/booker/register', () => {
  it('rejects other methods', async () => {
    const { r, status } = res();
    await handler(req('GET'), r);
    expect(status).toHaveBeenCalledWith(405);
  });

  it('rejects invalid input before creating anything', async () => {
    const { client } = admin();
    const { r, status } = res();
    await handler(req('POST', { ...VALID, password: 'short' }), r);
    expect(status).toHaveBeenCalledWith(400);
    expect(client.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('creates a band-less profile and an agent profile', async () => {
    const { client, inserts } = admin();
    const { r, status, json } = res();
    await handler(req('POST', VALID), r);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ ok: true });
    expect(client.auth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'agent@example.com' }));
    expect(inserts.profiles?.[0]).toMatchObject({ id: 'u-1', role: 'band_admin', subscription_status: 'trialing' });
    expect(inserts.profiles?.[0]).not.toHaveProperty('act_id');
    expect(inserts.booker_profiles?.[0]).toMatchObject({ user_id: 'u-1', agency_name: 'Lone Star Booking' });
  });

  it('removes the half-made account when the agent profile fails', async () => {
    const { client } = admin({ bookerErr: true });
    const { r, status } = res();
    await handler(req('POST', VALID), r);
    expect(status).toHaveBeenCalledWith(500);
    expect(client.auth.admin.deleteUser).toHaveBeenCalledWith('u-1');
  });

  it('gives a clear message when the email is taken', async () => {
    admin({ createErr: 'A user with this email address has already been registered' });
    const { r, status, json } = res();
    await handler(req('POST', VALID), r);
    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].error).toMatch(/already exists/);
  });

  it('refuses an unknown signup code before creating the account', async () => {
    const { client } = admin();
    (signupCodeExists as jest.Mock).mockResolvedValue(false);
    const { r, status } = res();
    await handler(req('POST', { ...VALID, signupCode: 'nope1' }), r);
    expect(status).toHaveBeenCalledWith(400);
    expect(client.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it('applies a valid signup code', async () => {
    admin();
    (signupCodeExists as jest.Mock).mockResolvedValue(true);
    (redeemSignupCode as jest.Mock).mockResolvedValue({ ok: true, result: { label: 'Agent beta', uses: 1, max_uses: 5 } });
    const { r, json } = res();
    await handler(req('POST', { ...VALID, signupCode: 'agentbeta' }), r);
    expect(redeemSignupCode).toHaveBeenCalledWith(expect.anything(), 'AGENTBETA', 'u-1');
    expect(json).toHaveBeenCalledWith({ ok: true, codeApplied: true });
  });

  it('still succeeds when the code ran out after the check', async () => {
    admin();
    (signupCodeExists as jest.Mock).mockResolvedValue(true);
    (redeemSignupCode as jest.Mock).mockResolvedValue({ ok: false, reason: 'code_unavailable' });
    const { r, status, json } = res();
    await handler(req('POST', { ...VALID, signupCode: 'agentbeta' }), r);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ ok: true, codeApplied: false });
  });
});
