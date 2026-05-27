import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { getValidAccessToken, listCalendars } from '../../../lib/googleCalendar';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    // Return connected status + calendar list
    const { data: settings } = await service
      .from('user_calendar_settings')
      .select('sync_enabled, selected_calendar_id, google_refresh_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!settings?.google_refresh_token) {
      return res.status(200).json({ connected: false });
    }

    const accessToken = await getValidAccessToken(user.id);
    if (!accessToken) {
      return res.status(200).json({ connected: false });
    }

    const calendars = await listCalendars(accessToken);
    return res.status(200).json({
      connected:           true,
      sync_enabled:        settings.sync_enabled,
      selected_calendar_id: settings.selected_calendar_id,
      calendars,
    });
  }

  if (req.method === 'POST') {
    // Update selected calendar or sync_enabled
    const { selected_calendar_id, sync_enabled } = req.body;
    const update: Record<string, any> = {};
    if (selected_calendar_id !== undefined) update.selected_calendar_id = selected_calendar_id;
    if (sync_enabled          !== undefined) update.sync_enabled         = sync_enabled;

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    await service.from('user_calendar_settings')
      .update(update)
      .eq('user_id', user.id);

    return res.status(200).json({ ok: true });
  }
}
