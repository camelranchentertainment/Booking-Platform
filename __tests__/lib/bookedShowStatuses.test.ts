// __tests__/lib/bookedShowStatuses.test.ts
// History and "needs settle" must only include shows that were actually booked.
import { BOOKED_SHOW_STATUSES, BOOKING_STATUS_ORDER } from '../../lib/types';

describe('BOOKED_SHOW_STATUSES', () => {
  it('excludes outreach stages (targets / pitches, negotiation, hold)', () => {
    for (const s of ['pitch', 'negotiation', 'hold'] as const) {
      expect(BOOKED_SHOW_STATUSES).not.toContain(s);
    }
  });

  it('excludes cancelled shows', () => {
    expect(BOOKED_SHOW_STATUSES).not.toContain('cancelled');
  });

  it('includes every stage from contract onward', () => {
    expect([...BOOKED_SHOW_STATUSES]).toEqual(['contract', 'confirmed', 'advancing', 'completed']);
  });

  it('only uses real booking statuses', () => {
    for (const s of BOOKED_SHOW_STATUSES) expect(BOOKING_STATUS_ORDER).toContain(s);
  });
});
