// __tests__/api/expensesBandWide.test.ts
// /api/expenses (GET, POST): the band's expenses, not just the caller's.
// Band admins only; the band comes from the caller's profile; a tour or
// booking from the body must belong to that band.
jest.mock('../../lib/supabase', () => ({ getServiceClient: jest.fn() }));

import handler from '../../pages/api/expenses/index';
import { getServiceClient } from '../../lib/supabase';
import type { NextApiRequest, NextApiResponse } from 'next';

type Opts = {
  profile?: Record<string, unknown>;
  ownedTour?: Record<string, unknown> | null;
  ownedBooking?: Record<string, unknown> | null;
};

function setup({ profile = { act_id: 'act-1', role: 'band_admin' }, ownedTour = { id: 't-1' }, ownedBooking = { id: 'b-1' } }: Opts = {}) {
  const log = { filters: [] as Array<[string, string, unknown]>, inserts: [] as Record<string, unknown>[] };
  const from = (table: string) => {
    const c: any = {};
    c.select = () => c;
    c.order = () => c;
    for (const m of ['eq', 'is', 'gte', 'lte']) c[m] = (col: string, v: unknown) => { if (table === 'expenses') log.filters.push([m, col, v]); return c; };
    c.insert = (r: Record<string, unknown>) => { log.inserts.push(r); return c; };
    c.maybeSingle = () => Promise.resolve({ data: table === 'tours' ? ownedTour : table === 'bookings' ? ownedBooking : null, error: null });
    c.single = () => Promise.resolve(table === 'profiles' ? { data: profile, error: null } : { data: { id: 'e-new' }, error: null });
    c.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'e-1' }], error: null }).then(f);
    return c;
  };
  (getServiceClient as jest.Mock).mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-2' } }, error: null }) },
    from,
  });
  return log;
}

async function call(method: string, opts: { body?: Record<string, unknown>; query?: Record<string, string> } = {}) {
  const json = jest.fn();
  const end = jest.fn();
  const status = jest.fn().mockReturnValue({ json, end });
  const req = { method, query: opts.query ?? {}, body: opts.body ?? {}, headers: { authorization: 'Bearer t' } } as unknown as NextApiRequest;
  await handler(req, { status, json, end, setHeader: jest.fn() } as unknown as NextApiResponse);
  return { status, json };
}

const goodBody = { tour_id: 't-1', expense_date: '2026-11-07', category: 'Gas / Mileage', amount: 84.5 };

beforeEach(() => jest.clearAllMocks());

describe('GET /api/expenses', () => {
  it("lists the band's expenses (by act, not by the caller)", async () => {
    const log = setup();
    const { status, json } = await call('GET', { query: { tour_id: 't-1' } });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ expenses: [{ id: 'e-1' }] });
    expect(log.filters).toContainEqual(['eq', 'act_id', 'act-1']);
    expect(log.filters).toContainEqual(['is', 'archived_at', null]);
    expect(log.filters).toContainEqual(['eq', 'tour_id', 't-1']);
    expect(log.filters.some(([, col]) => col === 'user_id')).toBe(false);
  });

  it('refuses a plain member (members never see money)', async () => {
    setup({ profile: { act_id: 'act-1', role: 'member' } });
    const { status } = await call('GET');
    expect(status).toHaveBeenCalledWith(403);
  });

  it('rejects malformed dates', async () => {
    setup();
    const { status } = await call('GET', { query: { start_date: 'yesterday' } });
    expect(status).toHaveBeenCalledWith(400);
  });
});

describe('POST /api/expenses', () => {
  it('adds the expense to the caller’s band', async () => {
    const log = setup();
    const { status } = await call('POST', { body: { ...goodBody, act_id: 'someone-elses-act' } });
    expect(status).toHaveBeenCalledWith(201);
    expect(log.inserts[0]).toMatchObject({ act_id: 'act-1', user_id: 'u-2', tour_id: 't-1', amount: 84.5 });
  });

  it("refuses another band's tour", async () => {
    const log = setup({ ownedTour: null });
    const { status } = await call('POST', { body: goodBody });
    expect(status).toHaveBeenCalledWith(404);
    expect(log.inserts).toHaveLength(0);
  });

  it("refuses another band's show", async () => {
    const log = setup({ ownedBooking: null });
    const { status } = await call('POST', { body: { ...goodBody, booking_id: 'other-show' } });
    expect(status).toHaveBeenCalledWith(404);
    expect(log.inserts).toHaveLength(0);
  });

  it('rejects a missing or non-positive amount', async () => {
    const log = setup();
    for (const amount of [0, -5, 'abc']) {
      const { status } = await call('POST', { body: { ...goodBody, amount } });
      expect(status).toHaveBeenCalledWith(400);
    }
    expect(log.inserts).toHaveLength(0);
  });
});
