import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { bookingId, actual_amount_received, payment_status, post_show_notes, rebook_flag, issue_notes } = req.body;
  if (!bookingId) return res.status(400).json({ error: 'bookingId required' });

  const { data: booking } = await service
    .from('bookings')
    .select('venue_id, show_date, venue:venues(name)')
    .eq('id', bookingId)
    .single();
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const { error: updateErr } = await service.from('bookings').update({
    status:                 'completed',
    settled_by:             user.id,
    actual_amount_received: actual_amount_received ? parseFloat(actual_amount_received) : null,
    payment_status:         payment_status || 'received',
    post_show_notes:        post_show_notes  || null,
    rebook_flag:            rebook_flag      || null,
    issue_notes:            issue_notes      || null,
  }).eq('id', bookingId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  // Update venue with rebook flag and notes
  if (booking.venue_id && (rebook_flag || issue_notes)) {
    await service.from('venues').update({
      rebook_flag: rebook_flag || null,
      issue_notes: issue_notes || null,
    }).eq('id', booking.venue_id);
  }

  // Create thank-you reminder notification
  const showDate = booking.show_date
    ? new Date(booking.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  const venueName = (booking.venue as any)?.name || 'venue';

  await service.from('notifications').insert({
    user_id:    user.id,
    type:       'thank_you_due',
    message:    `Send thank-you email to ${venueName}${showDate ? ` (${showDate} show)` : ''}`,
    action_url: '/email',
    read:       false,
  });

  return res.status(200).json({ ok: true });
}
