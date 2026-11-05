// lib/server/agentTourTargets.ts
//
// Lets the Booking Agent put venues on a tour's outreach list (tour_venues),
// including a venue that isn't saved yet: one Confirm saves it and adds it.
// Staged for approval like every agent write; executed by
// /api/help/actions/execute ('tour_target_add').
//
// Service-role code bypasses RLS, so the tour and the venue are both checked
// against the caller's band when staging and again when executing.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { matchTour } from '../domain/tourOutreach';
import { syncBooking } from '../statusSync';
import { ownedVenueId } from './actOwnership';
import { buildVenueUpsertPayload, executeVenueUpsert, venueUpsertSchema } from './agentVenueActions';

/** Tours in these states are finished: nothing new gets pitched for them. */
const CLOSED_TOUR_STATUSES = ['cancelled', 'completed'];

/** Postgres unique_violation: tour_venues allows one row per tour and venue. */
const UNIQUE_VIOLATION = '23505';

export interface TourTarget {
  id: string;
  name: string;
  /** Venue ids already on this tour's outreach list. */
  venueIds: Set<string>;
}

export interface TourTargetAddPayload {
  tour_id: string;
  tour_name: string;
  mode: 'existing' | 'create';
  venue_id?: string;
  venue_name: string;
  city: string | null;
  state: string | null;
  email: string | null;
  /** New venues only: the validated details to save on Confirm. */
  changes?: Record<string, unknown>;
}

const storedPayloadSchema = z.object({
  tour_id: z.string().uuid(),
  mode: z.enum(['existing', 'create']),
  venue_id: z.string().uuid().optional(),
  venue_name: z.string().min(1),
  changes: z.record(z.string(), z.unknown()).optional(),
});

interface SavedVenue {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  email: string | null;
}

const escapeLike = (value: string) => value.replace(/[%_\\]/g, m => `\\${m}`);

/**
 * Finds a saved venue by exact name and city (ignoring case) in the band.
 *
 * @throws Error when the lookup fails
 */
async function findSavedVenue(service: SupabaseClient, actId: string, name: string, city: string) {
  const { data, error } = await service
    .from('venues')
    .select('id, name, city, state, email')
    .eq('act_id', actId)
    .ilike('name', escapeLike(name))
    .ilike('city', escapeLike(city))
    .limit(1);
  if (error) throw new Error(`Venue lookup failed: ${error.message}`);
  return (data?.[0] ?? null) as SavedVenue | null;
}

/**
 * Finds the open tour the user named and which venues are already on it.
 * Never falls back to "some tour": pitching the wrong run is worse than asking.
 *
 * @param service  service-role client
 * @param actId    caller's band (from their profile)
 * @param tourName the tour name as the user said it
 * @throws Error with a user-facing message when no single open tour matches
 */
export async function loadTourTarget(service: SupabaseClient, actId: string, tourName: string): Promise<TourTarget> {
  const { data: tours, error } = await service
    .from('tours')
    .select('id, name, status')
    .eq('act_id', actId);
  if (error) throw new Error(`Tour lookup failed: ${error.message}`);
  const open = ((tours ?? []) as Array<{ id: string; name: string; status: string | null }>)
    .filter(t => !CLOSED_TOUR_STATUSES.includes(t.status ?? ''));
  const tour = matchTour(open, tourName);
  if (!tour) {
    throw new Error(`I couldn't tell which tour you mean by "${tourName}". Your open tours: ${open.map(t => t.name).join(', ') || 'none'}.`);
  }
  const { data: rows, error: rowsErr } = await service.from('tour_venues').select('venue_id').eq('tour_id', tour.id);
  if (rowsErr) throw new Error(`Could not read ${tour.name}'s outreach list: ${rowsErr.message}`);
  return { id: tour.id, name: tour.name, venueIds: new Set((rows ?? []).map((r: { venue_id: string }) => r.venue_id)) };
}

/**
 * Validates one venue for a tour's outreach list and builds the staged payload.
 * A venue_id must belong to the band. Without one, a saved venue with the same
 * name and city is used; otherwise it's a new venue (name, city, state needed).
 *
 * @throws Error with a user-facing message, including when it's already on the tour
 */
