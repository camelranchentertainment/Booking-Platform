import type { NextApiRequest, NextApiResponse } from 'next';
import { getTokens } from '../../../lib/googleCalendar';
import { supabase } from '../../../lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { code, state } = req.query;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'No authorization code provided' });
  }

  try {
    // Exchange code for tokens
    const tokens = await getTokens(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return res.status(400).json({ error: 'Failed to get tokens' });
    }

    // Get user email from state (passed during auth)
    const userEmail = state ? decodeURIComponent(state as string) : null;

    if (!userEmail) {
      return res.status(400).json({ error: 'No user email provided' });
    }

    // Save tokens to database
    const { error } = await supabase
      .from('user_calendar_settings')
      .upsert({
        user_email: userEmail,
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        sync_enabled: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_email'
      });

    if (error) {
      console.error('Error saving tokens:', error);
      return res.status(500).json({ error: 'Failed to save tokens' });
    }

    // Redirect back to settings page with success
    res.redirect('/dashboard?tab=settings&status=connected');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
