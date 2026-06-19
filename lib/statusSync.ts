import { SupabaseClient } from '@supabase/supabase-js';
import type { BookingStatus, OutreachStatus } from './types';

const TOUR_VENUE_TO_BOOKING_STATUS: Record<OutreachStatus, BookingStatus> = {
  target:    'pitch',
  pitched:   'pitch',
  waiting:   'pitch',
  follow_up: 'negotiation',
  confirmed: 'confirmed',
  declined:  'cancelled',
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
  confirmed:   'Confirmed',
  advancing:   'Advancing',
  completed:   'Completed',
  cancelled:   'Cancelled',
  target:      'Target',
  pitched:     'Pitched',
  waiting:     'Waiting on Response',
  follow_up:   'Follow Up',
  declined:    'Declined',
};

export const STATUS_COLORS: Record<string, string> = {
  // Outreach statuses
  target:    '#6B8FB5',
  pitched:   '#E8602A',
  waiting:   '#F5A623',
  follow_up: '#F5C842',
  confirmed: '#4CAF50',
  declined:  '#888888',
  // Booking pipeline statuses
  pitch:       '#6B8FB5',
  negotiation: '#F5C842',
  hold:        '#F5C842',
  contract:    '#a78bfa',
  advancing:   '#60a5fa',
  completed:   '#6b7280',
  cancelled:   '#888888',
};

// Syncs the bookings record that mirrors a tour_venue, reading the current tv status.
// Call this after the tour_venue row has already been updated.
export async function syncBooking(
  sb: SupabaseClient,
  tourVenueId: string,
  userId: string
): Promise<void> {
  const { data: tv } = await sb
    .from('tour_venues')
    .select('id, venue_id, tour_id, status, tour:tours(id, act_id, end_date)')
    .eq('id', tourVenueId)
    .single();
  if (!tv) return;

  const tour = tv.tour as any;
  if (!tour?.act_id) return;

  const bookingStatus: BookingStatus =
    TOUR_VENUE_TO_BOOKING_STATUS[tv.status as OutreachStatus] ?? 'pitch';

  const { data: existing } = await sb
    .from('bookings')
    .select('id')
    .eq('venue_id', tv.venue_id)
    .eq('act_id', tour.act_id)
    .eq('tour_id', tv.tour_id)
    .not('status', 'in', '("completed","cancelled")')
    .maybeSingle();

  if (existing) {
    await sb.from('bookings').update({ status: bookingStatus }).eq('id', existing.id);
  } else if (bookingStatus !== 'cancelled') {
    await sb.from('bookings').insert({
      act_id:          tour.act_id,
      venue_id:        tv.venue_id,
      tour_id:         tv.tour_id,
      status:          bookingStatus,
      source:          'tour',
      created_by:      userId,
      show_date:       tour.end_date || null,
      details_pending: true,
    });
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
