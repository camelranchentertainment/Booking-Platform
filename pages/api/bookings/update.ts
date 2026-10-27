import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { syncBookingToGoogleCalendar } from '../../../lib/calendarSync';
import { AppError, withHandler } from '../../../lib/apiError';
import { requireBandAdmin } from '../../../lib/server/requireBandAdmin';
import { pickBookingUpdates } from '../../../lib/server/bookingUpdateFields';

/**
 * POST /api/bookings/update  { bookingId, updates }
 *
 * Band admins edit one of their band's shows. Runs with the service role, so:
 * - the caller must be a band admin/superadmin of the booking's band
 *   (members previously could call this and change any field);
 * - only allowlisted fields are written; act_id, created_by and the
 *   money-received fields can never be set through here;
 * - a venue or tour being attached must belong to the same band.
 *
 * Superadmin may edit any band's show (support work).
 *
 * @throws AppError 400 bad body, 401/403 auth, 404 booking not in caller's band
 */
export default withHandler(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') throw new AppError(405, 'Method not allowed');

  const service = getServiceClient();
  const caller = await requireBandAdmin(req, service);

  const { bookingId, updates } = (req.body ?? {}) as { bookingId?: unknown; updates?: unknown };
  if (typeof bookingId !== 'string' || !bookingId) throw new AppError(400, 'bookingId and updates are required');

  // Band admins: their own band only. Superadmin: any band (support work).
  let bookingQuery = service.from('bookings').select('id, act_id').eq('id', bookingId);
  if (caller.role !== 'superadmin') bookingQuery = bookingQuery.eq('act_id', caller.actId);
  const { data: booking } = await bookingQuery.maybeSingle();
  if (!booking) throw new AppError(404, 'Booking not found');
  const actId = String(booking.act_id);

  // The editor echoes the show's act_id back; that's fine. A different one is
  // an attempt to move the show to another band.
  const bodyActId = (updates as { act_id?: unknown } | null)?.act_id;
  if (bodyActId !== undefined && bodyActId !== null && bodyActId !== actId) {
    throw new AppError(400, "A show can't be moved to another band");
  }
  const { allowed, dropped } = pickBookingUpdates(updates);
  const ignored = dropped.filter(k => k !== 'act_id');
  if (ignored.length) console.warn('[bookings/update] ignored fields', { ignored });
  if (Object.keys(allowed).length === 0) throw new AppError(400, 'No editable fields in updates');

  // Linked records must be the band's own.
  if (typeof allowed.venue_id === 'string' && allowed.venue_id) {
    const { data: v } = await service.from('venues').select('id').eq('id', allowed.venue_id).eq('act_id', actId).maybeSingle();
    if (!v) throw new AppError(400, 'Venue not found');
  }
  if (typeof allowed.tour_id === 'string' && allowed.tour_id) {
    const { data: t } = await service.from('tours').select('id').eq('id', allowed.tour_id).eq('act_id', actId).maybeSingle();
    if (!t) throw new AppError(400, 'Tour not found');
  }

  const { error: updateError } = await service
    .from('bookings')
    .update(allowed)
    .eq('id', bookingId)
    .eq('act_id', actId);
  if (updateError) throw new Error(`Booking update failed: ${updateError.message}`);

  // Keep Google Calendar in step; a Google hiccup must not fail the edit.
  try {
    await syncBookingToGoogleCalendar(bookingId, actId);
  } catch (calendarError) {
    console.error('Google Calendar sync failed:', calendarError);
  }

  res.status(200).json({ ok: true });
});
