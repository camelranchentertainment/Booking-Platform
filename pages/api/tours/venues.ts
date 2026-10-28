import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { syncBooking } from '../../../lib/statusSync';
import { ownedVenueId } from '../../../lib/server/actOwnership';
import { canManageTour } from '../../../lib/server/tourAccess';
import type { SupabaseClient } from '@supabase/supabase-js';

async function getUser(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await getServiceClient().auth.getUser(token);
  return user;
}

/**
 * Sends 403 (not an admin of the tour's band) or 500 (lookup failed) and
 * returns false; returns true when the caller may work this tour.
 */
async function allowTour(res: NextApiResponse, service: SupabaseClient, tourId: string, userId: string): Promise<boolean> {
  try {
    if (await canManageTour(service, tourId, userId)) return true;
    res.status(403).json({ error: "Only the band's admins can change this tour" });
    return false;
  } catch (e: unknown) {
    console.error('[tour_venues] access check failed', { tourId, error: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ error: 'Could not check access to this tour' });
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const service = getServiceClient();
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { tour_id } = req.query;
    if (!tour_id) return res.status(400).json({ error: 'tour_id required' });
    if (!await allowTour(res, service, tour_id as string, user.id)) return;

    const { data, error } = await service
      .from('tour_venues')
      .select('*, venue:venues(id, name, city, state, capacity, venue_type, email, phone, website, address)')
      .eq('tour_id', tour_id)
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { tour_id, venue_id } = req.body;
    if (!tour_id || !venue_id) return res.status(400).json({ error: 'tour_id and venue_id required' });
    if (!await allowTour(res, service, tour_id, user.id)) return;

    // Service role bypasses RLS: the venue must belong to the tour's band, or a
    // caller could link (and then read, via the venue join) another band's venue.
    const { data: tourRow, error: tourErr } = await service
      .from('tours').select('act_id').eq('id', tour_id).maybeSingle();
    if (tourErr) {
      console.error('[tour_venues POST] tour lookup failed', { tour_id, error: tourErr.message });
      return res.status(500).json({ error: 'Could not load the tour' });
    }
    const tourActId = (tourRow as { act_id: string | null } | null)?.act_id;
    if (!tourActId) return res.status(409).json({ error: 'This tour is not linked to a band' });

    let venueOk: string | null;
    try {
      venueOk = await ownedVenueId(service, tourActId, venue_id);
    } catch (e: unknown) {
      console.error('[tour_venues POST] venue ownership check failed', {
        tour_id, error: e instanceof Error ? e.message : String(e),
      });
      return res.status(500).json({ error: 'Could not verify the venue' });
    }
    if (!venueOk) return res.status(404).json({ error: "That venue wasn't found for this band" });

    const { data, error } = await service.from('tour_venues').insert({
      tour_id, venue_id, status: 'target', added_by: user.id,
    }).select('*, venue:venues(id, name, city, state, capacity, venue_type, email, phone, website, address)').single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Venue already in pool' });
      return res.status(500).json({ error: error.message });
    }

    // Mirror outreach entry into the bookings pipeline
    await syncBooking(service, data.id, user.id);

    return res.status(201).json(data);
  }

  if (req.method === 'PATCH') {
    const { id, status, notes } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });

    const { data: tv } = await service.from('tour_venues').select('tour_id').eq('id', id).maybeSingle();
    if (!tv) return res.status(404).json({ error: 'Not found' });
    if (!await allowTour(res, service, tv.tour_id, user.id)) return;

    const update: any = {};
    if (status !== undefined) update.status = status;
    if (notes  !== undefined) update.notes  = notes;

    const { data, error } = await service.from('tour_venues').update(update).eq('id', id)
      .select('*, venue:venues(id, name, city, state, capacity, venue_type, email, phone, website, address)').single();
    if (error) return res.status(500).json({ error: error.message });

    // Keep booking pipeline in sync whenever outreach status changes
    if (status !== undefined) {
      try {
        await syncBooking(service, id as string, user.id);
      } catch (e: any) {
        console.error('[venues PATCH] syncBooking failed', { id, status, error: e?.message });
      }
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });

    const { data: tv } = await service.from('tour_venues').select('tour_id').eq('id', id as string).maybeSingle();
    if (!tv) return res.status(404).json({ error: 'Not found' });
    if (!await allowTour(res, service, tv.tour_id, user.id)) return;

    const { error } = await service.from('tour_venues').delete().eq('id', id as string);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
