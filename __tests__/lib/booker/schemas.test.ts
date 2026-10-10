// __tests__/lib/booker/schemas.test.ts
import {
  BookerSignupSchema,
  ContactSchema,
  PaymentSchema,
  RosterBandSchema,
  ShowSchema,
  VenueSchema,
  fieldErrors,
} from '../../../lib/booker/schemas';

const UUID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
const UUID2 = '4a2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b91';

describe('RosterBandSchema', () => {
  it('trims, nulls blanks and parses the rate', () => {
    const r = RosterBandSchema.parse({ band_name: '  The Jackwagons ', genre: '', commission_pct: '15', contact_email: '' });
    expect(r).toMatchObject({ band_name: 'The Jackwagons', genre: null, commission_pct: 15, contact_email: null, status: 'active' });
  });

  it('rejects a missing name and an out-of-range rate', () => {
    const r = RosterBandSchema.safeParse({ band_name: '  ', commission_pct: '150' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = fieldErrors(r.error);
      expect(errs.band_name).toMatch(/required/i);
      expect(errs.commission_pct).toMatch(/between 0 and 100/);
    }
  });

  it('rejects a bad email', () => {
    expect(RosterBandSchema.safeParse({ band_name: 'X', contact_email: 'nope' }).success).toBe(false);
  });
});

describe('VenueSchema', () => {
  it('defaults the type to venue and accepts festivals and promoters', () => {
    expect(VenueSchema.parse({ name: 'Hall' }).kind).toBe('venue');
    expect(VenueSchema.parse({ name: 'Fest', kind: 'festival' }).kind).toBe('festival');
    expect(VenueSchema.safeParse({ name: 'X', kind: 'bar' }).success).toBe(false);
  });

  it('requires a whole-number capacity', () => {
    expect(VenueSchema.safeParse({ name: 'Hall', capacity: '250.5' }).success).toBe(false);
    expect(VenueSchema.parse({ name: 'Hall', capacity: '250' }).capacity).toBe(250);
  });
});

describe('ContactSchema', () => {
  it('requires a venue: contacts live on the venue profile', () => {
    expect(ContactSchema.safeParse({ name: 'Pat', venue_id: '' }).success).toBe(false);
  });

  it('keeps contacts private unless the box is ticked', () => {
    expect(ContactSchema.parse({ name: 'Pat', venue_id: UUID }).share_with_bands).toBe(false);
    expect(ContactSchema.parse({ name: 'Pat', venue_id: UUID, share_with_bands: true }).share_with_bands).toBe(true);
  });
});

describe('ShowSchema', () => {
  const base = { roster_id: UUID, show_date: '2026-10-24' };

  it('needs either a saved venue or a typed venue name', () => {
    const r = ShowSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).venue_name).toMatch(/venue/i);
    expect(ShowSchema.safeParse({ ...base, venue_name: 'Possum Kingdom' }).success).toBe(true);
  });

  it('drops the free-text venue when a saved venue is chosen', () => {
    const r = ShowSchema.parse({ ...base, venue_id: UUID2, venue_name: 'typed', venue_city: 'x' });
    expect(r).toMatchObject({ venue_id: UUID2, venue_name: null, venue_city: null });
  });

  it('parses money with $ and commas, and normalises times', () => {
    const r = ShowSchema.parse({ ...base, venue_name: 'V', fee: '$1,250', set_time: '9:00', door_time: '' });
    expect(r.fee).toBe(1250);
    expect(r.set_time).toBe('09:00');
    expect(r.door_time).toBeNull();
    expect(r.status).toBe('hold');
  });

  it('rejects impossible dates, bad times and unknown statuses', () => {
    expect(ShowSchema.safeParse({ ...base, venue_name: 'V', show_date: '2026-02-30' }).success).toBe(false);
    expect(ShowSchema.safeParse({ ...base, venue_name: 'V', set_time: '25:00' }).success).toBe(false);
    expect(ShowSchema.safeParse({ ...base, venue_name: 'V', status: 'booked' }).success).toBe(false);
  });

  it('rejects a negative fee', () => {
    expect(ShowSchema.safeParse({ ...base, venue_name: 'V', fee: '-5' }).success).toBe(false);
  });
});

describe('PaymentSchema', () => {
  it('requires a positive amount and a known method', () => {
    expect(PaymentSchema.safeParse({ show_id: UUID, amount: '0', method: 'venmo', paid_on: '2026-10-09' }).success).toBe(false);
    expect(PaymentSchema.safeParse({ show_id: UUID, amount: '60', method: 'bitcoin', paid_on: '2026-10-09' }).success).toBe(false);
    expect(PaymentSchema.parse({ show_id: UUID, amount: '$60', method: 'cash_app', paid_on: '2026-10-09' }).amount).toBe(60);
  });
});

describe('BookerSignupSchema', () => {
  it('normalises the email and enforces password length', () => {
    const ok = BookerSignupSchema.parse({ email: ' Agent@Example.COM ', password: 'longenough', displayName: 'Pat', agencyName: 'Lone Star' });
    expect(ok.email).toBe('agent@example.com');
    expect(BookerSignupSchema.safeParse({ email: 'a@b.co', password: 'short', displayName: 'Pat', agencyName: 'X' }).success).toBe(false);
  });
});
