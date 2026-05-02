import { getActId, getBandBookings, getBookingCounts } from '../../lib/bookingQueries';

// Build a thenable Supabase mock chain.
// Every method returns `this` so the chain is fluent.
// The object is thenable so `await chain.notOrEq(...)` resolves via chain.then().
// .order() and .single() are also directly awaitable (common end-of-chain calls).
function buildChain(data: any, error: any = null) {
  const result = { data, error };
  const chain: any = {
    select:     jest.fn().mockReturnThis(),
    eq:         jest.fn().mockReturnThis(),
    in:         jest.fn().mockReturnThis(),
    not:        jest.fn().mockReturnThis(),
    gte:        jest.fn().mockReturnThis(),
    limit:      jest.fn().mockReturnThis(),
    ilike:      jest.fn().mockReturnThis(),
    order:      jest.fn().mockResolvedValue(result),
    single:     jest.fn().mockResolvedValue(result),
    maybeSingle:jest.fn().mockResolvedValue(result),
    // Make chain directly awaitable (for queries that end at .not(), .eq(), etc.)
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function buildSupabase(data: any, error: any = null) {
  const chain = buildChain(data, error);
  return { from: jest.fn().mockReturnValue(chain), chain };
}

// ─── getActId ───────────────────────────────────────────────────────────────

describe('getActId', () => {
  it('returns the act_id from user_profiles', async () => {
    const { from, chain } = buildSupabase({ act_id: 'act-123' });
    const supabase: any = { from };
    const result = await getActId(supabase, 'user-abc');
    expect(result).toBe('act-123');
    expect(from).toHaveBeenCalledWith('user_profiles');
    expect(chain.eq).toHaveBeenCalledWith('id', 'user-abc');
  });

  it('returns null when user has no act_id', async () => {
    const { from } = buildSupabase({ act_id: null });
    const result = await getActId({ from } as any, 'user-abc');
    expect(result).toBeNull();
  });

  it('returns null when user profile does not exist', async () => {
    const { from } = buildSupabase(null);
    const result = await getActId({ from } as any, 'user-abc');
    expect(result).toBeNull();
  });
});

// ─── getBandBookings ─────────────────────────────────────────────────────────

describe('getBandBookings', () => {
  const mockBookings = [
    { id: '1', show_date: '2026-06-01', status: 'confirmed', act_id: 'act-1' },
    { id: '2', show_date: '2026-07-01', status: 'pending', act_id: 'act-1' },
  ];

  it('returns empty array immediately when actId is empty', async () => {
    const { from } = buildSupabase(mockBookings);
    const result = await getBandBookings({ from } as any, '');
    expect(result).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('returns bookings for a valid actId', async () => {
    const { from } = buildSupabase(mockBookings);
    const result = await getBandBookings({ from } as any, 'act-1');
    expect(result).toEqual(mockBookings);
    expect(from).toHaveBeenCalledWith('bookings');
  });

  it('applies status filter when provided', async () => {
    const { from, chain } = buildSupabase(mockBookings);
    await getBandBookings({ from } as any, 'act-1', { status: ['confirmed'] });
    expect(chain.in).toHaveBeenCalledWith('status', ['confirmed']);
  });

  it('does not call .in() when status option is omitted', async () => {
    const { from, chain } = buildSupabase(mockBookings);
    await getBandBookings({ from } as any, 'act-1');
    expect(chain.in).not.toHaveBeenCalled();
  });

  it('applies upcomingOnly filter', async () => {
    const { from, chain } = buildSupabase(mockBookings);
    await getBandBookings({ from } as any, 'act-1', { upcomingOnly: true });
    expect(chain.gte).toHaveBeenCalled();
  });

  it('applies limit when provided', async () => {
    const { from, chain } = buildSupabase(mockBookings);
    await getBandBookings({ from } as any, 'act-1', { limit: 5 });
    expect(chain.limit).toHaveBeenCalledWith(5);
  });

  it('returns empty array when supabase returns null data', async () => {
    const { from } = buildSupabase(null);
    const result = await getBandBookings({ from } as any, 'act-1');
    expect(result).toEqual([]);
  });
});

// ─── getBookingCounts ────────────────────────────────────────────────────────

describe('getBookingCounts', () => {
  it('returns all zeros when actId is empty', async () => {
    const { from } = buildSupabase([]);
    const counts = await getBookingCounts({ from } as any, '');
    expect(counts).toEqual({ confirmed: 0, upcoming: 0, pipeline: 0, earned: 0, potential: 0 });
    expect(from).not.toHaveBeenCalled();
  });

  it('counts confirmed and advancing bookings', async () => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const bookings = [
      { status: 'confirmed',  show_date: tomorrow, agreed_amount: 500,  actual_amount_received: null },
      { status: 'advancing',  show_date: tomorrow, agreed_amount: 300,  actual_amount_received: null },
      { status: 'pending',    show_date: tomorrow, agreed_amount: 200,  actual_amount_received: null },
    ];
    const { from } = buildSupabase(bookings);
    const counts = await getBookingCounts({ from } as any, 'act-1');
    expect(counts.confirmed).toBe(2);
  });

  it('only counts upcoming shows with future dates', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const tomorrow  = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const bookings = [
      { status: 'confirmed', show_date: yesterday, agreed_amount: 100, actual_amount_received: null },
      { status: 'confirmed', show_date: tomorrow,  agreed_amount: 200, actual_amount_received: null },
    ];
    const { from } = buildSupabase(bookings);
    const counts = await getBookingCounts({ from } as any, 'act-1');
    expect(counts.upcoming).toBe(1);
  });

  it('sums earned from completed shows only', async () => {
    const bookings = [
      { status: 'completed', show_date: '2025-01-01', agreed_amount: 500, actual_amount_received: 400 },
      { status: 'completed', show_date: '2025-02-01', agreed_amount: 300, actual_amount_received: 250 },
      { status: 'confirmed', show_date: '2026-06-01', agreed_amount: 500, actual_amount_received: null },
    ];
    const { from } = buildSupabase(bookings);
    const counts = await getBookingCounts({ from } as any, 'act-1');
    expect(counts.earned).toBe(650);
  });

  it('sums potential from confirmed future shows only', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const bookings = [
      { status: 'confirmed', show_date: tomorrow,     agreed_amount: 500, actual_amount_received: null },
      { status: 'confirmed', show_date: tomorrow,     agreed_amount: 300, actual_amount_received: null },
      { status: 'advancing', show_date: tomorrow,     agreed_amount: 200, actual_amount_received: null },
      { status: 'completed', show_date: '2025-01-01', agreed_amount: 100, actual_amount_received: 100 },
    ];
    const { from } = buildSupabase(bookings);
    const counts = await getBookingCounts({ from } as any, 'act-1');
    expect(counts.potential).toBe(800);
  });

  it('counts pipeline as all non-completed bookings', async () => {
    const bookings = [
      { status: 'confirmed',  show_date: '2026-01-01', agreed_amount: null, actual_amount_received: null },
      { status: 'pending',    show_date: '2026-01-01', agreed_amount: null, actual_amount_received: null },
      { status: 'advancing',  show_date: '2026-01-01', agreed_amount: null, actual_amount_received: null },
      { status: 'completed',  show_date: '2025-01-01', agreed_amount: null, actual_amount_received: null },
    ];
    const { from } = buildSupabase(bookings);
    const counts = await getBookingCounts({ from } as any, 'act-1');
    expect(counts.pipeline).toBe(3);
  });

  it('handles null agreed_amount gracefully', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const bookings = [
      { status: 'confirmed', show_date: tomorrow, agreed_amount: null, actual_amount_received: null },
    ];
    const { from } = buildSupabase(bookings);
    const counts = await getBookingCounts({ from } as any, 'act-1');
    expect(counts.potential).toBe(0);
  });
});
