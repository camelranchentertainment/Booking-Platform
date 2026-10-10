// __tests__/lib/booker/scanMerge.test.ts
import { contactFromScan, venuePatchFromScan, type ScanFindings } from '../../../lib/booker/scanMerge';

const found = (over: Partial<ScanFindings> = {}): ScanFindings => ({
  booking_email: 'book@hall.com',
  general_email: null,
  booking_phone: '555-0100',
  booking_contact_name: 'Sarah Lee',
  booking_contact_title: 'Talent buyer',
  capacity: 400,
  notes: 'Originals only',
  ...over,
});

describe('venuePatchFromScan', () => {
  it('fills only the blanks', () => {
    expect(venuePatchFromScan({ email: null, phone: null, capacity: null, notes: null }, found())).toEqual({
      email: 'book@hall.com',
      phone: '555-0100',
      capacity: 400,
      notes: 'Originals only',
    });
  });

  it('never overwrites what the agent entered', () => {
    expect(venuePatchFromScan({ email: 'mine@x.com', phone: '1', capacity: 50, notes: 'my note' }, found())).toEqual({});
  });

  it('falls back to the general email', () => {
    expect(venuePatchFromScan({ email: null, phone: 'x', capacity: 1, notes: 'n' }, found({ booking_email: null, general_email: 'info@hall.com' }))).toEqual({ email: 'info@hall.com' });
  });
});

describe('contactFromScan', () => {
  it('adds the named booker', () => {
    expect(contactFromScan(found(), [])).toEqual({ name: 'Sarah Lee', title: 'Talent buyer', email: 'book@hall.com', phone: '555-0100' });
  });

  it('skips when nobody is named', () => {
    expect(contactFromScan(found({ booking_contact_name: null }), [])).toBeNull();
  });

  it('does not duplicate a contact by name or by email', () => {
    expect(contactFromScan(found(), [{ name: 'sarah lee', email: null }])).toBeNull();
    expect(contactFromScan(found(), [{ name: 'Someone Else', email: 'BOOK@hall.com' }])).toBeNull();
  });
});
