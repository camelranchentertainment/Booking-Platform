// __tests__/api/tourVenuesOwnership.test.ts
//
// POST /api/tours/venues uses the service role (bypasses RLS). It must refuse
// to link a venue that belongs to a different band than the tour, otherwise a
// band could attach — and then read through the venue join — another band's venue.

jest.mock('../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../lib/statusSync', () => ({ syncBooking: jest.fn().mockResolvedValue(undefined) }));

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/tours/venues';
import { getServiceClient } from '../../lib/supabase';
import { syncBooking } from '../../lib/statusSync';

type Result = { data: unknown; error: { message: string; code?: string } | null };

/** Minimal PostgREST-style chain that records filters and resolves to `result`. */
function chain(result: Result, filters: Array<[string, unknown]> = [], onInsert?: (row: unknown) => void) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = (col: string, val: unknown) => {
    filters.push([col, val]);
    return c;
  };
  c.insert = (row: unknown) => {
    onInsert?.(row);
    return c;
  };
  c.single = () => Promise.resolve(result);
  c.maybeSingle = () => Promise.resolve(result);
  return c;
}

function setup(opts: { tour: Record<string, unknown> | null; venue: Record<string, unknown> | null }) {
  const venueFilters: Array<[string, unknown]> = [];
  const inserts: unknown[] = [];
  (getServiceClient as jest.Mock).mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from: jest.fn((table: string) => {
      if (table === 'tours') return chain({ data: opts.tour, error: null });
      if (table === 'acts') return chain({ data: null, error: null });
      if (table === 'venues') return chain({ data: opts.venue, error: null }, venueFilters);
      if (table === 'tour_venues') {
        return chain({ data: { id: 'tv-1', venue: opts.venue }, error: null }, [], (row) => inserts.push(row));
      }
      throw new Error(`unexpected table ${table}`);
    }),
  });
  return { venueFilters, inserts };
}

function call(body: Record<string, unknown>) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json, end: jest.fn() });
  const req = { method: 'POST', body, headers: { authorization: 'Bearer tok' } } as unknown as NextApiRequest;
  return { run: () => handler(req, { status } as unknown as NextApiResponse), status, json };
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/tours/venues venue ownership', () => {
  it("returns 404 and links nothing when the venue belongs to another band", async () => {
    const { venueFilters, inserts } = setup({
      tour: { id: 't-1', act_id: 'act-1', created_by: 'u1' },
      venue: null, // ownership lookup (id + act_id) finds nothing
    });
    const { run, status } = call({ tour_id: 't-1', venue_id: 'other-bands-venue' });
    await run();
    expect(status).toHaveBeenCalledWith(404);
    expect(venueFilters).toEqual(expect.arrayContaining([['id', 'other-bands-venue'], ['act_id', 'act-1']]));
    expect(inserts).toEqual([]);
    expect(syncBooking).not.toHaveBeenCalled();
  });

  it('links a venue that belongs to the tour band', async () => {
    const { inserts } = setup({
      tour: { id: 't-1', act_id: 'act-1', created_by: 'u1' },
      venue: { id: 'own-venue' },
    });
    const { run, status } = call({ tour_id: 't-1', venue_id: 'own-venue' });
    await run();
    expect(status).toHaveBeenCalledWith(201);
    expect(inserts).toEqual([expect.objectContaining({ tour_id: 't-1', venue_id: 'own-venue' })]);
  });

  it('refuses a tour with no band rather than guessing', async () => {
    const { inserts } = setup({
      tour: { id: 't-1', act_id: null, created_by: 'u1' },
      venue: { id: 'v' },
    });
    const { run, status } = call({ tour_id: 't-1', venue_id: 'v' });
    await run();
    expect(status).toHaveBeenCalledWith(409);
    expect(inserts).toEqual([]);
  });
});
