import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { formatShowDate } from '../../../lib/formatDate';
import { AppError, withHandler } from '../../../lib/apiError';
import { requireBandAdmin } from '../../../lib/server/requireBandAdmin';
import { parseOptionalAmount } from '../../../lib/server/bookingUpdateFields';

/**
 * POST /api/bookings/settle — band admins record a played show's payment and
 * wrap-up, mark it completed, and get a thank-you reminder.
 *
 * Service role (RLS bypassed): the caller must be a band admin/superadmin of
 * the booking's band. Members previously could call this and mark shows paid.
 *
 * @throws AppError 400 bad body/amount, 401/403 auth, 404 booking not in band
 */
export default withHandler(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') throw new AppError(405, 'Method not allowed');

  const service = getServiceClient();
  const caller = await requireBandAdmin(req, service);
  const userId = caller.userId;

  const {
    bookingId, actual_amount_received, final_payment_received,
    payment_status, post_show_notes, rebook_flag, issue_notes,
    would_return, rating, attendance,
  } = req.body ?? {};
  if (!bookingId) throw new AppError(400, 'bookingId required');

  let received: number | null;
  let finalPayment: number | null;
  try {
    received = parseOptionalAmount(actual_amount_received, 'actual_amount_received');
    finalPayment = parseOptionalAmount(final_payment_received, 'final_payment_received');
  } catch (err) {
    throw new AppError(400, err instanceof Error ? err.message : 'Invalid amount');
  }
  if (payment_status != null && !['pending', 'received', 'settled'].includes(payment_status)) {
    throw new AppError(400, 'payment_status must be pending, received or settled');
  }

  // Band admins: their own band only. Superadmin: any band (support work).
  let bookingQuery = service
    .from('bookings')
    .select('act_id, venue_id, show_date, venue:venues(name)')
    .eq('id', bookingId);
  if (caller.role !== 'superadmin') bookingQuery = bookingQuery.eq('act_id', caller.actId);
  const { data: booking } = await bookingQuery.maybeSingle();
  if (!booking) throw new AppError(404, 'Booking not found');
  const actId = String(booking.act_id);

  const { error: updateErr } = await service.from('bookings').update({
    status:                  'completed',
    settled_by:              userId,
    actual_amount_received:  received,
    final_payment_received:  finalPayment,
    payment_status:          payment_status          || 'received',
    post_show_notes:         post_show_notes         || null,
    rebook_flag:             rebook_flag             || null,
    issue_notes:             issue_notes             || null,
    would_return:            would_return != null    ? Boolean(would_return) : null,
    rating:                  rating                  ? parseInt(rating, 10) : null,
    attendance:              attendance              ? parseInt(attendance, 10) : null,
    updated_at:              new Date().toISOString(),
  }).eq('id', bookingId).eq('act_id', actId);

  if (updateErr) throw new Error(`Settle failed: ${updateErr.message}`);

  // Update venue with rebook flag and notes
  if (booking.venue_id && (rebook_flag || issue_notes)) {
    await service.from('venues').update({
      rebook_flag: rebook_flag || null,
      issue_notes: issue_notes || null,
    }).eq('id', booking.venue_id);
  }

  // Create thank-you reminder notification
  const showDate = booking.show_date
    ? formatShowDate(booking.show_date, { month: 'short', day: 'numeric' })
    : '';
  const venueName = (booking.venue as any)?.name || 'venue';

  await service.from('notifications').insert({
    user_id:    userId,
    type:       'thank_you_due',
    message:    `Send thank-you email to ${venueName}${showDate ? ` (${showDate} show)` : ''}`,
    action_url: '/email',
    read:       false,
  });

  return res.status(200).json({ ok: true });
});
