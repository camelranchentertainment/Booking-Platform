// pages/api/booker/gmail/disconnect.ts
// POST — disconnects the agent's Gmail: revokes the token at Google, then
// deletes the stored credentials. Mail then goes out through the platform
// sender with Reply-To set to the agent. Idempotent.
//
//   200 { ok: true }   401/403 not an agent

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../../lib/supabase';
import { AppError, withHandler } from '../../../../lib/apiError';
import { requireBooker } from '../../../../lib/server/requireBooker';
import { getBookerGmail, revokeGoogleToken } from '../../../../lib/server/bookerGmail';

/** Disconnects the signed-in agent's Gmail. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    throw new AppError(405, 'Method not allowed');
  }
  const service = getServiceClient();
  const { bookerId } = await requireBooker(req, service);
  const row = await getBookerGmail(service, bookerId);
  if (row) {
    await revokeGoogleToken(row.google_refresh_token);
    const { error } = await service.from('booker_credentials').delete().eq('booker_id', bookerId);
    if (error) throw new AppError(500, 'Could not disconnect Gmail. Try again.', false);
  }
  res.status(200).json({ ok: true });
}

export default withHandler(handler);
