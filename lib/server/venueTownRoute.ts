// lib/server/venueTownRoute.ts
// Shared request handling for the two "check venue towns" routes
// (/api/venues/towns for bands, /api/booker/venues/towns for agents).
// Each route resolves its own caller and scope; this only does the HTTP part.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../apiError';
import { assertPlacesConfigured } from './googlePlaces';
import { MAX_VENUES_PER_CHECK, applyVenueTowns, checkVenueTowns, type TownScope } from './venueTownRepair';

const ApplySchema = z.object({
  ids: z.array(z.string().uuid('Unknown venue')).min(1, 'Choose at least one venue to fix').max(MAX_VENUES_PER_CHECK),
});

/**
 * GET → preview of corrections. POST { ids } → applies them (re-derived from
 * Google on the server) and returns what was written.
 *
 * @throws AppError 400 invalid body, 405 other methods, 501 Google not configured, 502 when venues cannot be loaded
 */
export async function handleVenueTowns(req: NextApiRequest, res: NextApiResponse, service: SupabaseClient, scope: TownScope) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    throw new AppError(405, 'Method not allowed');
  }
  await assertPlacesConfigured();
  try {
    if (req.method === 'GET') {
      res.status(200).json(await checkVenueTowns(service, scope));
      return;
    }
    if (req.method === 'POST') {
      const parsed = ApplySchema.safeParse(req.body ?? {});
      if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid request');
      const ids = [...new Set(parsed.data.ids)];
      res.status(200).json(await applyVenueTowns(service, scope, ids));
      return;
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[venueTowns] failed', { kind: scope.kind, err });
    throw new AppError(502, 'Could not check venue towns right now. Try again in a minute.');
  }
}
