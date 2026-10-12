// pages/api/booker/gmail/status.ts
// GET — whether the agent's Gmail is connected, and as which address. Never
// returns tokens.
//
//   200 { connected: false } | { connected: true, gmail_address, connected_at }

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../../lib/supabase';
import { AppError, withHandler } from '../../../../lib/apiError';
import { requireBooker } from '../../../../lib/server/requireBooker';
import { getBookerGmail } from '../../../../lib/server/bookerGmail';

/** Reports the signed-in agent's Gmail connection. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    throw new AppError(405, 'Method not allowed');
  }
  const service = getServiceClient();
  const { bookerId } = await requireBooker(req, service);
  const row = await getBookerGmail(service, bookerId);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(row ? { connected: true, gmail_address: row.gmail_address, connected_at: row.connected_at } : { connected: false });
}

export default withHandler(handler);
