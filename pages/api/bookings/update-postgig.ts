import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await service
    .from('profiles')
    .select('act_id, role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'band_admin' && profile?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const {
    bookingId,
    attendance,
    actual_amount_received,
    rating,
    would_return,
    venue_feedback,
    post_show_notes,
    rebook_flag,
  } = req.body;

  if (!bookingId) return res.status(400).json({ error: 'bookingId required' });

  const { data: booking } = await service
    .from('bookings')
    .select('id, act_id, venue_id')
    .eq('id', bookingId)
    .single();

  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.act_id !== profile?.act_id && profile?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Not your booking' });
  }

  const update: Record<string, any> = {};
  if (attendance             != null) update.attendance             = attendance;
  if (actual_amount_received != null) update.actual_amount_received = actual_amount_received;
  if (rating                 != null) update.rating                 = rating;
  if (would_return           != null) update.would_return           = would_return;
  if (venue_feedback         != null) update.venue_feedback         = venue_feedback;
  if (post_show_notes        != null) update.post_show_notes        = post_show_notes;
  if (rebook_flag            != null) update.rebook_flag            = rebook_flag;

  const { error } = await service.from('bookings').update(update).eq('id', bookingId);
  if (error) return res.status(500).json({ error: error.message });

  if (booking.venue_id && (rebook_flag != null || venue_feedback)) {
    await service.from('venues').update({
      ...(rebook_flag  != null ? { rebook_flag } : {}),
      ...(venue_feedback ? { issue_notes: venue_feedback } : {}),
    }).eq('id', booking.venue_id);
  }

  return res.status(200).json({ ok: true });
}
