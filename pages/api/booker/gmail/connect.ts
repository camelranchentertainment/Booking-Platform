// pages/api/booker/gmail/connect.ts
// POST — starts connecting the agent's own Gmail. Returns the Google consent
// URL and sets an HttpOnly nonce cookie that the callback must match.
//
//   200 { url }   401/403 not an agent   501 Google OAuth not configured

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../../lib/supabase';
import { AppError, withHandler } from '../../../../lib/apiError';
import { requireBooker } from '../../../../lib/server/requireBooker';
import { beginOAuth, nonceCookie } from '../../../../lib/server/bookerGmail';

/** Begins the Gmail OAuth flow for the signed-in agent. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    throw new AppError(405, 'Method not allowed');
  }
  const { userId, bookerId } = await requireBooker(req, getServiceClient());
  const { url, nonce } = beginOAuth(userId, bookerId);
  res.setHeader('Set-Cookie', nonceCookie(nonce));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ url });
}

export default withHandler(handler);
