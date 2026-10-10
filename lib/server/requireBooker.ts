// lib/server/requireBooker.ts
import type { NextApiRequest } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../apiError';

export interface BookerContext {
  userId: string;
  /** booker_profiles.id of the caller — always resolved here, never taken from the request */
  bookerId: string;
}

/**
 * Resolves the caller from the Bearer token and requires an active Booking Agent
 * profile. Service-role routes under /api/booker bypass RLS, so every one of
 * them must call this and scope every query to the returned bookerId.
 *
 * @throws AppError 401 when the token is missing or invalid
 * @throws AppError 403 when the caller has no active agent profile
 */
export async function requireBooker(req: NextApiRequest, service: SupabaseClient): Promise<BookerContext> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new AppError(401, 'Missing authorization header');

  const {
    data: { user },
    error: authErr,
  } = await service.auth.getUser(token);
  if (authErr || !user) throw new AppError(401, 'Invalid or expired session');

  const { data: booker, error } = await service
    .from('booker_profiles')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new AppError(500, 'Could not load agent profile', false);
  if (!booker) throw new AppError(403, 'No Booking Agent workspace for this account');

  return { userId: user.id, bookerId: String(booker.id) };
}
