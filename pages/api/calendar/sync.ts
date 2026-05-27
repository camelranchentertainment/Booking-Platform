import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { getValidAccessToken, createOrUpdateEvent, deleteEvent } from '../../../lib/googleCalendar';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: settings } = await service
    .from('user_calendar_settings')
    .select('act_id, sync_enabled, selected_calendar_id, google_refresh_token')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!settings?.google_refresh_token) {
    return res.status(400).json({ error: 'Google Calendar not connected' });
  }
  if (!settings.sync_enabled) {
    return res.status(400).json({ error: 'Sync is disabled' });
  }
  if (!settings.selected_calendar_id) {
    return res.status(400).json({ error: 'No calendar selected' });
  }

  const accessToken = await getValidAccessToken(user.id);
  if (!accessToken) {
    return res.status(401).json({ error: 'Could not refresh Google token' });
  }

  const { data: profileRow } = await service
    .from('user_profiles')
    .select('act_id')
    .eq('id', user.id)
    .maybeSingle();

  const actId = profileRow?.act_id;
  if (!actId) return res.status(400).json({ error: 'No act linked to account' });

  // Fetch all confirmed bookings with show_date
  const { data: bookings } = await service
    .from('bookings')
    .select('id, show_date, google_event_id, act:acts(act_name), venue:venues(name, city, state)')
    .eq('act_id', actId)
    .eq('status', 'confirmed')
    .not('show_date', 'is', null);

  const calendarId = settings.selected_calendar_id;
  const synced: string[] = [];
  const errors: string[] = [];

  for (const booking of (bookings || [])) {
    try {
      const act   = (booking.act as any)?.act_name  || 'Show';
      const venue = (booking.venue as any)?.name     || '';
      const city  = (booking.venue as any)?.city     || '';
      const state = (booking.venue as any)?.state    || '';

      const summary     = `${act} @ ${venue}`;
      const location    = [venue, city, state].filter(Boolean).join(', ');
      const showDate    = booking.show_date as string;
      const endDate     = showDate; // all-day event, end = same day

      const googleEventId = await createOrUpdateEvent(
        accessToken,
        calendarId,
        { summary, location, start: showDate, end: endDate },
        booking.google_event_id || undefined,
      );

      if (googleEventId !== booking.google_event_id) {
        await service.from('bookings').update({ google_event_id: googleEventId }).eq('id', booking.id);
      }
      synced.push(booking.id as string);
    } catch (err: any) {
      errors.push(`${booking.id}: ${err.message}`);
    }
  }

  // Delete events for cancelled bookings that still have a google_event_id
  const { data: cancelled } = await service
    .from('bookings')
    .select('id, google_event_id')
    .eq('act_id', actId)
    .eq('status', 'cancelled')
    .not('google_event_id', 'is', null);

  for (const booking of (cancelled || [])) {
    try {
      await deleteEvent(accessToken, calendarId, booking.google_event_id as string);
      await service.from('bookings').update({ google_event_id: null }).eq('id', booking.id);
    } catch {}
  }

  return res.status(200).json({ ok: true, synced: synced.length, errors });
}
