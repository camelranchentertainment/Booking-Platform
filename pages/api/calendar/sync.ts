import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { syncBookingToGoogleCalendar } from '../../../lib/calendarSync';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const service = getServiceClient();

  const {
    data: { user },
  } = await service.auth.getUser(token);

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Verify this user has a configured Google Calendar connection.
  const { data: settings } = await service
    .from('user_calendar_settings')
    .select(
      'act_id, sync_enabled, selected_calendar_id, google_refresh_token',
    )
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

  // Use the user's current profile as the authoritative act relationship.
  const { data: profile } = await service
    .from('profiles')
    .select('act_id')
    .eq('id', user.id)
    .maybeSingle();

  const actId = profile?.act_id;

  if (!actId) {
    return res.status(400).json({ error: 'No act linked to account' });
  }

  /*
   * Fetch every booking for the act.
   *
   * The shared helper decides whether each booking should:
   *   - exist on Google Calendar
   *   - be updated
   *   - be removed
   *   - be skipped
   *
   * This also cleans up existing events if a booking moves backward from
   * confirmed to hold/contract/etc.
   */
  const { data: bookings, error: bookingsError } = await service
    .from('bookings')
    .select('id')
    .eq('act_id', actId);

  if (bookingsError) {
    return res.status(500).json({
      error: `Could not load bookings: ${bookingsError.message}`,
    });
  }

  let synced = 0;
  let deleted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const booking of bookings || []) {
    try {
      const result = await syncBookingToGoogleCalendar(
        booking.id as string,
        actId,
      );

      if (result.synced) synced++;
      if (result.deleted) deleted++;
      if (result.skipped) skipped++;
    } catch (err: any) {
      errors.push(`${booking.id}: ${err.message}`);
    }
  }

  return res.status(200).json({
    ok: errors.length === 0,
    synced,
    deleted,
    skipped,
    errors,
  });
}