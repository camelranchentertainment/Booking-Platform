import { SupabaseClient } from '@supabase/supabase-js';
import type { BookingStatus, OutreachStatus } from './types';

const TOUR_VENUE_TO_BOOKING_STATUS: Record<OutreachStatus, BookingStatus> = {
  target:    'pitch',
  follow_up: 'negotiation',
  confirmed: 'confirmed',
  declined:  'cancelled',
  thank_you: 'confirmed',
};

const BOOKING_TO_TOUR_VENUE_STATUS: Partial<Record<BookingStatus, OutreachStatus>> = {
  pitch:       'target',
  negotiation: 'follow_up',
  hold:        'follow_up',
  contract:    'follow_up',
  confirmed:   'confirmed',
  advancing:   'confirmed',
  completed:   'confirmed',
  cancelled:   'declined',
};

export const STATUS_LABELS: Record<string, string> = {
  pitch:       'Pitch',
  negotiation: 'Negotiation',
  hold:        'Hold',
  contract:    'Contract',
  confirmed:   'Confirm',
  advancing:   'Advancing',
  completed:   'Completed',
  cancelled:   'Cancelled',
  target:      'Target',
  follow_up:   'Follow Up',
  declined:    'Declined',
  thank_you:   'Thank You',
};

export const STATUS_COLORS: Record<string, string> = {
  // Outreach statuses
  target:    '#6B8FB5',
  follow_up: '#F5C842',
  confirmed: '#4CAF50',
  declined:  '#888888',
  thank_you: '#6b7280',
  // Booking pipeline statuses
  pitch:       '#6B8FB5',
  negotiation: '#F5C842',
  hold:        '#F5C842',
  contract:    '#a78bfa',
  advancing:   '#60a5fa',
  completed:   '#6b7280',
  cancelled:   '#888888',
};

/**
 * Keeps an existing show (bookings row) for a tour target in step with the
 * target's outreach status. Call after the tour_venue row has been updated.
 *
 * A tour target is NOT a show: this never creates a bookings row. Shows are
 * created only when a venue confirms (pages/api/tours/venue-confirm.ts). It
 * used to insert a "pitch" show for every target, dated on the tour's last day,
 * which crowded the calendar and, on confirm, produced a duplicate show.
 *
 * @param _userId kept for call-site compatibility; no longer used
 */
export async function syncBooking(
  sb: SupabaseClient,
  tourVenueId: string,
  _userId: string
): Promise<void> {
  const { data: tv, error: tvErr } = await sb
    .from('tour_venues')
    .select('id, venue_id, tour_id, status, tour:tours(id, act_id)')
    .eq('id', tourVenueId)
    .maybeSingle();
  if (tvErr) {
    console.error('[statusSync] tour_venue lookup failed', { tourVenueId, error: tvErr.message });
    return;
  }
  if (!tv) return;

  // PostgREST types an embedded to-one relation as an array; accept either shape.
  const tourRel: unknown = tv.tour;
  const tour = (Array.isArray(tourRel) ? tourRel[0] : tourRel) as { act_id?: unknown } | null | undefined;
  const actId = typeof tour?.act_id === 'string' ? tour.act_id : null;
  if (!actId || !tv.venue_id) return;

  const bookingStatus = TOUR_VENUE_TO_BOOKING_STATUS[tv.status as OutreachStatus];
  // Only outcomes that matter to a real show are mirrored. Moving a target
  // between "target" and "follow up" never touches the calendar.
  if (bookingStatus !== 'confirmed' && bookingStatus !== 'cancelled') return;

  // Update in place (all matching shows), so two rows can never make the lookup
  // ambiguous and trigger an extra insert as the old code did.
  // "confirmed" only lifts shows that are not yet confirmed — it never pulls an
  // advancing/completed show backwards. "cancelled" closes any open show.
  const notIn = bookingStatus === 'confirmed'
    ? '("confirmed","advancing","completed","cancelled")'
    : '("completed","cancelled")';
  const { error: updErr } = await sb
    .from('bookings')
    .update({ status: bookingStatus })
    .eq('venue_id', tv.venue_id)
    .eq('act_id', actId)
    .eq('tour_id', tv.tour_id)
    .not('status', 'in', notIn);
  if (updErr) {
    console.error('[statusSync] booking status update failed', { tourVenueId, error: updErr.message });
  }
}

// Atomically updates tour_venues.status (+ any extra fields) and syncs the mirrored booking.
export async function updateVenueStatus(
  sb: SupabaseClient,
  tourVenueId: string,
  newStatus: OutreachStatus,
  userId: string,
  extra: Record<string, any> = {}
): Promise<void> {
  const { error } = await sb
    .from('tour_venues')
    .update({ status: newStatus, updated_at: new Date().toISOString(), ...extra })
    .eq('id', tourVenueId);
  if (error) throw new Error(`tour_venues update failed: ${error.message}`);
  await syncBooking(sb, tourVenueId, userId);
}

// Atomically updates bookings.status and syncs back to the associated tour_venue (if linked).
// actId is required so the UPDATE is self-contained and can't affect another act's booking
// even if the caller forgets to pre-check ownership.
export async function updateBookingStatus(
  sb: SupabaseClient,
  bookingId: string,
  newStatus: BookingStatus,
  actId: string
): Promise<void> {
  await sb.from('bookings').update({ status: newStatus })
    .eq('id', bookingId)
    .eq('act_id', actId);

  const tvStatus = BOOKING_TO_TOUR_VENUE_STATUS[newStatus];
  if (!tvStatus) return;

  const { data: booking } = await sb
    .from('bookings')
    .select('tour_id, venue_id')
    .eq('id', bookingId)
    .eq('act_id', actId)
    .single();
  if (!booking?.tour_id || !booking?.venue_id) return;

  await sb
    .from('tour_venues')
    .update({ status: tvStatus, updated_at: new Date().toISOString() })
    .eq('tour_id', booking.tour_id)
    .eq('venue_id', booking.venue_id);
}
