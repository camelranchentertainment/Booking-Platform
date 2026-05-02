import {
  isEarned, isPotential, isUpcoming, isInPipeline,
  isConfirmedOrAdvancing, computeBookingCounts,
  BookingSummary,
} from '../../../lib/domain/booking';

const TODAY = '2026-05-02';
const YESTERDAY = '2026-05-01';
const TOMORROW = '2026-05-03';

function b(status: string, show_date: string | null = TODAY, agreed_amount: number | null = null, actual_amount_received: number | null = null): BookingSummary {
  return { status: status as any, show_date, agreed_amount, actual_amount_received };
}

// ─── isEarned ────────────────────────────────────────────────────────────────

describe('isEarned', () => {
  it('returns true for completed bookings', () => {
    expect(isEarned(b('completed'))).toBe(true);
  });
  it('returns false for confirmed', () => {
    expect(isEarned(b('confirmed'))).toBe(false);
  });
  it('returns false for cancelled', () => {
    expect(isEarned(b('cancelled'))).toBe(false);
  });
});

// ─── isPotential ─────────────────────────────────────────────────────────────

describe('isPotential', () => {
  it('returns true for confirmed + future show', () => {
    expect(isPotential(b('confirmed', TOMORROW), TODAY)).toBe(true);
  });
  it('returns false for confirmed + past show', () => {
    expect(isPotential(b('confirmed', YESTERDAY), TODAY)).toBe(false);
  });
  it('returns false for advancing (not confirmed)', () => {
    expect(isPotential(b('advancing', TOMORROW), TODAY)).toBe(false);
  });
  it('returns false when show_date is null', () => {
    expect(isPotential(b('confirmed', null), TODAY)).toBe(false);
  });
  it('returns true for confirmed show on today', () => {
    expect(isPotential(b('confirmed', TODAY), TODAY)).toBe(true);
  });
});

// ─── isUpcoming ───────────────────────────────────────────────────────────────

describe('isUpcoming', () => {
  it('returns true for confirmed + future', () => {
    expect(isUpcoming(b('confirmed', TOMORROW), TODAY)).toBe(true);
  });
  it('returns true for advancing + future', () => {
    expect(isUpcoming(b('advancing', TOMORROW), TODAY)).toBe(true);
  });
  it('returns false for confirmed + past', () => {
    expect(isUpcoming(b('confirmed', YESTERDAY), TODAY)).toBe(false);
  });
  it('returns false for completed', () => {
    expect(isUpcoming(b('completed', TOMORROW), TODAY)).toBe(false);
  });
  it('returns false when show_date is null', () => {
    expect(isUpcoming(b('confirmed', null), TODAY)).toBe(false);
  });
});

// ─── isInPipeline ─────────────────────────────────────────────────────────────

describe('isInPipeline', () => {
  it('returns true for confirmed', () => expect(isInPipeline(b('confirmed'))).toBe(true));
  it('returns true for pending', () => expect(isInPipeline(b('pitch'))).toBe(true));
  it('returns false for completed', () => expect(isInPipeline(b('completed'))).toBe(false));
});

// ─── isConfirmedOrAdvancing ───────────────────────────────────────────────────

describe('isConfirmedOrAdvancing', () => {
  it('returns true for confirmed', () => expect(isConfirmedOrAdvancing(b('confirmed'))).toBe(true));
  it('returns true for advancing', () => expect(isConfirmedOrAdvancing(b('advancing'))).toBe(true));
  it('returns false for pitch', () => expect(isConfirmedOrAdvancing(b('pitch'))).toBe(false));
  it('returns false for completed', () => expect(isConfirmedOrAdvancing(b('completed'))).toBe(false));
});

// ─── computeBookingCounts ─────────────────────────────────────────────────────

describe('computeBookingCounts', () => {
  it('returns zeros for empty array', () => {
    expect(computeBookingCounts([], TODAY)).toEqual({
      confirmed: 0, upcoming: 0, pipeline: 0, earned: 0, potential: 0,
    });
  });

  it('correctly aggregates a mixed set of bookings', () => {
    const bookings: BookingSummary[] = [
      b('confirmed',  TOMORROW,  500, null),  // confirmed + upcoming + pipeline + potential
      b('advancing',  TOMORROW,  300, null),  // confirmed + upcoming + pipeline
      b('pitch',      TOMORROW,  200, null),  // pipeline only
      b('completed',  YESTERDAY, 400, 350),   // earned
      b('confirmed',  YESTERDAY, 100, null),  // confirmed (past — not upcoming, not potential)
    ];
    const counts = computeBookingCounts(bookings, TODAY);
    expect(counts.confirmed).toBe(3);  // confirmed + advancing + confirmed-past
    expect(counts.upcoming).toBe(2);   // confirmed-future + advancing-future
    expect(counts.pipeline).toBe(4);   // all except completed
    expect(counts.earned).toBe(350);   // actual_amount_received from completed
    expect(counts.potential).toBe(500); // agreed_amount from confirmed-future only
  });

  it('treats null amounts as zero', () => {
    const bookings: BookingSummary[] = [
      b('completed', YESTERDAY, null, null),
      b('confirmed', TOMORROW,  null, null),
    ];
    const counts = computeBookingCounts(bookings, TODAY);
    expect(counts.earned).toBe(0);
    expect(counts.potential).toBe(0);
  });
});
