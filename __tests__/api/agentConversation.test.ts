// __tests__/api/agentConversation.test.ts
// /api/agent-conversation: day-by-day chats, read-only history, caller scoping.

jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

type Call = { method: string; args: unknown[] };
const calls: Call[] = [];
let nextResult: { data: unknown; error: unknown } = { data: null, error: null };

/** A chainable stand-in for the Supabase query builder that records every call. */
function builder(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'delete']) {
    chain[m] = (...args: unknown[]) => { calls.push({ method: m, args }); return chain; };
  }
  chain.upsert = (...args: unknown[]) => { calls.push({ method: 'upsert', args }); return Promise.resolve(nextResult); };
  chain.maybeSingle = () => Promise.resolve(nextResult);
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(nextResult).then(resolve);
  return chain;
}

jest.mock('../../lib/supabase', () => ({
  getServiceClient: () => ({ from: (t: string) => { calls.push({ method: 'from', args: [t] }); return builder(); } }),
}));

const requireBandAdmin = jest.fn();
jest.mock('../../lib/server/requireBandAdmin', () => ({
  requireBandAdmin: (...args: unknown[]) => requireBandAdmin(...args),
}));

import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/agent-conversation';
import { AppError } from '../../lib/apiError';

const FIXED_NOW = new Date('2026-10-26T17:00:00Z');

async function call(method: string, query: Record<string, string> = {}, body?: Record<string, unknown>) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: method as 'GET', query, body });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData() || '{}') };
}

const eqArgs = () => calls.filter(c => c.method === 'eq').map(c => c.args);

describe('/api/agent-conversation', () => {
  beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(FIXED_NOW); });
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    calls.length = 0;
    nextResult = { data: null, error: null };
    requireBandAdmin.mockReset().mockResolvedValue({ userId: 'user-1', actId: 'act-1', role: 'band_admin' });
  });

  it('GET loads one day, scoped to the caller from their profile', async () => {
    nextResult = { data: { messages: [{ role: 'user', content: 'hi' }], updated_at: 'x' }, error: null };
    const r = await call('GET', { day: '2026-10-26', act_id: 'someone-else' });
    expect(r.status).toBe(200);
    expect(r.body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(r.body.readOnly).toBe(false);
    expect(eqArgs()).toEqual([['user_id', 'user-1'], ['act_id', 'act-1'], ['day', '2026-10-26']]);
  });

  it('GET marks an older day as read-only', async () => {
    const r = await call('GET', { day: '2026-10-20' });
    expect(r.status).toBe(200);
    expect(r.body.readOnly).toBe(true);
    expect(r.body.messages).toEqual([]);
  });

  it('GET ?view=days lists past days newest first and skips greeting-only days', async () => {
    nextResult = {
      data: [
        { day: '2026-10-25', messages: [{ role: 'user', content: 'Book Tulsa' }, { role: 'assistant', content: 'ok' }], updated_at: 'a' },
        { day: '2026-10-24', messages: [{ role: 'assistant', content: 'Good morning' }], updated_at: 'b' },
      ],
      error: null,
    };
    const r = await call('GET', { view: 'days' });
    expect(r.status).toBe(200);
    expect(r.body.days).toEqual([{ day: '2026-10-25', preview: 'Book Tulsa', messageCount: 2, updatedAt: 'a' }]);
    expect(calls.find(c => c.method === 'order')?.args).toEqual(['day', { ascending: false }]);
  });

  it('GET without a valid day is a 400', async () => {
    expect((await call('GET')).status).toBe(400);
    expect((await call('GET', { day: '2026-02-30' })).status).toBe(400);
  });

  it("PUT saves today's chat keyed by day", async () => {
    const r = await call('PUT', {}, { day: '2026-10-26', messages: [{ role: 'user', content: 'hi' }, { role: 'system', content: 'x' }] });
    expect(r.status).toBe(200);
    const upsert = calls.find(c => c.method === 'upsert')!;
    expect(upsert.args[0]).toMatchObject({ user_id: 'user-1', act_id: 'act-1', day: '2026-10-26', messages: [{ role: 'user', content: 'hi' }] });
    expect(upsert.args[1]).toEqual({ onConflict: 'user_id,act_id,day' });
  });

  it('PUT refuses to rewrite a past day', async () => {
    const r = await call('PUT', {}, { day: '2026-10-20', messages: [] });
    expect(r.status).toBe(409);
    expect(calls.some(c => c.method === 'upsert')).toBe(false);
  });

  it('PUT rejects a missing message list', async () => {
    expect((await call('PUT', {}, { day: '2026-10-26' })).status).toBe(400);
  });

  it("DELETE clears only today's chat; past days are kept", async () => {
    expect((await call('DELETE', { day: '2026-10-26' })).status).toBe(200);
    expect(eqArgs()).toEqual([['user_id', 'user-1'], ['act_id', 'act-1'], ['day', '2026-10-26']]);
    calls.length = 0;
    expect((await call('DELETE', { day: '2026-10-01' })).status).toBe(409);
    expect(calls.some(c => c.method === 'delete')).toBe(false);
  });

  it('turns away non-admins before touching the table', async () => {
    requireBandAdmin.mockRejectedValueOnce(new AppError(403, 'Forbidden'));
    const r = await call('GET', { day: '2026-10-26' });
    expect(r.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('reports a database failure as a 500 without leaking details', async () => {
    nextResult = { data: null, error: { message: 'boom' } };
    const r = await call('GET', { day: '2026-10-26' });
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('Internal server error');
  });

  it('refuses other methods with 405', async () => {
    expect((await call('POST', {}, {})).status).toBe(405);
  });
});
