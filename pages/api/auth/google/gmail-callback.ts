import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../../lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`/settings?gmail_error=${encodeURIComponent(String(error))}`);
  }

  if (!code || !state) {
    return res.redirect('/settings?gmail_error=missing_params');
  }

  // State is "userId:actId" — parse and validate both are valid UUIDs
  const parts = String(state).split(':');
  if (parts.length !== 2 || !UUID_RE.test(parts[0]) || !UUID_RE.test(parts[1])) {
    return res.redirect('/settings?gmail_error=invalid_state');
  }
  const [userId, actId] = parts;

  try {
    const service = getServiceClient();

    // Re-verify ownership server-side — the state parameter is untrusted
    const { data: profile } = await service
      .from('profiles')
      .select('act_id, role')
      .eq('id', userId)
      .maybeSingle();

    if (
      !profile ||
      profile.act_id !== actId ||
      !['band_admin', 'superadmin'].includes(profile.role)
    ) {
      return res.redirect('/settings?gmail_error=forbidden');
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        code:          String(code),
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:  `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.camelranchbooking.com'}/api/auth/google/gmail-callback`,
        grant_type:    'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      console.error('Gmail token exchange failed:', tokens);
      return res.redirect('/settings?gmail_error=token_exchange_failed');
    }

    // Get the connected Gmail address
    const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const gmailProfile = await profileRes.json();

    await service
      .from('acts')
      .update({
        google_access_token:  tokens.access_token,
        google_refresh_token: tokens.refresh_token ?? null,
        gmail_address:        gmailProfile.emailAddress ?? null,
        gmail_connected_at:   new Date().toISOString(),
      })
      .eq('id', actId);

    return res.redirect('/settings?gmail_connected=true');
  } catch (err) {
    console.error('Gmail OAuth callback error:', err);
    return res.redirect('/settings?gmail_error=unknown');
  }
}
