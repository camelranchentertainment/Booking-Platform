// __tests__/lib/bookingUpdateFields.test.ts
import { parseOptionalAmount, pickBookingUpdates } from '../../lib/server/bookingUpdateFields';

describe('pickBookingUpdates', () => {
  it('keeps editor fields and drops everything else', () => {
    const { allowed, dropped } = pickBookingUpdates({
      status: 'confirmed',
      show_date: '2026-11-20',
      agreed_amount: 500,
      act_id: 'someone-elses-band',
      created_by: 'x',
      actual_amount_received: 9999,
      id: 'other-booking',
    });
    expect(allowed).toEqual({ status: 'confirmed', show_date: '2026-11-20', agreed_amount: 500 });
    expect(dropped.sort()).toEqual(['act_id', 'actual_amount_received', 'created_by', 'id']);
  });

  it('returns nothing for non-objects', () => {
    expect(pickBookingUpdates(null).allowed).toEqual({});
    expect(pickBookingUpdates('status=confirmed').allowed).toEqual({});
    expect(pickBookingUpdates([1, 2]).allowed).toEqual({});
  });
});

describe('parseOptionalAmount', () => {
  it('keeps 0, parses strings, blanks are null', () => {
    expect(parseOptionalAmount(0, 'x')).toBe(0);
    expect(parseOptionalAmount('0', 'x')).toBe(0);
    expect(parseOptionalAmount('450.50', 'x')).toBe(450.5);
    expect(parseOptionalAmount('', 'x')).toBeNull();
    expect(parseOptionalAmount(undefined, 'x')).toBeNull();
  });

  it('rejects garbage and negatives', () => {
    expect(() => parseOptionalAmount('abc', 'amount')).toThrow('amount must be a non-negative number');
    expect(() => parseOptionalAmount(-5, 'amount')).toThrow();
  });
});
