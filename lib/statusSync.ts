import { SupabaseClient } from '@supabase/supabase-js';
import type { BookingStatus, OutreachStatus } from './types';

const TOUR_VENUE_TO_BOOKING_STATUS: Record<OutreachStatus, BookingStatus> = {
  target:      'pitch',
  pitched:     'pitch',
  followup:    'followup',
  negotiating: 'negotiation',
  confirmed:   'confirmed',
  declined:    'cancelled',
};

const BOOKING_TO_TOUR_VENUE_STATUS: Partial<Record<BookingStatus, OutreachStatus>> = {
  pitch:       'target',
  followup:    'followup',
  negotiation: 'negotiating',
  hold:        'negotiating',
  contract:    'negotiating',
  confirmed:   'confirmed',
  advancing:   'confirmed',
  completed:   'confirmed',
  cancelled:   'declined',
};

export const STATUS_LABELS: Record<string, string> = {
  pitch:       'Pitch',
  followup:    'Follow-up',
  negotiation: 'Negotiation',
  hold:        'Hold',
  contract:    'Contract',
  confirmed:   'Confirmed',
  advancing:   'Advancing',
  completed:   'Completed',
  cancelled:   'Cancelled',
  target:      'Target',
  pitched:     'Pitched',
  negotiating: 'Negotiating',
  declined:    'Declined',
};

export const STATUS_COLORS: Record<string, string> = {
  pitch:       '#94a3b8',
  followup:    '#c084fc',
  negotiation: '#fbbf24',
  hold:        '#f97316',
  contract:    '#a78bfa',
  confirmed:   '#34d399',
  advancing:   '#60a5fa',
  completed:   '#6b7280',
  cancelled:   '#ef4444',
  target:      '#94a3b8',
  pitched:     '#c084fc',
  negotiating: '#fbbf24',
  declined:    '#ef4444',
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
  await sb
    .from('tour_venues')
    .update({ status: newStatus, updated_at: new Date().toISOString(), ...extra })
    .eq('id', tourVenueId);
  await syncBooking(sb, tourVenueId, userId);
}

// Atomically updates bookings.status and syncs back to the associated tour_venue (if linked).
export async function updateBookingStatus(
  sb: SupabaseClient,
  bookingId: string,
  newStatus: BookingStatus
): Promise<void> {
  await sb.from('bookings').update({ status: newStatus }).eq('id', bookingId);

  const tvStatus = BOOKING_TO_TOUR_VENUE_STATUS[newStatus];
  if (!tvStatus) return;

  const { data: booking } = await sb
    .from('bookings')
    .select('tour_id, venue_id')
    .eq('id', bookingId)
    .single();
  if (!booking?.tour_id || !booking?.venue_id) return;

  await sb
    .from('tour_venues')
    .update({ status: tvStatus, updated_at: new Date().toISOString() })
    .eq('tour_id', booking.tour_id)
    .eq('venue_id', booking.venue_id);
}