export async function buildTourTargetPayload(service: SupabaseClient, actId: string, tour: TourTarget, raw: unknown): Promise<TourTargetAddPayload> {
  const parsed = venueUpsertSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'That venue is not valid.');
  const args = parsed.data;
  const base = { tour_id: tour.id, tour_name: tour.name };

  let saved: SavedVenue | null = null;
  if (args.venue_id) {
    const { data, error } = await service
      .from('venues').select('id, name, city, state, email').eq('id', args.venue_id).eq('act_id', actId).maybeSingle();
    if (error) throw new Error(`Venue lookup failed: ${error.message}`);
    if (!data) throw new Error("That venue wasn't found for this band.");
    saved = data as SavedVenue;
  } else if (args.name && args.city) {
    saved = await findSavedVenue(service, actId, args.name, args.city);
  }

  if (saved) {
    if (tour.venueIds.has(saved.id)) throw new Error(`${saved.name} is already on ${tour.name}'s outreach list.`);
    return { ...base, mode: 'existing', venue_id: saved.id, venue_name: saved.name, city: saved.city, state: saved.state, email: saved.email };
  }

  const venue = await buildVenueUpsertPayload(service, actId, { ...args, venue_id: undefined });
  return {
    ...base,
    mode: 'create',
    venue_name: venue.venue_name,
    city: (venue.changes.city as string | undefined) ?? null,
    state: (venue.changes.state as string | undefined) ?? null,
    email: (venue.changes.email as string | null | undefined) ?? null,
    changes: venue.changes,
  };
}

/**
 * Applies an approved card line: saves the venue when it's new, then adds it to
 * the tour as a Target. Re-checks the tour and venue against the band. Being on
 * the tour already counts as success, since that's the state the user asked for.
 *
 * @param service service-role client
 * @param actId   caller's band (from their profile)
 * @param userId  caller
 * @param payload the staged payload
 * @returns the tour_venues id, venue id, and whether it was already on the tour
 * @throws Error with a user-facing message when invalid or the write fails
 */
export async function executeTourTargetAdd(service: SupabaseClient, actId: string, userId: string, payload: unknown) {
  const checked = storedPayloadSchema.safeParse(payload);
  if (!checked.success) throw new Error('This tour change is no longer valid. Ask the assistant again.');
  const p = checked.data;

  const { data: tour, error: tourErr } = await service
    .from('tours').select('id, name, status').eq('id', p.tour_id).eq('act_id', actId).maybeSingle();
  if (tourErr) throw new Error(`Tour lookup failed: ${tourErr.message}`);
  if (!tour) throw new Error("That tour wasn't found for this band.");
  const { name: tourName, status } = tour as { name: string; status: string | null };
  if (CLOSED_TOUR_STATUSES.includes(status ?? '')) throw new Error(`${tourName} is ${status}, so venues can't be added to it.`);

  let venueId: string | null;
  if (p.mode === 'existing') {
    venueId = await ownedVenueId(service, actId, p.venue_id);
    if (!venueId) throw new Error("That venue wasn't found for this band.");
  } else {
    // Another line on the same card may have just saved this venue.
    const city = typeof p.changes?.city === 'string' ? p.changes.city : '';
    const existing = city ? await findSavedVenue(service, actId, p.venue_name, city) : null;
    venueId = existing?.id
      ?? (await executeVenueUpsert(service, actId, userId, { mode: 'create', changes: p.changes }) as { id: string }).id;
  }

  const { data: row, error } = await service
    .from('tour_venues')
    .insert({ tour_id: p.tour_id, venue_id: venueId, status: 'target', added_by: userId })
    .select('id')
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { tour_id: p.tour_id, venue_id: venueId, already_on_tour: true };
    throw new Error(`${p.venue_name} is saved, but it couldn't be added to ${tourName}: ${error.message}`);
  }
  const tourVenueId = (row as { id: string }).id;

  // Same mirror the Tours page runs. The venue is on the tour either way, so a failure is only logged.
  try {
    await syncBooking(service, tourVenueId, userId);
  } catch (e: unknown) {
    console.error('[agent] tour target: syncBooking failed', { tourVenueId, error: e instanceof Error ? e.message : String(e) });
  }
  return { id: tourVenueId, tour_id: p.tour_id, venue_id: venueId, already_on_tour: false };
}
