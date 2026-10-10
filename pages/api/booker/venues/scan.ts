// pages/api/booker/venues/scan.ts
// POST { venueId } — reads the venue's website and fills in booking details:
// blank venue fields (email, phone, capacity, notes) and a new private contact
// when the site names a booker who is not already on the venue.
//
//   200 { filled: string[], contactAdded: boolean, pagesScanned, extracted }
//   400 no website / bad id, 401/403 not an agent, 404 not your venue,
//   429 scanned less than a minute ago, 501 not configured, 422 site unreadable

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getServiceClient } from '../../../../lib/supabase';
import { AppError, withHandler } from '../../../../lib/apiError';
import { requireBooker } from '../../../../lib/server/requireBooker';
import { scanVenueSite } from '../../../../lib/server/venueSiteScan';
import { contactFromScan, venuePatchFromScan } from '../../../../lib/booker/scanMerge';

const BodySchema = z.object({ venueId: z.uuid('Invalid venue') });
const RESCAN_COOLDOWN_MS = 60_000;

/** Scans one of the signed-in agent's venues. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    throw new AppError(405, 'Method not allowed');
  }
  const service = getServiceClient();
  const { bookerId } = await requireBooker(req, service);

  const parsed = BodySchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Invalid venue');

  // Ownership: the venue must belong to the caller's agent profile.
  const { data: venue, error: venueErr } = await service
    .from('booker_venues')
    .select('id, website, email, phone, capacity, notes, last_scanned_at')
    .eq('id', parsed.data.venueId)
    .eq('booker_id', bookerId)
    .is('deleted_at', null)
    .maybeSingle();
  if (venueErr) throw new AppError(500, 'Could not load the venue', false);
  if (!venue) throw new AppError(404, 'Venue not found');
  if (!venue.website) throw new AppError(400, 'Add the venue’s website first, then scan it.');
  if (venue.last_scanned_at && Date.now() - Date.parse(venue.last_scanned_at) < RESCAN_COOLDOWN_MS) {
    throw new AppError(429, 'This venue was just scanned. Give it a minute before scanning again.');
  }

  // Claim the scan before the slow work so a double click can't run it twice.
  await service.from('booker_venues').update({ last_scanned_at: new Date().toISOString() }).eq('id', venue.id).eq('booker_id', bookerId);

  const { extracted, pagesScanned } = await scanVenueSite(venue.website);

  const patch = venuePatchFromScan(
    { email: venue.email, phone: venue.phone, capacity: venue.capacity, notes: venue.notes },
    extracted,
  );
  if (Object.keys(patch).length > 0) {
    const { error } = await service.from('booker_venues').update(patch).eq('id', venue.id).eq('booker_id', bookerId);
    if (error) throw new AppError(500, 'Found details but could not save them. Try again.', false);
  }

  const { data: existingContacts } = await service
    .from('booker_contacts')
    .select('name, email')
    .eq('venue_id', venue.id)
    .eq('booker_id', bookerId)
    .is('deleted_at', null);

  const newContact = contactFromScan(extracted, existingContacts ?? []);
  let contactAdded = false;
  if (newContact) {
    const { error } = await service.from('booker_contacts').insert({
      booker_id: bookerId,
      venue_id: venue.id,
      ...newContact,
      source: 'website',
      share_with_bands: false,
    });
    if (error) console.error('[booker/venues/scan] contact insert failed', { code: error.code });
    else contactAdded = true;
  }

  res.status(200).json({ filled: Object.keys(patch), contactAdded, pagesScanned, extracted });
}

export default withHandler(handler);
