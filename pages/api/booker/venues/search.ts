// pages/api/booker/venues/search.ts
// GET ?city=&state=&kind= — Google Places search for venues in a city, each
// result marked when it is already in the caller's venue book.
//
//   200 PlaceResult[] with already_added / venue_id
//   400 missing or invalid query, 401/403 not an agent, 501 not configured, 502 Google error

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getServiceClient } from '../../../../lib/supabase';
import { AppError, withHandler } from '../../../../lib/apiError';
import { requireBooker } from '../../../../lib/server/requireBooker';
import { searchVenues } from '../../../../lib/server/googlePlaces';

const QuerySchema = z.object({
  city: z.string().trim().min(1, 'City is required').max(100),
  state: z.string().trim().min(1, 'State is required').max(100),
  kind: z.string().trim().max(60).optional(),
});

/** Searches venues for the signed-in agent. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    throw new AppError(405, 'Method not allowed');
  }
  const service = getServiceClient();
  const { bookerId } = await requireBooker(req, service);

  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid search');
  const { city, state, kind } = parsed.data;

  const places = await searchVenues(city, state, kind);

  const { data: mine, error } = await service
    .from('booker_venues')
    .select('id, name, place_id, city')
    .eq('booker_id', bookerId)
    .is('deleted_at', null);
  if (error) throw new AppError(500, 'Could not check your venue book', false);

  const byPlace = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const v of mine ?? []) {
    if (v.place_id) byPlace.set(String(v.place_id), String(v.id));
    byName.set(`${String(v.name).toLowerCase()}|${String(v.city ?? '').toLowerCase()}`, String(v.id));
  }

  res.status(200).json(
    places.map(p => {
      const venueId = byPlace.get(p.place_id) ?? byName.get(`${p.name.toLowerCase()}|${city.toLowerCase()}`) ?? null;
      return { ...p, city, state, already_added: venueId !== null, venue_id: venueId };
    }),
  );
}

export default withHandler(handler);
