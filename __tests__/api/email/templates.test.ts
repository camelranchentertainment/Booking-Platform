// __tests__/api/email/templates.test.ts
jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import handler from '../../../pages/api/email/templates';
import { getServiceClient } from '../../../lib/supabase';
import type { NextApiRequest, NextApiResponse } from 'next';

const ACT = 'act-1';

function req(method: string, body: unknown = {}, token: string | null = 'tok'): NextApiRequest {
  return { method, body, query: {}, headers: token ? { authorization: `Bearer ${token}` } : {} } as unknown as NextApiRequest;
}
function res() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const setHeader = jest.fn();
  return { r: { status, json, setHeader } as unknown as NextApiResponse, status, json };
}

interface Calls { filters: Array<[string, string, unknown]>; inserts: unknown[]; updates: unknown[]; deletes: number }

function setup(opts: { role?: string; existing?: { id: string } | null } = {}) {
  const calls: Calls = { filters: [], inserts: [], updates: [], deletes: 0 };
  const saved = { id: 't-1', name: 'Pitch', subject: 'S', body: 'B', updated_at: 'now' };

  const tplChain = () => {
    const c: any = {};
    for (const m of ['select', 'order']) c[m] = () => c;
    for (const m of ['eq', 'ilike']) c[m] = (col: string, val: unknown) => { calls.filters.push([m, col, val]); return c; };
    c.insert = (row: unknown) => { calls.inserts.push(row); return c; };
    c.update = (row: unknown) => { calls.updates.push(row); return c; };
    c.delete = () => { calls.deletes++; return c; };
    c.maybeSingle = () => Promise.resolve({ data: opts.existing ?? null, error: null });
    c.single = () => Promise.resolve({ data: saved, error: null });
    c.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: [saved], error: null }).then(f);
    return c;
  };
  const profileChain: any = {
    select: () => profileChain, eq: () => profileChain,
    single: () => Promise.resolve({ data: { act_id: ACT, role: opts.role ?? 'band_admin' }, error: null }),
  };
  (getServiceClient as jest.Mock).mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
    from: (t: string) => (t === 'profiles' ? profileChain : tplChain()),
  });
  return calls;
}

describe('/api/email/templates', () => {
  it('refuses Members', async () => {
    setup({ role: 'member' });
    const { r, status } = res();
    await handler(req('GET'), r);
    expect(status).toHaveBeenCalledWith(403);
  });

  it('refuses a missing token', async () => {
    setup();
    const { r, status } = res();
    await handler(req('GET', {}, null), r);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('lists only the caller\'s band templates (act from the profile)', async () => {
    const calls = setup();
    const { r, json } = res();
    await handler(req('GET'), r);
    expect(calls.filters).toContainEqual(['eq', 'act_id', ACT]);
    expect(json.mock.calls[0][0].templates).toHaveLength(1);
  });

  it('saves a new titled template to the caller\'s band, ignoring any actId in the body', async () => {
    const calls = setup();
    const { r, status } = res();
    await handler(req('POST', { name: 'Brewery pitch', subject: 'Hi', body: 'Hello', actId: 'someone-else' }), r);
    expect(status).toHaveBeenCalledWith(200);
    expect(calls.inserts[0]).toMatchObject({ act_id: ACT, name: 'Brewery pitch', subject: 'Hi', body: 'Hello' });
  });

  it('requires a title and a body', async () => {
    setup();
    const a = res(); await handler(req('POST', { name: '  ', body: 'x' }), a.r);
    expect(a.status).toHaveBeenCalledWith(400);
    const b = res(); await handler(req('POST', { name: 'T', body: '' }), b.r);
    expect(b.status).toHaveBeenCalledWith(400);
  });

  it('returns 409 EXISTS for a taken title, and replaces it when overwrite is true', async () => {
    let calls = setup({ existing: { id: 't-9' } });
    const a = res();
    await handler(req('POST', { name: 'Pitch', body: 'x' }), a.r);
    expect(a.status).toHaveBeenCalledWith(409);
    expect(a.json.mock.calls[0][0].code).toBe('EXISTS');
    expect(calls.updates).toHaveLength(0);

    calls = setup({ existing: { id: 't-9' } });
    const b = res();
    await handler(req('POST', { name: 'Pitch', body: 'new', overwrite: true }), b.r);
    expect(b.status).toHaveBeenCalledWith(200);
    expect(calls.updates[0]).toMatchObject({ body: 'new' });
    expect(calls.filters).toContainEqual(['eq', 'act_id', ACT]);
  });

  it('deletes only within the caller\'s band', async () => {
    const calls = setup();
    const { r, status } = res();
    await handler(req('DELETE', { id: '44444444-4444-4444-8444-444444444444' }), r);
    expect(status).toHaveBeenCalledWith(200);
    expect(calls.deletes).toBe(1);
    expect(calls.filters).toContainEqual(['eq', 'act_id', ACT]);
  });
});
