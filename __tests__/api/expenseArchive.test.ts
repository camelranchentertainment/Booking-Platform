// __tests__/api/expenseArchive.test.ts
// /api/expenses/[id]: DELETE archives (never deletes); archived expenses can't
// be edited; any admin of the band can work the band's expenses; members and
// other bands are refused.
jest.mock('../../lib/supabase', () => ({ getServiceClient: jest.fn() }));

import handler from '../../pages/api/expenses/[id]';
import { getServiceClient } from '../../lib/supabase';
import type { NextApiRequest, NextApiResponse } from 'next';

const ID = '11111111-1111-4111-8111-111111111111';

type Opts = {
  /** The expense as found for the caller's band (null = not in this band). */
  existing: Record<string, unknown> | null;
  profile?: Record<string, unknown>;
  ownedTour?: Record<string, unknown> | null;
};

function setup({ existing, profile = { act_id: 'act-1', role: 'band_admin' }, ownedTour = { id: 't-1' } }: Opts) {
  const log = { deletes: 0, updates: [] as Record<string, unknown>[], filters: [] as Array<[string, string, unknown]> };
  const from = (table: string) => {
    const c: any = {};
    c.select = () => c;
    for (const m of ['eq', 'is']) c[m] = (col: string, v: unknown) => { if (table === 'expenses') log.filters.push([m, col, v]); return c; };
    c.maybeSingle = () => Promise.resolve({
      data: table === 'profiles' ? profile : table === 'tours' ? ownedTour : existing,
      error: null,
    });
    c.single = () => Promise.resolve(table === 'profiles' ? { data: profile, error: null } : { data: { id: ID }, error: null });
    c.update = (r: Record<string, unknown>) => { log.updates.push(r); return c; };
    c.delete = () => { log.deletes++; return c; };
    c.then = (f: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(f);
    return c;
  };
  (getServiceClient as jest.Mock).mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-2' } }, error: null }) },
    from,
  });
  return log;
}
async function call(method: string, body: Record<string, unknown> = {}) {
  const json = jest.fn();
  const end = jest.fn();
  const status = jest.fn().mockReturnValue({ json, end });
  const req = { method, query: { id: ID }, body, headers: { authorization: 'Bearer t' } } as unknown as NextApiRequest;
  await handler(req, { status, json, end, setHeader: jest.fn() } as unknown as NextApiResponse);
  return { status, json };
}

beforeEach(() => jest.clearAllMocks());

describe('/api/expenses/[id]', () => {
  it('DELETE archives the expense instead of deleting it, scoped to the band', async () => {
    const log = setup({ existing: { id: ID, act_id: 'act-1', archived_at: null } });
    const { status } = await call('DELETE');
    expect(status).toHaveBeenCalledWith(204);
    expect(log.deletes).toBe(0);
    expect(log.updates[0]).toEqual({ archived_at: expect.any(String), updated_at: expect.any(String) });
    expect(log.filters).toContainEqual(['eq', 'act_id', 'act-1']);
    expect(log.filters).toContainEqual(['is', 'archived_at', null]);
  });

  it('DELETE on an already-archived expense is a no-op', async () => {
    const log = setup({ existing: { id: ID, act_id: 'act-1', archived_at: '2026-10-01T00:00:00Z' } });
    const { status } = await call('DELETE');
    expect(status).toHaveBeenCalledWith(204);
    expect(log.updates).toHaveLength(0);
  });

  it("answers 404 for another band's expense", async () => {
    const log = setup({ existing: null });
    const { status } = await call('DELETE');
    expect(status).toHaveBeenCalledWith(404);
    expect(log.updates).toHaveLength(0);
  });

  it('refuses a plain band member', async () => {
    const log = setup({ existing: { id: ID, act_id: 'act-1', archived_at: null }, profile: { act_id: 'act-1', role: 'member' } });
    const { status } = await call('PUT', { amount: 50 });
    expect(status).toHaveBeenCalledWith(403);
    expect(log.updates).toHaveLength(0);
  });

  it('refuses editing an archived expense', async () => {
    const log = setup({ existing: { id: ID, act_id: 'act-1', archived_at: '2026-10-01T00:00:00Z' } });
    const { status } = await call('PUT', { amount: 50 });
    expect(status).toHaveBeenCalledWith(409);
    expect(log.updates).toHaveLength(0);
  });

  it('lets any admin of the band edit an active expense', async () => {
    const log = setup({ existing: { id: ID, act_id: 'act-1', archived_at: null } });
    const { status } = await call('PUT', { amount: 50, id: 'ignored', user_id: 'ignored' });
    expect(status).toHaveBeenCalledWith(200);
    expect(log.updates[0]).toEqual({ amount: 50, updated_at: expect.any(String) });
  });

  it("refuses moving an expense onto another band's tour", async () => {
    const log = setup({ existing: { id: ID, act_id: 'act-1', archived_at: null }, ownedTour: null });
    const { status } = await call('PUT', { tour_id: 'other-band-tour' });
    expect(status).toHaveBeenCalledWith(404);
    expect(log.updates).toHaveLength(0);
  });

  it('rejects a zero or negative amount', async () => {
    const log = setup({ existing: { id: ID, act_id: 'act-1', archived_at: null } });
    const { status } = await call('PUT', { amount: 0 });
    expect(status).toHaveBeenCalledWith(400);
    expect(log.updates).toHaveLength(0);
  });
});
