// lib/placeLocality.ts
// Works out which town a Google Places result is actually in.
//
// Why this exists: Google's text search for "music venues Decherd TN" returns
// venues *near* Decherd as well as in it (Winchester, Manchester, Lebanon…).
// The venue searches used to stamp every result with the city that was typed,
// so a bar in Lebanon was saved as "Decherd" and stayed wrong in the venue book,
// the tour pool and any city filter. Every result now carries its own city.
//
// Pure functions only (no fetch, no React), shared by the server routes and
// safe to import in the browser.

/** One entry of Google's `address_components` (Places / Geocoding APIs). */
export interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface Locality {
  /** Town name as Google spells it, e.g. "Lebanon". */
  city: string;
  /** Two-letter code for US states ("TN"); otherwise as Google gives it. */
  state: string;
  postalCode: string | null;
}

const US_STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'puerto rico': 'PR',
};
const US_CODES = new Set(Object.values(US_STATES));

/**
 * Two-letter code for a US state: "Tennessee", "tn" and " TN " all give "TN".
 * Unknown values (non-US regions) are returned trimmed and upper-cased so two
 * spellings of the same code still match.
 */
export function normalizeState(state: string): string {
  const s = state.trim().replace(/\.$/, '');
  const code = s.toUpperCase();
  if (US_CODES.has(code)) return code;
  return US_STATES[s.toLowerCase()] ?? code;
}

/**
 * Comparable form of a town name: case, punctuation, a leading "City of" and
 * "St."/"Saint" differences ignored. "St. Louis" and "saint louis" match.
 */
export function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^city of\s+/, '')
    .replace(/\bst\.?\s/g, 'saint ')
    .replace(/\bft\.?\s/g, 'fort ')
    .replace(/\bmt\.?\s/g, 'mount ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when both refer to the same town and state. */
export function sameLocality(a: { city: string; state: string }, b: { city: string; state: string }): boolean {
  return normalizeCity(a.city) === normalizeCity(b.city) && normalizeState(a.state) === normalizeState(b.state);
}

/**
 * Locality from Google's structured address components — the authoritative
 * source. Falls back through the component types Google uses for unincorporated
 * places (postal_town, sublocality, county subdivision).
 *
 * @returns null when no town or no state is present
 */
export function localityFromComponents(components: readonly AddressComponent[] | undefined | null): Locality | null {
  if (!components?.length) return null;
  const find = (type: string) => components.find(c => c.types.includes(type));
  const town =
    find('locality') ?? find('postal_town') ?? find('sublocality') ?? find('sublocality_level_1') ?? find('administrative_area_level_3') ?? find('neighborhood');
  const region = find('administrative_area_level_1');
  if (!town?.long_name || !region) return null;
  return {
    city: town.long_name,
    state: normalizeState(region.short_name || region.long_name),
    postalCode: find('postal_code')?.long_name ?? null,
  };
}

/**
 * Street line ("427 S College St") from address components, or null.
 */
export function streetFromComponents(components: readonly AddressComponent[] | undefined | null): string | null {
  if (!components?.length) return null;
  const number = components.find(c => c.types.includes('street_number'))?.long_name;
  const route = components.find(c => c.types.includes('route'))?.short_name;
  if (!route) return null;
  return number ? `${number} ${route}` : route;
}

// "Lebanon, TN 37087, USA" → ["Lebanon", "TN 37087", "USA"]; the state part is
// a code or full name, optionally followed by a ZIP or ZIP+4.
const STATE_ZIP = /^([A-Za-z][A-Za-z .]*?)(?:\s+(\d{5}(?:-\d{4})?))?$/;

/**
 * Best-effort locality from a US `formatted_address`, for search results
 * (Text Search does not return address components). Reads from the end:
 * "…, City, ST 12345, USA". Saving a venue does not rely on this; it uses
 * {@link localityFromComponents} from Place Details.
 *
 * @returns null when the address does not look like a US address with a town
 */
export function localityFromFormattedAddress(formatted: string | null | undefined): Locality | null {
  if (!formatted) return null;
  const parts = formatted
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length && /^(usa|united states)$/i.test(parts[parts.length - 1])) parts.pop();
  if (parts.length < 2) return null;

  const m = STATE_ZIP.exec(parts[parts.length - 1]);
  if (!m) return null;
  const state = normalizeState(m[1]);
  if (!US_CODES.has(state)) return null;

  const city = parts[parts.length - 2];
  // A bare street line ("123 Main St") where the town should be means Google
  // left the town out; better to say "unknown" than to store a street as a city.
  if (!city || /^\d/.test(city)) return null;
  return { city, state, postalCode: m[2] ?? null };
}

/** "Lebanon, TN", "Lebanon", or "" when the town is unknown. */
export function formatLocality(city: string | null | undefined, state: string | null | undefined): string {
  return [city?.trim(), state?.trim()].filter(Boolean).join(', ');
}

/**
 * One-line summary for a result list, e.g. "6 in Decherd · 14 nearby".
 * Nearby includes results whose town Google did not give.
 */
export function searchSummary(results: ReadonlyArray<{ in_searched_city: boolean }>, searchedCity: string): string {
  const inTown = results.filter(r => r.in_searched_city).length;
  const nearby = results.length - inTown;
  const parts = [`${inTown} in ${searchedCity}`];
  if (nearby > 0) parts.push(`${nearby} nearby`);
  return parts.join(' · ');
}

/**
 * Short tag for a result outside the searched town: "Nearby · Lebanon, TN",
 * or "Nearby · town not listed" when Google gave no town. Null for in-town results.
 */
export function nearbyTag(r: { in_searched_city: boolean; city: string | null; state: string | null }): string | null {
  if (r.in_searched_city) return null;
  const where = formatLocality(r.city, r.state);
  return `Nearby · ${where || 'town not listed'}`;
}
