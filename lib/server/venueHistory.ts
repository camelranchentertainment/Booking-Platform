import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * True when the act has already played this venue, meaning at least one other
 * booking for the same act and venue reached `completed`. Used to pick the
 * "familiar" email voice instead of the cold-pitch one.
 *
 * Fails soft: any lookup error returns false, because a wrong guess only means
 * the draft uses the cold-pitch voice, which is safe, and a draft must never be
 * blocked by a history lookup.
 *
 * @param client            a service-role Supabase client
 * @param actId             the act (always taken from the caller's profile or booking, never the request body)
 * @param venueId           the venue being emailed
 * @param excludeBookingId  the booking being drafted for, so it does not count as its own history
 */
export async function hasPlayedVenue(
  client: SupabaseClient,
  actId: string | null | undefined,
  venueId: string | null | undefined,
  excludeBookingId?: string | null,
): Promise<boolean> {
  if (!actId || !venueId) return false;
  try {
    let query = client
      .from('bookings')
      .select('id')
      .eq('act_id', actId)
      .eq('venue_id', venueId)
      .eq('status', 'completed')
      .limit(1);
    if (excludeBookingId) query = query.neq('id', excludeBookingId);
    const { data, error } = await query;
    if (error) {
      console.error('[venueHistory] lookup failed:', error.message);
      return false;
    }
    return (data?.length ?? 0) > 0;
  } catch (err) {
    console.error('[venueHistory] lookup threw:', err instanceof Error ? err.message : err);
    return false;
  }
}
