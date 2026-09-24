import { getServiceClient } from './supabase';
import {
  getValidAccessToken,
  createOrUpdateEvent,
  deleteEvent,
} from './googleCalendar';

const CALENDAR_STATUSES = ['confirmed', 'advancing', 'completed'];

type SyncResult = {
  synced: boolean;
  deleted: boolean;
  skipped: boolean;
  reason?: string;
};

/**
 * Sync one booking to the connected Google Calendar for an act.
 *
 * confirmed / advancing / completed:
 *   create or update the Google event
 *
 * all other statuses:
 *   remove the Google event if one exists
 *
 * If Google Calendar isn't connected/configured, quietly skip.
 */
export async function syncBookingToGoogleCalendar(
  bookingId: string,
  actId: string,
): Promise<SyncResult> {
  const service = getServiceClient();

  // Find an enabled Google Calendar connection for this act.
  const { data: settings, error: settingsError } = await service
    .from('user_calendar_settings')
    .select(
      'user_id, selected_calendar_id, sync_enabled, google_refresh_token',
    )
    .eq('act_id', actId)
    .eq('sync_enabled', true)
    .not('google_refresh_token', 'is', null)
    .not('selected_calendar_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (settingsError) {
    throw new Error(`Calendar settings lookup failed: ${settingsError.message}`);
  }

  if (!settings) {
    return {
      synced: false,
      deleted: false,
      skipped: true,
      reason: 'Google Calendar is not connected or sync is disabled',
    };
  }

  // Load the current booking state.
  const { data: booking, error: bookingError } = await service
    .from('bookings')
    .select(
      'id, act_id, status, show_date, google_event_id, act:acts(act_name), venue:venues(name, city, state)',
    )
    .eq('id', bookingId)
    .eq('act_id', actId)
    .maybeSingle();

  if (bookingError) {
    throw new Error(`Booking lookup failed: ${bookingError.message}`);
  }

  if (!booking) {
    return {
      synced: false,
      deleted: false,
      skipped: true,
      reason: 'Booking not found',
    };
  }

  const accessToken = await getValidAccessToken(settings.user_id);

  if (!accessToken) {
    throw new Error('Could not refresh Google Calendar access token');
  }

  const calendarId = settings.selected_calendar_id as string;
  const shouldBeOnCalendar =
    CALENDAR_STATUSES.includes(booking.status) && Boolean(booking.show_date);

  /*
   * Booking no longer belongs on the calendar.
   *
   * This covers cancelled as well as bookings moved backward to
   * pitch / negotiation / hold / contract.
   */
  if (!shouldBeOnCalendar) {
    if (!booking.google_event_id) {
      return {
        synced: false,
        deleted: false,
        skipped: true,
        reason: 'Booking does not require a calendar event',
      };
    }

    await deleteEvent(
      accessToken,
      calendarId,
      booking.google_event_id as string,
    );

    await service
      .from('bookings')
      .update({ google_event_id: null })
      .eq('id', booking.id)
      .eq('act_id', actId);

    return {
      synced: false,
      deleted: true,
      skipped: false,
    };
  }

  const act = (booking.act as any)?.act_name || 'Show';
  const venue = (booking.venue as any)?.name || '';
  const city = (booking.venue as any)?.city || '';
  const state = (booking.venue as any)?.state || '';

  const summary = venue ? `${act} @ ${venue}` : act;
  const location = [venue, city, state].filter(Boolean).join(', ');
  const showDate = booking.show_date as string;

  // Google all-day event end dates are exclusive.
  const endDate = (() => {
    const d = new Date(`${showDate}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const googleEventId = await createOrUpdateEvent(
    accessToken,
    calendarId,
    {
      summary,
      location,
      start: showDate,
      end: endDate,
    },
    booking.google_event_id || undefined,
  );

  if (googleEventId !== booking.google_event_id) {
    await service
      .from('bookings')
      .update({ google_event_id: googleEventId })
      .eq('id', booking.id)
      .eq('act_id', actId);
  }

  return {
    synced: true,
    deleted: false,
    skipped: false,
  };
}