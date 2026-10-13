// pages/api/venues/towns.ts
// GET  — lists the band's venues whose saved town differs from Google's
//        (venues added from a search used to be saved under the searched town).
// POST { ids } — corrects the chosen venues to Google's town.
//
//   200 TownCheck (GET) | { applied, failed } (POST)
//   400 invalid body, 401/403 not a band admin, 501 Google not configured, 502 lookup failed

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { withHandler } from '../../../lib/apiError';
import { requireBandAdmin } from '../../../lib/server/requireBandAdmin';
import { handleVenueTowns } from '../../../lib/server/venueTownRoute';

/** Band admins only; the band always comes from the caller's profile. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const service = getServiceClient();
  const { actId } = await requireBandAdmin(req, service);
  await handleVenueTowns(req, res, service, { kind: 'band', actId });
}

export default withHandler(handler);
