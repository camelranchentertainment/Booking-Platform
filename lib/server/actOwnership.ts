// lib/server/actOwnership.ts
//
// Ownership checks for ids that arrive in a request body. Service-role routes
// bypass RLS, so a venue/contact/booking id from the browser must be checked
// against the caller's band (from their profile) before it is read or linked.
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns the venue id when it belongs to the act, otherwise null.
 * Null/empty input returns null without a query.
 *
 * @throws Error when the lookup itself fails (callers should not guess)
 */
export async function ownedVenueId(service: SupabaseClient, actId: string, venueId: unknown): Promise<string | null> {
  if (typeof venueId !== 'string' || !venueId) return null;
  const { data, error } = await service
    .from('venues')
    .select('id')
    .eq('id', venueId)
    .eq('act_id', actId)
    .maybeSingle();
  if (error) throw new Error(`venue ownership check failed: ${error.message}`);
  return data?.id ?? null;
}

/**
 * Returns the contact id when its venue belongs to the act, otherwise null.
 *
 * @throws Error when the lookup itself fails
 */
export async function ownedContactId(service: SupabaseClient, actId: string, contactId: unknown): Promise<string | null> {
  if (typeof contactId !== 'string' || !contactId) return null;
  const { data, error } = await service
    .from('contacts')
    .select('id, venue:venues!inner(act_id)')
    .eq('id', contactId)
    .eq('venue.act_id', actId)
    .maybeSingle();
  if (error) throw new Error(`contact ownership check failed: ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}
