export type BookingStatus =
  | 'pitch' | 'confirmed' | 'advancing' | 'completed' | 'cancelled';

export interface BookingSummary {
  status: BookingStatus;
  show_date: string | null;
  agreed_amount: number | null;
  actual_amount_received: number | null;
}

export interface BookingCounts {
  confirmed: number;
  upcoming: number;
  pipeline: number;
  earned: number;
  potential: number;
}

export function isEarned(b: BookingSummary): boolean {
  return b.status === 'completed';
}

export function isPotential(b: BookingSummary, today: string): boolean {
  return b.status === 'confirmed' && b.show_date !== null && b.show_date >= today;
}

export function isUpcoming(b: BookingSummary, today: string): boolean {
  return (
    (b.status === 'confirmed' || b.status === 'advancing') &&
    b.show_date !== null &&
    b.show_date >= today
  );
}

export function isConfirmedOrAdvancing(b: BookingSummary): boolean {
  return b.status === 'confirmed' || b.status === 'advancing';
}

export function isInPipeline(b: BookingSummary): boolean {
  return b.status !== 'completed' && b.status !== 'cancelled';
}

export function computeBookingCounts(
  bookings: BookingSummary[],
  today: string,
): BookingCounts {
  return {
    confirmed: bookings.filter(isConfirmedOrAdvancing).length,
    upcoming: bookings.filter(b => isUpcoming(b, today)).length,
    pipeline: bookings.filter(isInPipeline).length,
    earned: bookings
      .filter(isEarned)
      .reduce((sum, b) => sum + (Number(b.actual_amount_received) || 0), 0),
    potential: bookings
      .filter(b => isPotential(b, today))
      .reduce((sum, b) => sum + (Number(b.agreed_amount) || 0), 0),
  };
}
