// __tests__/api/expenseArchive.test.ts
// DELETE /api/expenses/[id] archives (never deletes); archived expenses can't be edited.
jest.mock('../../lib/supabase', () => ({ getServiceClient: jest.fn() }));

import handler from '../../pages/api/expenses/[id]';
import { getServiceClient } from '../../lib/supabase';
import type { NextApiRequest, NextApiResponse } from 'next';

const ID = '11111111-1111-4111-8111-111111111111';

function setup(existing: Record<string, unknown> | null) {
  const log = { deletes: 0, updates: [] as Record<string, unknown>[], filters: [] as Array<[string, string, unknown]> };
  const from = () => {
    const c: any = {};
    c.select = () => c;
    for (const m of ['eq', 'is']) c[m] = (col: string, v: unknown) => { log.filters.push([m, col, v]); return c; };
    c.maybeSingle = () => Promise.resolve({ data: existing, error: null });
    c.update = (r: Record<string, unknown>) => { log.updates.push(r); return c; };
    c.delete = () => { log.deletes++; return c; };
    c.single = () => Promise.resolve({ data: { id: ID }, error: null });
    c.then = (f: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(f);
    return c;
  };
  (getServiceClient as jest.Mock).mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } } }) },
    from,
  });
  return log;
}
async function call(method: string, body: Record<string, unknown> = {}) {
  const json = jest.fn();
  const end = jest.fn();
  const status = jest.fn().mockReturnValue({ json, end });
  const req = { method, query: { id: ID }, body, headers: { authorization: 'Bearer t' } } as unknown as NextApiRequest;
  await handler(req, { status, json, end } as unknown as NextApiResponse);
  return { status, json };
}

describe('/api/expenses/[id]', () => {
  it('DELETE archives the expense instead of deleting it', async () => {
    const log = setup({ id: ID, user_id: 'u-1', archived_at: null });
    const { status } = await call('DELETE');
    expect(status).toHaveBeenCalledWith(204);
    expect(log.deletes).toBe(0);
    expect(log.updates[0]).toEqual({ archived_at: expect.any(String), updated_at: expect.any(String) });
    expect(log.filters).toContainEqual(['eq', 'user_id', 'u-1']);
    expect(log.filters).toContainEqual(['is', 'archived_at', null]);
  });

  it('DELETE on an already-archived expense is a no-op', async () => {
    const log = setup({ id: ID, user_id: 'u-1', archived_at: '2026-10-01T00:00:00Z' });
    const { status } = await call('DELETE');
    expect(status).toHaveBeenCalledWith(204);
    expect(log.updates).toHaveLength(0);
  });

  it('refuses someone else\'s expense', async () => {
    const log = setup({ id: ID, user_id: 'someone-else', archived_at: null });
    const { status } = await call('DELETE');
    expect(status).toHaveBeenCalledWith(403);
    expect(log.updates).toHaveLength(0);
  });

  it('refuses editing an archived expense', async () => {
    const log = setup({ id: ID, user_id: 'u-1', archived_at: '2026-10-01T00:00:00Z' });
    const { status } = await call('PUT', { amount: 50 });
    expect(status).toHaveBeenCalledWith(409);
    expect(log.updates).toHaveLength(0);
  });

  it('still edits an active expense', async () => {
    const log = setup({ id: ID, user_id: 'u-1', archived_at: null });
    const { status } = await call('PUT', { amount: 50 });
    expect(status).not.toHaveBeenCalled(); // res.json() is called directly on success
    expect(log.updates[0]).toMatchObject({ amount: 50 });
  });
});
