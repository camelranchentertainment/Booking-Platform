import { getActId, getBandBookings, getBookingCounts } from '../../lib/bookingQueries';
import type { SupabaseClient } from '@supabase/supabase-js';

// Builds a thenable chain mock: every method returns `this`; await resolves to { data, error }
function buildChain(data: any, error: any = null) {
  const chain: any = {
    then(resolve: any) { return Promise.resolve({ data, error }).then(resolve); },
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    gte: () => chain,
    not: () => chain,
    limit: () => chain,
    order: () => chain,
    single: () => Promise.resolve({ data, error }),
  };
  return chain;
}

function buildSupabase(data: any, error: any = null) {
  return { from: () => buildChain(data, error) } as unknown as SupabaseClient;
}

// ─── getActId ────────────────────────────────────────────────────────────────

describe('getActId', () => {
  it('returns act_id when profile exists', async () => {
    const sb = buildSupabase({ act_id: 'act-123' });
    expect(await getActId(sb, 'user-1')).toBe('act-123');
  });

  it('returns null when profile is missing', async () => {
    const sb = buildSupabase(null);
    expect(await getActId(sb, 'user-1')).toBeNull();
  });

  it('returns null when act_id is absent', async () => {
    const sb = buildSupabase({ act_id: null });
    expect(await getActId(sb, 'user-1')).toBeNull();
  });
});

// ─── getBandBookings ──────────────────────────────────────────────────────────

describe('getBandBookings', () => {
  it('returns empty array for empty actId', async () => {
    const sb = buildSupabase([]);
    expect(await getBandBookings(sb, '')).toEqual([]);
  });

  it('returns bookings data', async () => {
    const rows = [{ id: 'b1', status: 'confirmed' }];
    const sb = buildSupabase(rows);
    expect(await getBandBookings(sb, 'act-1')).toEqual(rows);
  });

  it('returns empty array on error', async () => {
    const sb = buildSupabase(null, new Error('db error'));
    expect(await getBandBookings(sb, 'act-1')).toEqual([]);
  });

  it('returns empty array when data is null', async () => {
    const sb = buildSupabase(null);
    expect(await getBandBookings(sb, 'act-1')).toEqual([]);
  });

  it('passes status filter option', async () => {
    const rows = [{ id: 'b1', status: 'confirmed' }];
    const sb = buildSupabase(rows);
    const result = await getBandBookings(sb, 'act-1', { status: ['confirmed'] });
    expect(result).toEqual(rows);
  });

  it('passes upcomingOnly option', async () => {
    const rows = [{ id: 'b2', status: 'advancing' }];
    const sb = buildSupabase(rows);
    const result = await getBandBookings(sb, 'act-1', { upcomingOnly: true });
    expect(result).toEqual(rows);
  });

  it('passes limit option', async () => {
    const rows = [{ id: 'b3' }];
    const sb = buildSupabase(rows);
    const result = await getBandBookings(sb, 'act-1', { limit: 5 });
    expect(result).toEqual(rows);
  });
});

// ─── getBookingCounts ─────────────────────────────────────────────────────────

describe('getBookingCounts', () => {
  it('returns zeros for empty actId', async () => {
    const sb = buildSupabase([]);
    expect(await getBookingCounts(sb, '')).toEqual({
      confirmed: 0, upcoming: 0, pipeline: 0, earned: 0, potential: 0,
    });
  });

  it('returns zeros for empty bookings', async () => {
    const sb = buildSupabase([]);
    const counts = await getBookingCounts(sb, 'act-1');
    expect(counts).toEqual({ confirmed: 0, upcoming: 0, pipeline: 0, earned: 0, potential: 0 });
  });

  it('counts confirmed and advancing as confirmed', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const rows = [
      { status: 'confirmed', show_date: tomorrow, agreed_amount: 100, actual_amount_received: null },
      { status: 'advancing', show_date: tomorrow, agreed_amount: 200, actual_amount_received: null },
    ];
    const sb = buildSupabase(rows);
    const counts = await getBookingCounts(sb, 'act-1');
    expect(counts.confirmed).toBe(2);
  });

  it('counts earned from completed shows actual_amount_received', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const rows = [
      { status: 'completed', show_date: yesterday, agreed_amount: 500, actual_amount_received: 450 },
    ];
    const sb = buildSupabase(rows);
    const counts = await getBookingCounts(sb, 'act-1');
    expect(counts.earned).toBe(450);
  });

  it('treats null amounts as zero', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const rows = [
      { status: 'completed', show_date: yesterday, agreed_amount: null, actual_amount_received: null },
    ];
    const sb = buildSupabase(rows);
    const counts = await getBookingCounts(sb, 'act-1');
    expect(counts.earned).toBe(0);
  });

  it('excludes completed from pipeline count', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const rows = [
      { status: 'completed', show_date: yesterday, agreed_amount: 400, actual_amount_received: 350 },
      { status: 'confirmed', show_date: tomorrow, agreed_amount: 300, actual_amount_received: null },
      { status: 'pitch',     show_date: tomorrow, agreed_amount: 200, actual_amount_received: null },
    ];
    const sb = buildSupabase(rows);
    const counts = await getBookingCounts(sb, 'act-1');
    expect(counts.pipeline).toBe(2);
  });

  it('counts potential only from confirmed future shows', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const rows = [
      { status: 'confirmed', show_date: tomorrow,   agreed_amount: 500, actual_amount_received: null },
      { status: 'confirmed', show_date: yesterday,  agreed_amount: 300, actual_amount_received: null },
      { status: 'advancing', show_date: tomorrow,   agreed_amount: 200, actual_amount_received: null },
    ];
    const sb = buildSupabase(rows);
    const counts = await getBookingCounts(sb, 'act-1');
    expect(counts.potential).toBe(500);
  });
});
