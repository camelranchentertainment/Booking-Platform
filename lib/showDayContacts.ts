// lib/showDayContacts.ts
// The two show-day people a band deals with at a venue: the day-of contact who
// meets them on the night, and the house sound engineer. Stored on the venue
// as defaults (venues.day_of_contact_*, venues.sound_engineer_*) and copied to
// each new show by the bookings_fill_show_contacts trigger, where they can be
// changed for that show (bookings.venue_contact_name, bookings.day_of_contact_phone,
// bookings.sound_engineer_*).

/** Form shape shared by the venue and show forms. Empty string = not set. */
export interface ShowDayContacts {
  dayOfName: string;
  dayOfPhone: string;
  soundName: string;
  soundPhone: string;
}

export const BLANK_SHOW_DAY_CONTACTS: ShowDayContacts = { dayOfName: '', dayOfPhone: '', soundName: '', soundPhone: '' };

/** Same limits as the database CHECK constraints. */
export const SHOW_DAY_NAME_MAX = 120;
export const SHOW_DAY_PHONE_MAX = 40;

type Nullable = string | null | undefined;

const clean = (v: string): string | null => {
  const t = v.trim();
  return t.length ? t : null;
};

/** Reads a venue row's show-day defaults into the form shape. */
export function contactsFromVenue(v: {
  day_of_contact_name?: Nullable; day_of_contact_phone?: Nullable;
  sound_engineer_name?: Nullable; sound_engineer_phone?: Nullable;
} | null | undefined): ShowDayContacts {
  return {
    dayOfName: v?.day_of_contact_name ?? '',
    dayOfPhone: v?.day_of_contact_phone ?? '',
    soundName: v?.sound_engineer_name ?? '',
    soundPhone: v?.sound_engineer_phone ?? '',
  };
}

/** The venue columns to save, blanks as null. */
export function venueColumns(c: ShowDayContacts) {
  return {
    day_of_contact_name: clean(c.dayOfName),
    day_of_contact_phone: clean(c.dayOfPhone),
    sound_engineer_name: clean(c.soundName),
    sound_engineer_phone: clean(c.soundPhone),
  };
}

/** Reads a show (booking) row's show-day contacts into the form shape. */
export function contactsFromBooking(b: {
  venue_contact_name?: Nullable; day_of_contact_phone?: Nullable;
  sound_engineer_name?: Nullable; sound_engineer_phone?: Nullable;
} | null | undefined): ShowDayContacts {
  return {
    dayOfName: b?.venue_contact_name ?? '',
    dayOfPhone: b?.day_of_contact_phone ?? '',
    soundName: b?.sound_engineer_name ?? '',
    soundPhone: b?.sound_engineer_phone ?? '',
  };
}

/** The booking columns to save, blanks as null. The day-of name lives in the older venue_contact_name column. */
export function bookingColumns(c: ShowDayContacts) {
  return {
    venue_contact_name: clean(c.dayOfName),
    day_of_contact_phone: clean(c.dayOfPhone),
    sound_engineer_name: clean(c.soundName),
    sound_engineer_phone: clean(c.soundPhone),
  };
}

/**
 * A tel: link for a phone number as people type it ("(479) 555-0123 ext 4").
 * Keeps digits and a leading +; returns null when there aren't enough digits to dial.
 */
export function telHref(phone: Nullable): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const main = trimmed.split(/\s*(?:ext\.?|x|#)\s*\d*$/i)[0];
  const digits = main.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return `tel:${main.startsWith('+') ? '+' : ''}${digits}`;
}
