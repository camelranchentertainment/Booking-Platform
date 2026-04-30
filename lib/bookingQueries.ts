import { SupabaseClient } from '@supabase/supabase-js'

export async function getActId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('user_profiles')
    .select('act_id')
    .eq('id', userId)
    .single()
  return data?.act_id || null
}

export async function getBandBookings(
  supabase: SupabaseClient,
  actId: string,
  options: {
    status?: string[]
    upcomingOnly?: boolean
    limit?: number
  } = {}
) {
  if (!actId) return []
  const today = new Date().toISOString().split('T')[0]
  let query = supabase
    .from('bookings')
    .select(`
      *,
      venue:venues(id, name, city, state, email),
      act:acts(id, act_name)
    `)
    .eq('act_id', actId)
  if (options.status?.length) {
    query = query.in('status', options.status)
  }
  if (options.upcomingOnly) {
    query = query.gte('show_date', today)
  }
  if (options.limit) {
    query = query.limit(options.limit)
  }
  const { data, error } = await query
    .order('show_date', { ascending: true })
  if (error) console.error('getBandBookings:', error)
  return data || []
}

export async function getBookingCounts(
  supabase: SupabaseClient,
  actId: string
) {
  if (!actId) return {
    confirmed: 0, upcoming: 0,
    pipeline: 0, earned: 0, potential: 0
  }
  const today = new Date().toISOString().split('T')[0]
  const { data: bookings } = await supabase
    .from('bookings')
    .select('status, show_date, actual_amount_received, agreed_amount')
    .eq('act_id', actId)
    .not('status', 'eq', 'cancelled')
  const all = bookings || []
  return {
    confirmed: all.filter((b: any) =>
      ['confirmed', 'advancing'].includes(b.status)).length,
    upcoming: all.filter((b: any) =>
      ['confirmed', 'advancing'].includes(b.status) &&
      b.show_date >= today).length,
    pipeline: all.filter((b: any) =>
      !['completed'].includes(b.status)).length,
    earned: all.filter((b: any) =>
      b.status === 'completed')
      .reduce((s: number, b: any) =>
        s + (Number(b.actual_amount_received) || 0), 0),
    potential: all.filter((b: any) =>
      b.status === 'confirmed' && b.show_date >= today)
      .reduce((s: number, b: any) =>
        s + (Number(b.agreed_amount) || 0), 0)
  }
}
