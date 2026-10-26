// __tests__/lib/showDayContacts.test.ts
import {
  BLANK_SHOW_DAY_CONTACTS,
  bookingColumns,
  contactsFromBooking,
  contactsFromVenue,
  telHref,
  venueColumns,
} from '../../lib/showDayContacts';

describe('venue round trip', () => {
  it('reads nulls as blanks and saves blanks as null, trimmed', () => {
    const form = contactsFromVenue({ day_of_contact_name: 'Mike', day_of_contact_phone: null, sound_engineer_name: undefined });
    expect(form).toEqual({ dayOfName: 'Mike', dayOfPhone: '', soundName: '', soundPhone: '' });
    expect(venueColumns({ ...form, soundName: '  Dee  ', soundPhone: '   ' })).toEqual({
      day_of_contact_name: 'Mike',
      day_of_contact_phone: null,
      sound_engineer_name: 'Dee',
      sound_engineer_phone: null,
    });
  });

  it('handles a missing venue', () => {
    expect(contactsFromVenue(null)).toEqual(BLANK_SHOW_DAY_CONTACTS);
  });
});

describe('booking round trip', () => {
  it('keeps the day-of name in the older venue_contact_name column', () => {
    const form = contactsFromBooking({ venue_contact_name: 'Mike', day_of_contact_phone: '479-555-0101' });
    expect(form.dayOfName).toBe('Mike');
    expect(bookingColumns(form)).toEqual({
      venue_contact_name: 'Mike',
      day_of_contact_phone: '479-555-0101',
      sound_engineer_name: null,
      sound_engineer_phone: null,
    });
  });
});

describe('telHref', () => {
  it('dials digits from how people type numbers', () => {
    expect(telHref('(479) 555-0123')).toBe('tel:4795550123');
    expect(telHref('479.555.0123')).toBe('tel:4795550123');
    expect(telHref('+1 479 555 0123')).toBe('tel:+14795550123');
  });

  it('drops an extension rather than dialing it as part of the number', () => {
    expect(telHref('479-555-0123 ext 4')).toBe('tel:4795550123');
    expect(telHref('479-555-0123 x12')).toBe('tel:4795550123');
  });

  it('returns null when there is nothing dialable', () => {
    expect(telHref(null)).toBeNull();
    expect(telHref('')).toBeNull();
    expect(telHref('ask at bar')).toBeNull();
    expect(telHref('555')).toBeNull();
  });
});
