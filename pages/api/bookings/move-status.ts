import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { updateBookingStatus } from '../../../lib/statusSync';
import type { BookingStatus } from '../../../lib/types';
import { AppError, withHandler } from '../../../lib/apiError';
import { notifyActMembers } from '../../../lib/notifications';

export default withHandler(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') throw new AppError(405, 'Method not allowed');

  const { bookingId, status } = req.body;
  if (!bookingId || !status) throw new AppError(400, 'bookingId and status required');

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new AppError(401, 'Unauthorized');

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) throw new AppError(401, 'Unauthorized');

  await updateBookingStatus(service, bookingId, status as BookingStatus);

  if (status === 'confirmed') {
    const { data: booking } = await service
      .from('bookings')
      .select('act_id, venue:venues(name, city, state), show_date')
      .eq('id', bookingId)
      .maybeSingle();

    if (booking?.act_id) {
      const venueName = (booking.venue as any)?.name || 'venue';
      const city = (booking.venue as any)?.city || '';
      const dateStr = booking.show_date
        ? new Date(booking.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
      await notifyActMembers({
        actId:     booking.act_id,
        type:      'booking_confirmed',
        message:   `Show confirmed: ${venueName}${city ? `, ${city}` : ''}${dateStr ? ` — ${dateStr}` : ''}`,
        actionUrl: '/band',
      });
    }
  }

  return res.status(200).json({ ok: true });
});
