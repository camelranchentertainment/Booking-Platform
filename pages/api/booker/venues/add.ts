// pages/api/booker/venues/add.ts
// POST { place_id, name, address?, city, state, kind? } — saves a search result
// to the caller's venue book, with the website and phone from Google.
//
//   200 { venue, existed }  existed=true when it was already in the book
//   400 invalid body, 401/403 not an agent

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getServiceClient } from '../../../../lib/supabase';
import { AppError, withHandler } from '../../../../lib/apiError';
import { requireBooker } from '../../../../lib/server/requireBooker';
import { placeDetails } from '../../../../lib/server/googlePlaces';
import { VENUE_KINDS } from '../../../../lib/booker/types';

const BodySchema = z.object({
  place_id: z.string().trim().min(1).max(300),
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  kind: z.enum(VENUE_KINDS).default('venue'),
});

/** Adds a Google Places result to the signed-in agent's venue book. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    throw new AppError(405, 'Method not allowed');
  }
  const service = getServiceClient();
  const { bookerId } = await requireBooker(req, service);

  const parsed = BodySchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid venue');
  const v = parsed.data;

  const findExisting = async () => {
    const { data } = await service
      .from('booker_venues')
      .select('*')
      .eq('booker_id', bookerId)
      .eq('place_id', v.place_id)
      .is('deleted_at', null)
      .maybeSingle();
    return data;
  };

  const already = await findExisting();
  if (already) return res.status(200).json({ venue: already, existed: true });

  const details = await placeDetails(v.place_id);
  const { data: venue, error } = await service
    .from('booker_venues')
    .insert({
      booker_id: bookerId,
      place_id: v.place_id,
      name: (details.name ?? v.name).slice(0, 160),
      address: v.address || null,
      city: v.city,
      state: v.state,
      website: details.website?.slice(0, 300) ?? null,
      phone: details.phone?.slice(0, 40) ?? null,
      kind: v.kind,
    })
    .select('*')
    .single();

  if (error?.code === '23505') {
    // Added in another tab between the check and the insert.
    const existing = await findExisting();
    if (existing) return res.status(200).json({ venue: existing, existed: true });
  }
  if (error || !venue) {
    console.error('[booker/venues/add] insert failed', { code: error?.code });
    throw new AppError(500, 'Could not add the venue. Try again.', false);
  }
  res.status(200).json({ venue, existed: false });
}

export default withHandler(handler);
