// lib/server/googlePlaces.ts
// Google Places lookups for venue search. Server-only: uses the platform's
// Google Maps server key from platform_settings.

import { getSetting } from '../platformSettings';
import { AppError } from '../apiError';

export interface PlaceResult {
  place_id: string;
  name: string;
  address: string;
  formatted_address: string;
  rating: number | null;
  user_ratings_total: number;
  google_maps_url: string;
}

export interface PlaceDetails {
  website: string | null;
  phone: string | null;
  name: string | null;
}

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

/** @throws AppError 501 when no Google Maps key is configured */
async function mapsKey(): Promise<string> {
  const key = (await getSetting('google_maps_server_key')) || (await getSetting('google_maps_api_key'));
  if (!key || key === 'YOUR_GOOGLE_MAPS_API_KEY') {
    throw new AppError(501, 'Venue search is not configured yet. Ask the platform admin to add the Google Maps key.');
  }
  return key;
}

/**
 * Text-searches Google Places for live-music venues in a city.
 *
 * @param city  required, e.g. "Austin"
 * @param state required, e.g. "TX"
 * @param kind  optional extra words, e.g. "dance hall" or "winery"
 * @throws AppError 502 when Google returns an error status
 */
export async function searchVenues(city: string, state: string, kind?: string): Promise<PlaceResult[]> {
  const key = await mapsKey();
  const words = kind?.trim() ? `${kind.trim()} live music` : 'music venues bars nightclubs live music';
  const query = encodeURIComponent(`${words} ${city} ${state}`);
  const res = await fetch(`${PLACES_BASE}/textsearch/json?query=${query}&key=${key}`);
  const data = (await res.json()) as { status: string; results?: Array<Record<string, unknown>> };
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.error('[googlePlaces] text search failed', { status: data.status });
    throw new AppError(502, 'Venue search is unavailable right now. Try again in a minute.');
  }
  return (data.results ?? []).slice(0, 20).map(p => {
    const formatted = String(p.formatted_address ?? '');
    const placeId = String(p.place_id ?? '');
    return {
      place_id: placeId,
      name: String(p.name ?? ''),
      address: formatted.split(',')[0]?.trim() ?? '',
      formatted_address: formatted,
      rating: typeof p.rating === 'number' ? p.rating : null,
      user_ratings_total: typeof p.user_ratings_total === 'number' ? p.user_ratings_total : 0,
      google_maps_url: `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`,
    };
  });
}

/**
 * Website, phone and official name for one place. Returns nulls (never throws)
 * when Google has no details, so adding a venue never fails on this step.
 */
export async function placeDetails(placeId: string): Promise<PlaceDetails> {
  try {
    const key = await mapsKey();
    const fields = 'website,formatted_phone_number,name';
    const res = await fetch(`${PLACES_BASE}/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${key}`);
    const data = (await res.json()) as { status: string; result?: Record<string, unknown> };
    if (data.status !== 'OK') return { website: null, phone: null, name: null };
    return {
      website: typeof data.result?.website === 'string' ? data.result.website : null,
      phone: typeof data.result?.formatted_phone_number === 'string' ? data.result.formatted_phone_number : null,
      name: typeof data.result?.name === 'string' ? data.result.name : null,
    };
  } catch (err) {
    console.error('[googlePlaces] details failed', { placeId, err });
    return { website: null, phone: null, name: null };
  }
}
