// pages/api/booker/venues/towns.ts
// GET  — lists the agent's venues whose saved town differs from Google's.
// POST { ids } — corrects the chosen venues to Google's town.
//
//   200 TownCheck (GET) | { applied, failed } (POST)
//   400 invalid body, 401/403 not an agent, 501 Google not configured, 502 lookup failed

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../../lib/supabase';
import { withHandler } from '../../../../lib/apiError';
import { requireBooker } from '../../../../lib/server/requireBooker';
import { handleVenueTowns } from '../../../../lib/server/venueTownRoute';

/** Agents only; scoped to the caller's own venue book. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const service = getServiceClient();
  const { bookerId } = await requireBooker(req, service);
  await handleVenueTowns(req, res, service, { kind: 'booker', bookerId });
}

export default withHandler(handler);
