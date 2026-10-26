// lib/domain/venueImport.ts
//
// Turns a venue list (pasted into the Venues page's "Bulk import" box, or read
// from an uploaded CSV/Excel file) into import rows by matching its column
// headers. No AI is involved, so nothing is guessed: a value lands in a field
// only when its column says what it is.
//
// Pure and unit-tested (__tests__/lib/domain/venueImport.test.ts).

import { parseTable } from './tabularText';

export interface ImportRow {
  name: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  website: string;
  venue_type: string;
  capacity: string;
  contact_first: string;
  contact_last: string;
  contact_title: string;
  contact_email: string;
  notes: string;
  /** Ticked for import in the review list. */
  selected: boolean;
}

export type ParseResult =
  | { ok: true; rows: ImportRow[]; /** Rows dropped for lacking a venue name (or city, when required). */ skipped: number }
  | { ok: false; error: string };

/** Header CSV the page offers as a download. */
export const IMPORT_TEMPLATE_CSV =
  'Venue Name,City,State,Address,Phone,Booking Email,Website,Venue Type,Capacity,Contact Name,Contact Title,Notes\n';

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Booking E-mail:" → "booking e mail" */
const normaliseHeader = (h: string): string =>
  h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

type Field =
  | 'name' | 'city' | 'state' | 'location' | 'address' | 'phone' | 'email' | 'booking_email'
  | 'website' | 'venue_type' | 'capacity' | 'contact_name' | 'contact_first' | 'contact_last'
  | 'contact_title' | 'contact_email' | 'notes' | 'facebook' | 'instagram';

/** Header names people use for each field, already normalised. */
const HEADER_SYNONYMS: Record<Field, readonly string[]> = {
  name: ['venue', 'venue name', 'name', 'venue title', 'club', 'club name', 'bar name', 'business', 'business name', 'establishment', 'place'],
  city: ['city', 'town', 'city town'],
  state: ['state', 'st', 'state province', 'province', 'state abbr', 'state code'],
  location: ['location', 'city state', 'city st', 'city and state', 'market'],
  address: ['address', 'street', 'street address', 'address 1', 'address line 1', 'venue address'],
  phone: ['phone', 'phone number', 'telephone', 'tel', 'venue phone', 'phone no'],
  email: ['email', 'e mail', 'email address', 'venue email', 'general email', 'general info email', 'info email'],
  booking_email: ['booking email', 'booking e mail', 'booker email', 'talent buyer email', 'booking contact email'],
  website: ['website', 'web site', 'web', 'url', 'site', 'website url', 'link', 'homepage'],
  venue_type: ['type', 'venue type', 'category'],
  capacity: ['capacity', 'cap', 'max capacity', 'room capacity', 'size'],
  contact_name: ['contact', 'contact name', 'booking contact', 'booking contact name', 'booker', 'booker name', 'talent buyer', 'buyer', 'contact person', 'booking agent', 'promoter'],
  contact_first: ['first name', 'contact first name', 'first'],
  contact_last: ['last name', 'contact last name', 'last', 'surname'],
  contact_title: ['contact title', 'title', 'booking contact title', 'role', 'position'],
  contact_email: ['contact email', 'contact e mail'],
  notes: ['notes', 'note', 'comments', 'comment', 'details', 'description'],
  facebook: ['facebook', 'fb', 'facebook page', 'facebook url'],
  instagram: ['instagram', 'ig', 'insta', 'instagram handle', 'instagram url'],
};

const SYNONYM_LOOKUP = new Map<string, Field>(
  (Object.entries(HEADER_SYNONYMS) as [Field, readonly string[]][])
    .flatMap(([field, names]) => names.map(n => [n, field] as const)),
);

const US_STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY',
  louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};
const STATE_CODES = new Set(Object.values(US_STATES));

/** "Texas" / "tx" / "TX" → "TX"; anything else is returned trimmed, unchanged. */
export function normaliseState(raw: string): string {
  const v = raw.trim().replace(/\.$/, '');
  if (/^[a-z]{2}$/i.test(v) && STATE_CODES.has(v.toUpperCase())) return v.toUpperCase();
  return US_STATES[v.toLowerCase()] ?? v;
}

/** "Austin, TX" / "Austin TX" / "Austin, Texas" → { city: "Austin", state: "TX" }. */
export function splitLocation(raw: string): { city: string; state: string } {
  const v = raw.trim();
  const comma = v.match(/^(.+?),\s*([^,]+?)(?:\s+\d{5}(?:-\d{4})?)?$/);
  if (comma) return { city: comma[1].trim(), state: normaliseState(comma[2]) };
  const tail = v.match(/^(.+?)\s+([A-Za-z]{2})$/);
  if (tail && STATE_CODES.has(tail[2].toUpperCase())) return { city: tail[1].trim(), state: tail[2].toUpperCase() };
  return { city: v, state: '' };
}

/**
 * Maps each header cell to a field, or null when the column isn't recognised.
 * The first column that claims a field wins, so a later duplicate is ignored.
 */
