// __tests__/lib/statusSync.test.ts
//
// A tour target is not a show. syncBooking must never create a bookings row
// (that is what put every target on the calendar, dated on the tour's last day,
// and duplicated shows on confirm). It only moves an existing show to
// confirmed / cancelled, and never pulls an advanced show backwards.

import type { SupabaseClient } from '@supabase/supabase-js';
import { syncBooking } from '../../lib/statusSync';

type Call = { table: string; op: string; args: unknown[] };

function fakeClient(tv: Record<string, unknown> | null) {
  const calls: Call[] = [];
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const record = (op: string) => (...args: unknown[]) => {
      calls.push({ table, op, args });
      return b;
    };
    for (const op of ['select', 'eq', 'not', 'insert', 'update']) b[op] = record(op);
    b.maybeSingle = () => Promise.resolve({ data: table === 'tour_venues' ? tv : null, error: null });
    b.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(f);
    return b;
  };
  const client = { from: (t: string) => builder(t) } as unknown as SupabaseClient;
  return { client, calls };
}

const target = (status: string, venue_id: string | null = 'v-1') => ({
  id: 'tv-1', venue_id, tour_id: 't-1', status, tour: { id: 't-1', act_id: 'act-1' },
});

describe('syncBooking', () => {
  it.each(['target', 'follow_up'])('does nothing for a "%s" target (no calendar entry)', async (status) => {
    const { client, calls } = fakeClient(target(status));
    await syncBooking(client, 'tv-1', 'u-1');
    expect(calls.filter(c => c.table === 'bookings')).toEqual([]);
  });

  it.each(['target', 'follow_up', 'confirmed', 'declined', 'thank_you'])('never inserts a show for "%s"', async (status) => {
    const { client, calls } = fakeClient(target(status));
    await syncBooking(client, 'tv-1', 'u-1');
    expect(calls.some(c => c.op === 'insert')).toBe(false);
  });

  it('confirms the existing show for that band, tour and venue only, without pulling advanced shows back', async () => {
    const { client, calls } = fakeClient(target('confirmed'));
    await syncBooking(client, 'tv-1', 'u-1');
    const b = calls.filter(c => c.table === 'bookings');
    expect(b[0]).toEqual({ table: 'bookings', op: 'update', args: [{ status: 'confirmed' }] });
    expect(b).toEqual(expect.arrayContaining([
      { table: 'bookings', op: 'eq', args: ['venue_id', 'v-1'] },
      { table: 'bookings', op: 'eq', args: ['act_id', 'act-1'] },
      { table: 'bookings', op: 'eq', args: ['tour_id', 't-1'] },
      { table: 'bookings', op: 'not', args: ['status', 'in', '("confirmed","advancing","completed","cancelled")'] },
    ]));
  });

  it('cancels any open show when the target is declined', async () => {
    const { client, calls } = fakeClient(target('declined'));
    await syncBooking(client, 'tv-1', 'u-1');
    const b = calls.filter(c => c.table === 'bookings');
    expect(b[0]).toEqual({ table: 'bookings', op: 'update', args: [{ status: 'cancelled' }] });
    expect(b).toContainEqual({ table: 'bookings', op: 'not', args: ['status', 'in', '("completed","cancelled")'] });
  });

  it('does nothing when the target has no venue or the tour has no band', async () => {
    const noVenue = fakeClient(target('confirmed', null));
    await syncBooking(noVenue.client, 'tv-1', 'u-1');
    expect(noVenue.calls.filter(c => c.table === 'bookings')).toEqual([]);

    const noBand = fakeClient({ ...target('confirmed'), tour: { id: 't-1', act_id: null } });
    await syncBooking(noBand.client, 'tv-1', 'u-1');
    expect(noBand.calls.filter(c => c.table === 'bookings')).toEqual([]);
  });

  it('does nothing when the target is gone', async () => {
    const { client, calls } = fakeClient(null);
    await syncBooking(client, 'tv-1', 'u-1');
    expect(calls.filter(c => c.table === 'bookings')).toEqual([]);
  });
});
