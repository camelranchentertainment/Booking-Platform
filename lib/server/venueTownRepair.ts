// lib/server/venueTownRepair.ts
// Finds and fixes venues saved under the wrong town.
//
// Before #108, venues added from a Google search were saved under the town
// that was *searched*, not the town they are in (Cahoots, Lebanon TN, saved as
// "Decherd"). For every saved venue that has a Google place_id, this asks
// Google for its real town and proposes a correction where they differ. The
// user reviews the list and applies the ones they want.
//
// Shared by the band (venues, scoped by act_id) and the Booking Agent
// (booker_venues, scoped by booker_id). The owner id always comes from the
// caller's profile, resolved by the route.

import type { SupabaseClient } from '@supabase/supabase-js';
import { placeDetails, type PlaceDetails } from './googlePlaces';
import { formatLocality, sameLocality } from '../placeLocality';

/** Most venues one check looks at; keeps a request well inside the function time limit. */
export const MAX_VENUES_PER_CHECK = 400;
/** Google Place Details calls in flight at once. */
const CONCURRENCY = 8;

export type TownScope =
  | { kind: 'band'; actId: string }
  | { kind: 'booker'; bookerId: string };

interface ScopeConfig {
  table: 'venues' | 'booker_venues';
  ownerColumn: 'act_id' | 'booker_id';
  ownerId: string;
  zipColumn: 'zip' | 'postal_code';
  softDelete: boolean;
}

function config(scope: TownScope): ScopeConfig {
  return scope.kind === 'band'
    ? { table: 'venues', ownerColumn: 'act_id', ownerId: scope.actId, zipColumn: 'zip', softDelete: false }
    : { table: 'booker_venues', ownerColumn: 'booker_id', ownerId: scope.bookerId, zipColumn: 'postal_code', softDelete: true };
}

export interface TownRow {
  id: string;
  name: string;
  place_id: string;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface TownFix {
  id: string;
  name: string;
  /** "Decherd, TN" — what the venue is saved under now. */
  from: string;
  /** "Lebanon, TN" — where Google says it is. */
  to: string;
  city: string;
  state: string;
  /** Filled only when the venue has no ZIP yet; an existing ZIP is never overwritten. */
  zip: string | null;
}

export interface TownCheck {
  fixes: TownFix[];
  /** Venues compared with Google. */
  checked: number;
  /** Venues without a Google place_id (typed in by hand), so they cannot be checked. */
  noPlaceId: number;
  /** Venues Google returned no town for; left alone. */
  unknown: number;
  /** True when the book has more venues than one check covers. */
  truncated: boolean;
}

type DetailsLookup = (placeId: string) => Promise<PlaceDetails>;

/** Runs fn over items with at most `limit` in flight, keeping input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Compares each venue's saved town with Google's. Pure apart from `lookup`,
 * so it is unit-tested with a fake.
 */
export async function compareTowns(rows: TownRow[], lookup: DetailsLookup = placeDetails): Promise<Omit<TownCheck, 'noPlaceId' | 'truncated'>> {
  const details = await mapLimit(rows, CONCURRENCY, r => lookup(r.place_id));
  const fixes: TownFix[] = [];
  let unknown = 0;
  rows.forEach((r, i) => {
    const d = details[i];
    if (!d.city || !d.state) {
      unknown++;
      return;
    }
    const saved = { city: r.city ?? '', state: r.state ?? '' };
    if (r.city && r.state && sameLocality(saved, { city: d.city, state: d.state })) return;
    fixes.push({
      id: r.id,
      name: r.name,
      from: formatLocality(r.city, r.state) || '(no town)',
      to: formatLocality(d.city, d.state),
      city: d.city,
      state: d.state,
      zip: r.zip ? null : d.postal_code,
    });
  });
  return { fixes, checked: rows.length, unknown };
}

/**
 * Loads the caller's venues (optionally only `ids`) for checking.
 *
 * @throws Error when the query fails
 */
async function loadRows(service: SupabaseClient, scope: TownScope, ids?: string[]): Promise<{ rows: TownRow[]; noPlaceId: number; truncated: boolean }> {
  const c = config(scope);
  let q = service.from(c.table).select(`id, name, place_id, city, state, ${c.zipColumn}`).eq(c.ownerColumn, c.ownerId);
  if (c.softDelete) q = q.is('deleted_at', null);
  if (ids) q = q.in('id', ids);
  const { data, error } = await q.order('name').limit(MAX_VENUES_PER_CHECK + 1);
  if (error) throw new Error(`Could not load venues: ${error.message}`);

  const all = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const truncated = all.length > MAX_VENUES_PER_CHECK;
  const rows: TownRow[] = [];
  let noPlaceId = 0;
  for (const v of all.slice(0, MAX_VENUES_PER_CHECK)) {
    if (!v.place_id) {
      noPlaceId++;
      continue;
    }
    rows.push({
      id: String(v.id),
      name: String(v.name ?? ''),
      place_id: String(v.place_id),
      city: v.city ? String(v.city) : null,
      state: v.state ? String(v.state) : null,
      zip: v[c.zipColumn] ? String(v[c.zipColumn]) : null,
    });
  }
  return { rows, noPlaceId, truncated };
}

/** Preview: every venue in the caller's book whose saved town differs from Google's. */
export async function checkVenueTowns(service: SupabaseClient, scope: TownScope, lookup?: DetailsLookup): Promise<TownCheck> {
  const { rows, noPlaceId, truncated } = await loadRows(service, scope);
  const result = await compareTowns(rows, lookup);
  return { ...result, noPlaceId, truncated };
}

/**
 * Applies corrections to the venues the user ticked. The new towns are
 * re-derived from Google here, never taken from the request, and only
 * venues in the caller's own book are touched.
 *
 * @returns the corrections actually written
 * @throws Error when loading fails; per-row write failures are counted in `failed`
 */
export async function applyVenueTowns(
  service: SupabaseClient,
  scope: TownScope,
  ids: string[],
  lookup?: DetailsLookup,
): Promise<{ applied: TownFix[]; failed: number }> {
  const c = config(scope);
  const { rows } = await loadRows(service, scope, ids);
  const { fixes } = await compareTowns(rows, lookup);

  const results = await mapLimit(fixes, CONCURRENCY, async f => {
    const update: Record<string, string> = { city: f.city, state: f.state, updated_at: new Date().toISOString() };
    if (f.zip) update[c.zipColumn] = f.zip;
    let q = service.from(c.table).update(update).eq('id', f.id).eq(c.ownerColumn, c.ownerId);
    if (c.softDelete) q = q.is('deleted_at', null);
    const { error } = await q;
    if (error) console.error('[venueTownRepair] update failed', { table: c.table, venueId: f.id, code: error.code });
    return error ? null : f;
  });

  const applied = results.filter((f): f is TownFix => f !== null);
  return { applied, failed: results.length - applied.length };
}