function mapHeaders(header: string[]): (Field | null)[] {
  const taken = new Set<Field>();
  return header.map(h => {
    const field = SYNONYM_LOOKUP.get(normaliseHeader(h)) ?? null;
    if (!field || taken.has(field)) return null;
    taken.add(field);
    return field;
  });
}

function toRow(cells: string[], fields: (Field | null)[]): ImportRow {
  const get = (f: Field): string => {
    const i = fields.indexOf(f);
    return i >= 0 ? (cells[i] ?? '').trim() : '';
  };

  let city = get('city');
  let state = get('state');
  const location = get('location');
  if (location && (!city || !state)) {
    const split = splitLocation(location);
    city ||= split.city;
    state ||= split.state;
  }

  let first = get('contact_first');
  let last = get('contact_last');
  const contact = get('contact_name');
  if (contact && !first && !last) {
    const [head = '', ...rest] = contact.split(/\s+/);
    first = head;
    last = rest.join(' ');
  }

  const bookingEmail = get('booking_email');
  const notes = [
    get('notes'),
    get('facebook') && `Facebook: ${get('facebook')}`,
    get('instagram') && `Instagram: ${get('instagram')}`,
  ].filter(Boolean).join(' · ');

  return {
    name: get('name'),
    address: get('address'),
    city,
    state: normaliseState(state),
    phone: get('phone'),
    email: bookingEmail || get('email'),
    website: get('website'),
    venue_type: get('venue_type').toLowerCase(),
    capacity: get('capacity'),
    contact_first: first,
    contact_last: last,
    contact_title: get('contact_title'),
    contact_email: get('contact_email') || bookingEmail,
    notes,
    selected: true,
  };
}

export type TableMapResult =
  | { ok: true; rows: ImportRow[]; skipped: number }
  | { ok: false; reason: 'empty' | 'no_name_column' | 'no_rows'; skipped: number };

/**
 * Maps parsed table rows (header first) to import rows.
 *
 * @param requireCity drop rows with no city (the paste box dedupes on name +
 *   city, so it needs one); file import keeps them and saves a blank city.
 */
export function mapVenueTable(table: string[][], { requireCity }: { requireCity: boolean }): TableMapResult {
  if (table.length === 0) return { ok: false, reason: 'empty', skipped: 0 };
  const fields = mapHeaders(table[0]);
  if (!fields.includes('name')) return { ok: false, reason: 'no_name_column', skipped: 0 };

  const all = table.slice(1).map(cells => toRow(cells, fields));
  const rows = all.filter(r => r.name && (!requireCity || r.city));
  const skipped = all.length - rows.length;
  if (!rows.length) return { ok: false, reason: 'no_rows', skipped };
  return { ok: true, rows, skipped };
}

/** Parses pasted text into import rows. Every row needs a venue name and a city. */
export function parseVenueImport(text: string): ParseResult {
  if (!text.trim()) return { ok: false, error: 'Paste your venue list first.' };
  const result = mapVenueTable(parseTable(text), { requireCity: true });
  if (result.ok) return result;
  if (result.reason === 'no_rows') {
    return {
      ok: false,
      error: result.skipped
        ? `Rows found, but none had a Venue Name and City — ${plural(result.skipped, 'row')} skipped. Check your column headers.`
        : 'Found a header row but no venues under it.',
    };
  }
  return {
    ok: false,
    error: 'Could not find a venue name column. Make sure the first line is a header row with a column called Venue or Venue Name (and City).',
  };
}

/** Capacity text → positive whole number, or null ("1,200" → 1200, "TBD" → null, "250-300" → 250). */
export function parseCapacity(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
  const text = String(raw ?? '').replace(/[,\s]/g, '');
  const n = Number(text.match(/^\d+(\.\d+)?/)?.[0] ?? NaN);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Name + city key used to spot a venue the band already has ("The Blue Door", "OKC " → "the blue door|okc"). */
export function venueMatchKey(name: string | null | undefined, city: string | null | undefined): string {
  const n = (v: string | null | undefined) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${n(name)}|${n(city)}`;
}

/**
 * True when an imported venue matches one the band already has: same name and
 * city, or same name when either side has no city recorded.
 */
export function isExistingVenue(
  existing: { byKey: Set<string>; byName: Map<string, number> },
  name: string,
  city: string,
): boolean {
  const key = venueMatchKey(name, city);
  if (existing.byKey.has(key)) return true;
  const nameOnly = venueMatchKey(name, '');
  if (!city.trim() && (existing.byName.get(nameOnly) ?? 0) > 0) return true;
  return existing.byKey.has(nameOnly);
}

/** Builds the lookup isExistingVenue reads from the band's saved venues. */
export function indexExistingVenues(rows: ReadonlyArray<{ name: string | null; city: string | null }>): { byKey: Set<string>; byName: Map<string, number> } {
  const byKey = new Set<string>();
  const byName = new Map<string, number>();
  for (const r of rows) {
    byKey.add(venueMatchKey(r.name, r.city));
    const nameOnly = venueMatchKey(r.name, '');
    byName.set(nameOnly, (byName.get(nameOnly) ?? 0) + 1);
  }
  return { byKey, byName };
}
