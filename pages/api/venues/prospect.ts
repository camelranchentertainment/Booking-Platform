// pages/api/venues/prospect.ts
// GET ?city=&state= — Google Places search for venues in and around a city,
// for the band's Venues page (Prospect) and a tour's Discover tab.
//
// Each result carries the town it is actually in. Google also returns venues
// in nearby towns; those are kept (they are often worth booking) but marked
// `in_searched_city: false` and listed after the in-town ones, and they are
// saved under their own town, never the searched one.
//
//   200 LabelledPlaceResult[] with already_added
//   400 missing or invalid query, 401 not signed in, 501 not configured, 502 Google error

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getServiceClient } from '../../../lib/supabase';
import { AppError, withHandler } from '../../../lib/apiError';
import { searchVenues } from '../../../lib/server/googlePlaces';
import { normalizeCity } from '../../../lib/placeLocality';

const QuerySchema = z.object({
  city: z.string().trim().min(1, 'City is required').max(100),
  state: z.string().trim().min(1, 'State is required').max(100),
});

/** Searches venues for the signed-in user, marking ones already in their band's venue list. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    throw new AppError(405, 'Method not allowed');
  }

  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new AppError(401, 'Unauthorized');
  const service = getServiceClient();
  const {
    data: { user },
  } = await service.auth.getUser(token);
  if (!user) throw new AppError(401, 'Unauthorized');

  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid search');
  const { city, state } = parsed.data;

  const places = await searchVenues(city, state);

  // The band always comes from the caller's profile, never the request.
  const { data: profile } = await service.from('profiles').select('act_id').eq('id', user.id).maybeSingle();
  const actId = profile?.act_id ? String(profile.act_id) : null;

  // All of the band's venues, not just ones filed under the searched town:
  // nearby results live in other towns, and older rows may carry the wrong town.
  let mine: Array<{ id: unknown; name: unknown; place_id: unknown; city: unknown }> = [];
  if (actId) {
    const { data, error } = await service.from('venues').select('id, name, place_id, city').eq('act_id', actId);
    if (error) {
      console.error('[venues/prospect] venue lookup failed', { code: error.code });
      throw new AppError(500, 'Could not check your venue list', false);
    }
    mine = data ?? [];
  }

  const nameKey = (name: string, town: string) => `${name.trim().toLowerCase()}|${normalizeCity(town)}`;
  const placeIds = new Set<string>();
  const names = new Set<string>();
  for (const v of mine) {
    if (v.place_id) placeIds.add(String(v.place_id));
    if (v.name && v.city) names.add(nameKey(String(v.name), String(v.city)));
  }

  res.status(200).json(
    places.map(p => ({
      ...p,
      already_added: placeIds.has(p.place_id) || (p.city !== null && names.has(nameKey(p.name, p.city))),
    })),
  );
}

export default withHandler(handler);
