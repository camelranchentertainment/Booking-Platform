// pages/api/booker/offers/[id]/pdf.ts
// GET — the offer or deal memo as a PDF download.
//
//   200 application/pdf
//   400 bad id · 401/403 not an agent · 404 not the caller's (or archived)
//
// Service role: the caller is resolved with requireBooker and the offer is
// loaded scoped to that bookerId, so one agent can never fetch another's.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../../../lib/supabase';
import { AppError, withHandler } from '../../../../../lib/apiError';
import { requireBooker } from '../../../../../lib/server/requireBooker';
import { loadOfferAgency, loadOwnedOffer, offerIdFrom } from '../../../../../lib/server/bookerOffers';
import { renderOfferPdf } from '../../../../../lib/server/offerPdf';
import { offerFilename } from '../../../../../lib/booker/offers';

/** Streams one of the caller's offers as a PDF. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    throw new AppError(405, 'Method not allowed');
  }
  const offerId = offerIdFrom(req.query.id);
  const service = getServiceClient();
  const { bookerId } = await requireBooker(req, service);
  const offer = await loadOwnedOffer(service, bookerId, offerId);
  const pdf = await renderOfferPdf(offer, await loadOfferAgency(service, bookerId));

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${offerFilename(offer)}"`);
  // Money terms: never cache in shared caches.
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).send(Buffer.from(pdf));
}

export default withHandler(handler);
