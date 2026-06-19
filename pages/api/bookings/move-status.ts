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

  // Resolve caller's act and verify booking ownership before any mutation.
  // Service client bypasses RLS so the ownership check must be explicit.
  const { data: profile } = await service
    .from('profiles')
    .select('act_id')
    .eq('id', user.id)
    .single();
  if (!profile?.act_id) throw new AppError(403, 'Forbidden');

  const { data: booking } = await service
    .from('bookings')
    .select('id, act_id, venue:venues(name, city, state), show_date')
    .eq('id', bookingId)
    .eq('act_id', profile.act_id)
    .maybeSingle();
  if (!booking) throw new AppError(403, 'Forbidden');

  await updateBookingStatus(service, bookingId, status as BookingStatus);

  if (status === 'confirmed') {
    const venueName = (booking.venue as any)?.name || 'venue';
    const city = (booking.venue as any)?.city || '';
    const dateStr = booking.show_date
      ? new Date(booking.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
