// __tests__/api/booker/gmailCallback.test.ts
// The shared Google callback hands "bk." states to the agent handler, which must
// check the signature, the browser nonce and the agent profile before saving.

jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../../pages/api/auth/google/gmail-callback';
import { getServiceClient } from '../../../lib/supabase';
import { OAUTH_NONCE_COOKIE, signOAuthState } from '../../../lib/server/bookerGmail';

const SECRET = 'client-secret';
const BOOKER = 'booker-1';

beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = 'client-id';
  process.env.GOOGLE_CLIENT_SECRET = SECRET;
});

function setup({ booker = { id: BOOKER } as Record<string, unknown> | null } = {}) {
  const upserts: Array<Record<string, unknown>> = [];
  const filters: Array<Record<string, unknown>> = [];
  const client = {
    from: jest.fn((table: string) => {
      const f: Record<string, unknown> = {};
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (k: string, v: unknown) => ((f[k] = v), b);
      b.is = () => b;
      b.maybeSingle = () => {
        filters.push({ table, ...f });
        return Promise.resolve({ data: table === 'booker_profiles' ? booker : null, error: null });
      };
      b.upsert = (row: Record<string, unknown>) => (upserts.push(row), Promise.resolve({ error: null }));
      return b;
    }),
  };
  (getServiceClient as jest.Mock).mockReturnValue(client);
  global.fetch = jest.fn(async (url: string) => {
    if (String(url).includes('oauth2.googleapis.com/token')) return { json: async () => ({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }) };
    return { json: async () => ({ emailAddress: 'agent@gmail.com' }) };
  }) as unknown as typeof fetch;
  return { upserts, filters };
}

function call(query: Record<string, string>, cookie?: string) {
  const redirect = jest.fn();
  const setHeader = jest.fn();
  const req = { method: 'GET', query, headers: cookie ? { cookie } : {} } as unknown as NextApiRequest;
  const res = { redirect, setHeader, status: jest.fn().mockReturnValue({ end: jest.fn(), json: jest.fn() }) } as unknown as NextApiResponse;
  return { run: () => handler(req, res), redirect, setHeader };
}

const state = (over: Partial<{ u: string; b: string; n: string; e: number }> = {}) => signOAuthState({ u: 'user-1', b: BOOKER, n: 'nonce-1', e: Date.now() + 60_000, ...over }, SECRET);

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));

describe('agent Gmail callback', () => {
  it('saves the connection when state, nonce and profile all check out', async () => {
    const { upserts, filters } = setup();
    const { run, redirect, setHeader } = call({ code: 'c', state: state() }, `${OAUTH_NONCE_COOKIE}=nonce-1`);
    await run();
    expect(redirect).toHaveBeenCalledWith('/booker/settings?gmail=connected');
    expect(upserts[0]).toMatchObject({ booker_id: BOOKER, gmail_address: 'agent@gmail.com', google_refresh_token: 'rt' });
    expect(filters.find(f => f.table === 'booker_profiles')).toMatchObject({ id: BOOKER, user_id: 'user-1' });
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', expect.stringContaining('Max-Age=0'));
  });

  it('refuses when the browser nonce does not match (login CSRF)', async () => {
    const { upserts } = setup();
    const { run, redirect } = call({ code: 'c', state: state() }, `${OAUTH_NONCE_COOKIE}=someone-else`);
    await run();
    expect(redirect).toHaveBeenCalledWith('/booker/settings?gmail_error=session');
    expect(upserts).toHaveLength(0);
  });

  it('refuses a forged state', async () => {
    const { upserts } = setup();
    const forged = signOAuthState({ u: 'user-1', b: BOOKER, n: 'nonce-1', e: Date.now() + 60_000 }, 'wrong-secret');
    const { run, redirect } = call({ code: 'c', state: forged }, `${OAUTH_NONCE_COOKIE}=nonce-1`);
    await run();
    expect(redirect).toHaveBeenCalledWith('/booker/settings?gmail_error=expired');
    expect(upserts).toHaveLength(0);
  });

  it('refuses when the agent profile no longer belongs to that user', async () => {
    const { upserts } = setup({ booker: null });
    const { run, redirect } = call({ code: 'c', state: state() }, `${OAUTH_NONCE_COOKIE}=nonce-1`);
    await run();
    expect(redirect).toHaveBeenCalledWith('/booker/settings?gmail_error=forbidden');
    expect(upserts).toHaveLength(0);
  });

  it('reports a declined consent screen', async () => {
    setup();
    const { run, redirect } = call({ error: 'access_denied', state: state() });
    await run();
    expect(redirect).toHaveBeenCalledWith('/booker/settings?gmail_error=denied');
  });

  it('leaves band-flow states to the existing band handler', async () => {
    setup();
    const { run, redirect } = call({ error: 'access_denied', state: 'a:b' });
    await run();
    expect(redirect).toHaveBeenCalledWith('/settings?gmail_error=access_denied');
  });
});
