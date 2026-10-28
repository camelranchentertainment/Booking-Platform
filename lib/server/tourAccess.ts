// lib/server/tourAccess.ts
//
// Who may work a tour's targets through service-role routes (which bypass
// RLS). Mirrors the tour_venues_admin_write policy (migration
// 20261028180000_tours_admin_only_writes.sql) so the API and the database
// agree: the act's owner, or any band admin / superadmin linked to the tour's
// act. Plain members are refused, and so is a tour's creator who is no longer
// an admin of that band.
import type { SupabaseClient } from '@supabase/supabase-js';
import { isBandAdminRole } from './requireBandAdmin';

/**
 * True when the user may read and change the tour's targets.
 *
 * @param service service-role client
 * @param tourId  tour id from the request (checked here, never trusted)
 * @param userId  the signed-in caller, from the verified token
 * @throws Error when a lookup fails, so callers answer 500 rather than guess
 */
export async function canManageTour(service: SupabaseClient, tourId: string, userId: string): Promise<boolean> {
  if (!tourId || !userId) return false;

  const { data: tour, error: tourErr } = await service
    .from('tours')
    .select('id, act_id')
    .eq('id', tourId)
    .maybeSingle();
  if (tourErr) throw new Error(`tour lookup failed: ${tourErr.message}`);
  if (!tour) return false;
  const actId = (tour as { act_id: string | null }).act_id ?? null;

  const { data: profile, error: profileErr } = await service
    .from('profiles')
    .select('act_id, role')
    .eq('id', userId)
    .maybeSingle();
  if (profileErr) throw new Error(`profile lookup failed: ${profileErr.message}`);
  const p = profile as { act_id: string | null; role: string | null } | null;

  // A superadmin is held to their own band here too (CLAUDE.md: the band comes
  // from the caller's profile), matching tours_admin_write.
  if (!actId) return false;
  if (p && p.act_id === actId && isBandAdminRole(p.role)) return true;

  const { data: act, error: actErr } = await service
    .from('acts')
    .select('id')
    .eq('id', actId)
    .eq('owner_id', userId)
    .maybeSingle();
  if (actErr) throw new Error(`act owner lookup failed: ${actErr.message}`);
  return !!act;
}
