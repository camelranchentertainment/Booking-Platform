import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { syncBookingToGoogleCalendar } from '../../../lib/calendarSync';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const service = getServiceClient();

    const {
      data: { user },
      error: authError,
    } = await service.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { bookingId, updates } = req.body;

    if (!bookingId || !updates) {
      return res.status(400).json({
        error: 'bookingId and updates are required',
      });
    }

    // Load booking first so we know which act owns it.
    const { data: booking, error: bookingError } = await service
      .from('bookings')
      .select('id, act_id')
      .eq('id', bookingId)
      .maybeSingle();

    if (bookingError || !booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Make sure this user belongs to the act.
    const { data: profile } = await service
      .from('profiles')
      .select('act_id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (
      !profile ||
      (profile.role !== 'superadmin' && profile.act_id !== booking.act_id)
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { error: updateError } = await service
      .from('bookings')
      .update(updates)
      .eq('id', bookingId)
      .eq('act_id', booking.act_id);

    if (updateError) {
      throw new Error(`Booking update failed: ${updateError.message}`);
    }

    // Keep Google Calendar synchronized after any booking edit.
    try {
      await syncBookingToGoogleCalendar(bookingId, booking.act_id);
    } catch (calendarError) {
      // Booking edits should still succeed if Google has a temporary problem.
      console.error('Google Calendar sync failed:', calendarError);
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('Booking update error:', error);

    return res.status(500).json({
      error: error?.message || 'Failed to update booking',
    });
  }
}