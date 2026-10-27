import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { updateBookingStatus } from '../../../lib/statusSync';
import type { BookingStatus } from '../../../lib/types';
import { AppError, withHandler } from '../../../lib/apiError';
import { notifyActMembers } from '../../../lib/notifications';
import { formatShowDate } from '../../../lib/formatDate';
import { syncBookingToGoogleCalendar } from '../../../lib/calendarSync';
import { requireBandAdmin } from '../../../lib/server/requireBandAdmin';

export default withHandler(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') throw new AppError(405, 'Method not allowed');

  const { bookingId, status } = req.body;
  if (!bookingId || !status) throw new AppError(400, 'bookingId and status required');

  // Service role bypasses RLS: only band admins (own band) or superadmin may
  // change a show's status. Members previously could call this.
  const service = getServiceClient();
  const caller = await requireBandAdmin(req, service);

  let bookingQuery = service
    .from('bookings')
    .select('id, act_id, venue:venues(name, city, state), show_date')
    .eq('id', bookingId);
  if (caller.role !== 'superadmin') bookingQuery = bookingQuery.eq('act_id', caller.actId);
  const { data: booking } = await bookingQuery.maybeSingle();
  if (!booking) throw new AppError(404, 'Booking not found');
  const profile = { act_id: String(booking.act_id) };

  await updateBookingStatus(service, bookingId, status as BookingStatus, profile.act_id);

  // Best-effort Google Calendar sync.
// A Calendar API failure should never prevent the booking status change.
try {
  await syncBookingToGoogleCalendar(bookingId, profile.act_id);
} catch (err) {
  console.error('[calendar sync] booking status update failed:', err);
}

  if (status === 'confirmed') {
    const venueName = (booking.venue as any)?.name || 'venue';
    const city = (booking.venue as any)?.city || '';
    const dateStr = booking.show_date
      ? formatShowDate(booking.show_date, { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
    await notifyActMembers({
      actId:     profile.act_id,
      type:      'booking_confirmed',
      message:   `Show confirmed: ${venueName}${city ? `, ${city}` : ''}${dateStr ? ` — ${dateStr}` : ''}`,
      actionUrl: '/band',
    });
  }

  return res.status(200).json({ ok: true });
});
