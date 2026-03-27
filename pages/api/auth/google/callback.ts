import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { exchangeCodeForTokens, encryptToken } from '../../../../lib/googleCalendar';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// GET /api/auth/google/callback?code=...&state=<base64url userId>
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect(
      `/settings?calendar=error&message=${encodeURIComponent(oauthError as string)}`,
    );
  }

  if (!code || !state) {
    return res.redirect('/settings?calendar=error&message=Missing+parameters');
  }

  try {
    // Decode userId from state param
    const userId = Buffer.from(state as string, 'base64url').toString('utf8');

    // Exchange authorization code for tokens
    const tokens = await exchangeCodeForTokens(code as string);

    if (!tokens.refresh_token) {
      // This happens if the user has already authorized before and didn't re-consent.
      // We forced prompt=consent so this shouldn't normally happen, but handle gracefully.
      return res.redirect(
        '/settings?calendar=error&message=' +
        encodeURIComponent(
          'No refresh token received. Please disconnect and reconnect to force re-authorization.',
        ),
      );
    }

    // Encrypt the refresh token before storing
    const encryptedRefreshToken = encryptToken(tokens.refresh_token);

    // Upsert into user_calendar_settings (one row per user)
    const { error: dbError } = await supabase
      .from('user_calendar_settings')
      .upsert(
        {
          user_id:              userId,
          calendar_type:        'google_oauth',
          google_refresh_token: encryptedRefreshToken,
          is_active:            true,
          updated_at:           new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (dbError) throw dbError;

    return res.redirect('/settings?calendar=connected');
  } catch (err: any) {
    console.error('[google/callback] Error:', err);
    return res.redirect(
      `/settings?calendar=error&message=${encodeURIComponent(err.message || 'Connection failed')}`,
    );
  }
}
