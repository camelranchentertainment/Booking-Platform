import type { NextApiRequest } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../apiError';

/** Roles allowed to use admin-only server routes (agent, bulk send, staged-action execute). */
export const BAND_ADMIN_ROLES = ['band_admin', 'superadmin'] as const;

/** True only for band_admin / superadmin. Members and unknown roles are false. */
export function isBandAdminRole(role: unknown): role is (typeof BAND_ADMIN_ROLES)[number] {
  return role === 'band_admin' || role === 'superadmin';
}

export interface BandAdminContext {
  userId: string;
  actId: string;
  role: 'band_admin' | 'superadmin';
}

/**
 * Resolves the caller from the Bearer token and requires a band_admin or
 * superadmin profile linked to an act. The act ID ALWAYS comes from the
 * caller's profile (service-role read), never from the request body or URL.
 *
 * @throws AppError 401 when the token is missing or invalid
 * @throws AppError 403 when the caller is not a band admin/superadmin or has no act
 */
export async function requireBandAdmin(
  req: NextApiRequest,
  service: SupabaseClient,
): Promise<BandAdminContext> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new AppError(401, 'Missing authorization header');

  const { data: { user }, error: authErr } = await service.auth.getUser(token);
  if (authErr || !user) throw new AppError(401, 'Invalid or expired session');

  const { data: profile, error: profileErr } = await service
    .from('profiles')
    .select('act_id, role')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile) throw new AppError(403, 'Profile not found');

  if (!isBandAdminRole(profile.role)) {
    throw new AppError(403, 'Forbidden');
  }

  if (!profile.act_id) throw new AppError(403, 'No act linked to this account');

  // profile.role is narrowed to the two values above by the checks; same for act_id.
  const role = profile.role === 'band_admin' ? 'band_admin' : 'superadmin';
  const actId = String(profile.act_id);

  return { userId: user.id, actId, role };
}
