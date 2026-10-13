// lib/server/googlePlaces.ts
// Google Places lookups for venue search. Server-only: uses the platform's
// Google Maps server key from platform_settings.
//
// Used by both venue searches — the agent's (/api/booker/venues/search) and
// the band's (/api/venues/prospect) — so they label results the same way.

import { getSetting } from '../platformSettings';
import { AppError } from '../apiError';
import {
  localityFromComponents,
  localityFromFormattedAddress,
  sameLocality,
  streetFromComponents,
  type AddressComponent,
} from '../placeLocality';

export interface PlaceResult {
  place_id: string;
  name: string;
  /** Street line, e.g. "427 S College St". */
  address: string;
  formatted_address: string;
  /**
   * The town the venue is actually in, read from its own address. Null when
   * Google's address has no recognisable town; never the searched city.
   */
  city: string | null;
  state: string | null;
  rating: number | null;
  user_ratings_total: number;
  types: string[];
  google_maps_url: string;
}

/** A search result plus where it sits relative to the town that was searched. */
export interface LabelledPlaceResult extends PlaceResult {
  searched_city: string;
  searched_state: string;
  /**
   * True when the venue's own town is the searched town. False for nearby
   * venues Google included, and when the town could not be read (shown as
   * "nearby" rather than claimed as in-town).
   */
  in_searched_city: boolean;
}

export interface PlaceDetails {
  website: string | null;
  phone: string | null;
  name: string | null;
  /** From Google's structured address; null when Google has none. */
  city: string | null;
  state: string | null;
  postal_code: string | null;
  street: string | null;
}

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';
const EMPTY_DETAILS: PlaceDetails = { website: null, phone: null, name: null, city: null, state: null, postal_code: null, street: null };

/** @throws AppError 501 when no Google Maps key is configured */
async function mapsKey(): Promise<string> {
  const key = (await getSetting('google_maps_server_key')) || (await getSetting('google_maps_api_key'));
  if (!key || key === 'YOUR_GOOGLE_MAPS_API_KEY') {
    throw new AppError(501, 'Venue search is not configured yet. Ask the platform admin to add the Google Maps key.');
  }
  return key;
}

/**
 * Fails fast when Places is not configured. placeDetails() deliberately never
 * throws, so callers that make many lookups check this first; otherwise a
 * missing key would look like "Google had no answer" for every venue.
 *
 * @throws AppError 501 when no Google Maps key is configured
 */
export async function assertPlacesConfigured(): Promise<void> {
  await mapsKey();
}

/** Maps one raw Text Search result; the town comes from the result's own address. */
function toPlaceResult(p: Record<string, unknown>): PlaceResult {
  const formatted = String(p.formatted_address ?? '');
  const placeId = String(p.place_id ?? '');
  const locality = localityFromFormattedAddress(formatted);
  return {
    place_id: placeId,
    name: String(p.name ?? ''),
    address: formatted.split(',')[0]?.trim() ?? '',
    formatted_address: formatted,
    city: locality?.city ?? null,
    state: locality?.state ?? null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    user_ratings_total: typeof p.user_ratings_total === 'number' ? p.user_ratings_total : 0,
    types: Array.isArray(p.types) ? p.types.filter((t): t is string => typeof t === 'string') : [],
    google_maps_url: `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`,
  };
}

/**
 * Marks each result as in or near the searched town and puts in-town venues
 * first, keeping Google's relevance order within each group (stable sort).
 */
export function labelBySearchedCity(results: PlaceResult[], searchedCity: string, searchedState: string): LabelledPlaceResult[] {
  const searched = { city: searchedCity, state: searchedState };
  return results
    .map(r => ({
      ...r,
      searched_city: searchedCity,
      searched_state: searchedState,
      in_searched_city: r.city !== null && r.state !== null && sameLocality({ city: r.city, state: r.state }, searched),
    }))
    .sort((a, b) => Number(b.in_searched_city) - Number(a.in_searched_city));
}

/**
 * Text-searches Google Places for live-music venues in and around a city.
 * Google also returns venues in nearby towns; each result carries its own
 * town and `in_searched_city` says which is which.
 *
 * @param city  required, e.g. "Decherd"
 * @param state required, e.g. "TN" or "Tennessee"
 * @param kind  optional extra words, e.g. "dance hall" or "winery"
 * @throws AppError 501 not configured, 502 when Google returns an error status
 */
export async function searchVenues(city: string, state: string, kind?: string): Promise<LabelledPlaceResult[]> {
  const key = await mapsKey();
  const words = kind?.trim() ? `${kind.trim()} live music` : 'music venues bars nightclubs live music';
  const query = encodeURIComponent(`${words} ${city} ${state}`);
  let data: { status: string; results?: Array<Record<string, unknown>> };
  try {
    const res = await fetch(`${PLACES_BASE}/textsearch/json?query=${query}&key=${key}`);
    data = (await res.json()) as typeof data;
  } catch (err) {
    console.error('[googlePlaces] text search request failed', { err });
    throw new AppError(502, 'Venue search is unavailable right now. Try again in a minute.');
  }
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.error('[googlePlaces] text search failed', { status: data.status });
    throw new AppError(502, 'Venue search is unavailable right now. Try again in a minute.');
  }
  const results = (data.results ?? []).slice(0, 20).map(toPlaceResult);
  return labelBySearchedCity(results, city, state);
}

/**
 * Website, phone, official name and structured address for one place.
 * Returns nulls (never throws) when Google has no details, so adding a venue
 * never fails on this step.
 */
export async function placeDetails(placeId: string): Promise<PlaceDetails> {
  try {
    const key = await mapsKey();
    const fields = 'website,formatted_phone_number,name,address_components';
    const res = await fetch(`${PLACES_BASE}/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${key}`);
    const data = (await res.json()) as { status: string; result?: Record<string, unknown> };
    if (data.status !== 'OK' || !data.result) return EMPTY_DETAILS;
    const r = data.result;
    const components = Array.isArray(r.address_components) ? (r.address_components as AddressComponent[]) : null;
    const locality = localityFromComponents(components);
    return {
      website: typeof r.website === 'string' ? r.website : null,
      phone: typeof r.formatted_phone_number === 'string' ? r.formatted_phone_number : null,
      name: typeof r.name === 'string' ? r.name : null,
      city: locality?.city ?? null,
      state: locality?.state ?? null,
      postal_code: locality?.postalCode ?? null,
      street: streetFromComponents(components),
    };
  } catch (err) {
    console.error('[googlePlaces] details failed', { placeId, err });
    return EMPTY_DETAILS;
  }
}
