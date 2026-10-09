// lib/server/requireSuperadmin.ts
import type { NextApiRequest } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../apiError';

/**
 * Resolves the caller from the Bearer token and requires the superadmin role
 * (service-role read of profiles; the client's own claim is never trusted).
 *
 * @returns the superadmin's user id
 * @throws AppError 401 when the token is missing or invalid
 * @throws AppError 403 when the caller is not a superadmin
 */
export async function requireSuperadmin(req: NextApiRequest, service: SupabaseClient): Promise<string> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new AppError(401, 'Missing authorization header');

  const { data: { user }, error: authErr } = await service.auth.getUser(token);
  if (authErr || !user) throw new AppError(401, 'Invalid or expired session');

  const { data: profile } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'superadmin') throw new AppError(403, 'Superadmin only');
  return user.id;
}
