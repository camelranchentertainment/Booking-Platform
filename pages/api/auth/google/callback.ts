import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(302, `/settings?calendar_error=${encodeURIComponent(String(error))}`);
  }

  if (!code || !state) {
    return res.redirect(302, '/settings?calendar_error=missing_params');
  }

  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(String(state), 'base64').toString());
    userId = decoded.userId;
    if (!userId) throw new Error('no userId');
  } catch {
    return res.redirect(302, '/settings?calendar_error=invalid_state');
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.redirect(302, '/settings?calendar_error=not_configured');
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.host}`}/api/auth/google/callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code:          String(code),
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return res.redirect(302, '/settings?calendar_error=token_exchange_failed');
  }

  const tokens = await tokenRes.json();
  const admin = getServiceClient();

  await admin.from('user_calendar_settings').upsert({
    user_id:              userId,
    calendar_type:        'google',
    google_access_token:  tokens.access_token,
    google_refresh_token: tokens.refresh_token || null,
    is_active:            true,
    last_synced_at:       new Date().toISOString(),
  }, { onConflict: 'user_id' });

  res.redirect(302, '/settings?calendar_connected=1');
}
