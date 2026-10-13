// pages/api/venues/place-details.ts
// GET ?place_id= — website, phone, official name and the venue's own address
// (town, state, ZIP, street) from Google Place Details, for the band's
// Venues page before it saves a search result.
//
//   200 PlaceDetails (fields are null when Google has none)
//   400 missing place_id, 401 not signed in

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getServiceClient } from '../../../lib/supabase';
import { AppError, withHandler } from '../../../lib/apiError';
import { placeDetails } from '../../../lib/server/googlePlaces';

const QuerySchema = z.object({ place_id: z.string().trim().min(1, 'place_id required').max(300) });

/** Place Details for a signed-in user. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    throw new AppError(405, 'Method not allowed');
  }

  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new AppError(401, 'Unauthorized');
  const {
    data: { user },
  } = await getServiceClient().auth.getUser(token);
  if (!user) throw new AppError(401, 'Unauthorized');

  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'place_id required');

  res.status(200).json(await placeDetails(parsed.data.place_id));
}

export default withHandler(handler);
