import { SupabaseClient } from '@supabase/supabase-js';

// Returns all act IDs owned by this band admin
export async function getAgentActIds(sb: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await sb.from('acts').select('id').eq('owner_id', userId);
  return (data || []).map((r: any) => r.id as string);
}

// Returns acts owned by this band admin (for act lists / dropdowns)
export async function getAgentActs(sb: SupabaseClient, userId: string): Promise<any[]> {
  const { data } = await sb.from('acts').select('id, act_name').eq('owner_id', userId).order('act_name');
  return data || [];
}

// Fetches bookings for all of an agent's acts (direct + linked) plus any they created directly.
// Pass preloaded actIds to avoid an extra round-trip.
export async function getAgentBookings(
  sb: SupabaseClient,
  userId: string,
  opts: {
    select?: string;
    status?: string[];
    fromDate?: string;
    toDate?: string;
    actId?: string;
    orderBy?: string;
    ascending?: boolean;
    limit?: number;
    actIds?: string[];
  } = {}
): Promise<any[]> {
  const actIds = opts.actIds ?? await getAgentActIds(sb, userId);

  const selectCols = opts.select ?? `
    id, status, show_date, fee, agreed_amount, amount_paid, actual_amount_received,
    payment_status, created_at,
    act:acts(id, act_name),
    venue:venues(id, name, city, state)
  `;

  let q = sb.from('bookings').select(selectCols);

  if (actIds.length > 0) {
    q = q.or(`act_id.in.(${actIds.join(',')}),created_by.eq.${userId}`);
  } else {
    q = q.eq('created_by', userId);
  }

  if (opts.status?.length) q = q.in('status', opts.status);
  if (opts.fromDate) q = q.gte('show_date', opts.fromDate);
  if (opts.toDate) q = q.lte('show_date', opts.toDate);
  if (opts.actId) q = q.eq('act_id', opts.actId);
  q = q.order(opts.orderBy ?? 'created_at', { ascending: opts.ascending ?? false });
  if (opts.limit) q = q.limit(opts.limit);

  const { data } = await q;
  return data || [];
}

// Fetches bookings for a specific act (band portal / member view)
export async function getBandBookings(
  sb: SupabaseClient,
  actId: string,
  opts: {
    select?: string;
    status?: string[];
    upcoming?: boolean;
    limit?: number;
  } = {}
): Promise<any[]> {
  const selectCols = opts.select ?? `
    id, status, show_date, set_time, load_in_time, door_time, set_length_min, advance_notes,
    fee, agreed_amount, amount_paid, actual_amount_received, payment_status,
    venue:venues(id, name, city, state, address, phone)
  `;

  let q = sb.from('bookings')
    .select(selectCols)
    .eq('act_id', actId)
    .neq('status', 'cancelled')
    .order('show_date', { ascending: true });

  if (opts.status?.length) q = q.in('status', opts.status);
  if (opts.upcoming) {
    const today = new Date().toISOString().split('T')[0];
    q = q.gte('show_date', today);
  }
  if (opts.limit) q = q.limit(opts.limit);

  const { data } = await q;
  return data || [];
}

// Maps tour_venue outreach status to bookings pipeline status
const TV_TO_BOOKING: Record<string, string> = {
  target:      'pitch',
  pitched:     'pitch',
  follow_up:   'followup',
  followup:    'followup',
  negotiating: 'negotiation',
  confirmed:   'confirmed',
  declined:    'cancelled',
};

// Creates or updates the bookings record that mirrors a tour_venue outreach entry.
// Safe to call on every tour_venue insert/update — idempotent.
export async function syncTourVenueToBooking(
  sb: SupabaseClient,
  tourVenueId: string,
  userId: string
): Promise<void> {
  const { data: tv } = await sb
    .from('tour_venues')
    .select('id, venue_id, tour_id, status, tour:tours(id, act_id, end_date, created_by)')
    .eq('id', tourVenueId)
    .single();
  if (!tv) return;

  const tour = tv.tour as any;
  if (!tour?.act_id) return;

  const bookingStatus = TV_TO_BOOKING[tv.status] || 'pitch';

  const { data: existing } = await sb
    .from('bookings')
    .select('id, status')
    .eq('venue_id', tv.venue_id)
    .eq('act_id', tour.act_id)
    .eq('tour_id', tv.tour_id)
    .not('status', 'in', '("completed","cancelled")')
    .maybeSingle();

  if (existing) {
    await sb.from('bookings').update({ status: bookingStatus }).eq('id', existing.id);
  } else if (bookingStatus !== 'cancelled') {
    await sb.from('bookings').insert({
      act_id:          tour.act_id,
      venue_id:        tv.venue_id,
      tour_id:         tv.tour_id,
      status:          bookingStatus,
      source:          'tour',
      created_by:      userId,
      show_date:       tour.end_date || null,
      details_pending: true,
    });
  }
}

const ACTIVE_STATUSES = ['pitch', 'followup', 'negotiation', 'hold', 'contract', 'confirmed', 'advancing'];

// Returns aggregated counts for the agent dashboard stat cards
export async function getBookingCounts(
  sb: SupabaseClient,
  userId: string,
  actIds: string[]
): Promise<{
  inPipeline: number;
  confirmedShows: number;
  earned: number;
  potential: number;
}> {
  const today = new Date().toISOString().split('T')[0];

  let q = sb.from('bookings').select(
    'id, status, show_date, agreed_amount, fee, actual_amount_received, amount_paid, payment_status'
  );

  if (actIds.length > 0) {
    q = q.or(`act_id.in.(${actIds.join(',')}),created_by.eq.${userId}`);
  } else {
    q = q.eq('created_by', userId);
  }

  const { data } = await q;
  const bookings: any[] = data || [];

  return {
    inPipeline: bookings.filter(b => ACTIVE_STATUSES.includes(b.status)).length,
    confirmedShows: bookings.filter(b => b.status === 'confirmed' || b.status === 'advancing').length,
    earned: bookings
      .filter(b => b.status === 'completed')
      .reduce((s, b) => s + (Number(b.actual_amount_received ?? b.amount_paid) || 0), 0),
    potential: bookings
      .filter(b => b.status === 'confirmed' && b.show_date && b.show_date > today && b.payment_status === 'pending')
      .reduce((s, b) => s + (Number(b.agreed_amount ?? b.fee) || 0), 0),
  };
}
