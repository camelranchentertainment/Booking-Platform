import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../../lib/supabase';
import { exchangeCode } from '../../../../lib/googleCalendar';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const { code, state: userId, error } = req.query;

  if (error) {
    return res.redirect(`/settings?calendar_error=${encodeURIComponent(String(error))}`);
  }

  if (!code || !userId) {
    return res.redirect('/settings?calendar_error=missing_params');
  }

  try {
    const tokens = await exchangeCode(String(code));

    const service = getServiceClient();

    const { data: profileRow } = await service
      .from('user_profiles')
      .select('act_id')
      .eq('id', String(userId))
      .maybeSingle();

    await service.from('user_calendar_settings').upsert({
      user_id:              String(userId),
      act_id:               profileRow?.act_id || null,
      google_access_token:  tokens.access_token,
      google_refresh_token: tokens.refresh_token,
      google_token_expiry:  new Date(tokens.expiry_date).toISOString(),
      sync_enabled:         true,
    }, { onConflict: 'user_id' });

    return res.redirect('/settings?calendar_connected=1');
  } catch (err: any) {
    console.error('Google OAuth callback error:', err);
    return res.redirect(`/settings?calendar_error=${encodeURIComponent(err.message || 'unknown')}`);
  }
}
