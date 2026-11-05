// lib/server/agentTourStages.ts
//
// Lets the Booking Agent move a venue between outreach stages on a tour
// (tour_venues.status). Staged for approval like every agent write; executed by
// /api/help/actions/execute ('tour_target_stage').
//
// Confirmed is deliberately out of reach: confirming a show must create a
// bookings record, and that lives in /api/tours/venue-confirm. For the same
// reason a venue that is already Confirmed can't be moved from here.
//
// Service-role code bypasses RLS, so the target's tour is checked against the
// caller's band when staging and again when executing.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { updateVenueStatus } from '../statusSync';

/** The stages the agent may move a venue to. */
export const MOVABLE_STAGES = ['target', 'follow_up', 'declined', 'thank_you'] as const;
export type MovableStage = (typeof MOVABLE_STAGES)[number];

const CONFIRMED_NOTE = 'is Confirmed, so its show would be left out of step. Change that from the tour page.';

export interface TourTargetStagePayload {
  tour_venue_id: string;
  tour_name: string;
  venue_name: string;
  from_stage: string;
  to_stage: MovableStage;
}

const storedPayloadSchema = z.object({
  tour_venue_id: z.string().uuid(),
  venue_name: z.string().min(1),
  to_stage: z.enum(MOVABLE_STAGES),
});

interface TargetRow {
  id: string;
  status: string;
  tour: { name: string; act_id: string } | { name: string; act_id: string }[] | null;
  venue: { name: string | null } | { name: string | null }[] | null;
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/**
 * Loads a tour target, only if it is on one of the band's tours.
 *
 * @throws Error when the lookup fails
 */
async function loadOwnedTarget(service: SupabaseClient, actId: string, tourVenueId: string) {
  const { data, error } = await service
    .from('tour_venues')
    .select('id, status, tour:tours!inner(name, act_id), venue:venues(name)')
    .eq('id', tourVenueId)
    .eq('tour.act_id', actId)
    .maybeSingle();
  if (error) throw new Error(`Could not read that venue's outreach stage: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as TargetRow;
  const tour = one(row.tour);
  if (tour?.act_id !== actId) return null;
  return { id: row.id, status: row.status, tourName: tour.name, venueName: one(row.venue)?.name ?? 'Unnamed venue' };
}

/**
 * Validates one stage move and builds the staged payload.
 *
 * @param service     service-role client
 * @param actId       caller's band, from their profile
 * @param tourVenueId the target, from get_outreach
 * @param toStage     where it should go
 * @throws Error with a user-facing message when the move isn't allowed
 */
export async function buildTourTargetStagePayload(service: SupabaseClient, actId: string, tourVenueId: string, toStage: MovableStage): Promise<TourTargetStagePayload> {
  const target = await loadOwnedTarget(service, actId, tourVenueId);
  if (!target) throw new Error("That venue wasn't found on this band's tours.");
  if (target.status === 'confirmed') throw new Error(`${target.venueName} ${CONFIRMED_NOTE}`);
  if (target.status === toStage) throw new Error(`${target.venueName} is already in that stage.`);
  return { tour_venue_id: target.id, tour_name: target.tourName, venue_name: target.venueName, from_stage: target.status, to_stage: toStage };
}

/**
 * Applies a confirmed stage move, re-checking the band and the current stage.
 *
 * @param service service-role client
 * @param actId   caller's band, from their profile
 * @param userId  the admin who confirmed
 * @param payload the stored proposal
 * @returns the venue and its new stage
 * @throws Error with a user-facing message when the move is no longer valid
 */
export async function executeTourTargetStage(service: SupabaseClient, actId: string, userId: string, payload: unknown) {
  const checked = storedPayloadSchema.safeParse(payload);
  if (!checked.success) throw new Error('This stage change is no longer valid. Ask the assistant again.');
  const p = checked.data;
  const target = await loadOwnedTarget(service, actId, p.tour_venue_id);
  if (!target) throw new Error("That venue wasn't found on this band's tours.");
  if (target.status === 'confirmed') throw new Error(`${target.venueName} ${CONFIRMED_NOTE}`);
  await updateVenueStatus(service, target.id, p.to_stage, userId);
  return { tour_venue_id: target.id, venue_name: target.venueName, status: p.to_stage };
}
