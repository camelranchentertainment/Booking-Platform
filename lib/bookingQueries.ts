import { SupabaseClient } from '@supabase/supabase-js';

// Returns all act IDs managed by an agent: direct (acts.agent_id) + linked (agent_act_links)
export async function getAgentActIds(sb: SupabaseClient, userId: string): Promise<string[]> {
  const [directRes, linkedRes] = await Promise.all([
    sb.from('acts').select('id').eq('agent_id', userId),
    sb.from('agent_act_links').select('act_id').eq('agent_id', userId).eq('status', 'active'),
  ]);
  const direct = (directRes.data || []).map((r: any) => r.id as string);
  const linked = (linkedRes.data || []).map((r: any) => r.act_id as string).filter(Boolean);
  return [...new Set([...direct, ...linked])];
}

// Returns agent acts with full details (for act lists / dropdowns)
export async function getAgentActs(sb: SupabaseClient, userId: string): Promise<any[]> {
  const [directRes, linkedRes] = await Promise.all([
    sb.from('acts').select('id, act_name').eq('agent_id', userId).order('act_name'),
    sb.from('agent_act_links')
      .select('act:acts(id, act_name)')
      .eq('agent_id', userId)
      .eq('status', 'active'),
  ]);
  const direct = directRes.data || [];
  const linked = (linkedRes.data || []).map((r: any) => r.act).filter(Boolean);
  return [...direct, ...linked.filter((a: any) => !direct.find((d: any) => d.id === a.id))];
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
