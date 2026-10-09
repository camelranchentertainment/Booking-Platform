// lib/server/agentTourActions.ts
//
// Agent "edit a tour" — rename, change dates/description, or change status
// (including cancel). Staged for approval like every agent write; executed by
// /api/help/actions/execute (action_type 'tour_update').
//
// Cancelling a tour only changes the tour's status. Its shows are left alone
// on purpose — each show is cancelled (or kept) separately.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD');
export const TOUR_STATUSES = ['planning', 'active', 'completed', 'cancelled'] as const;

export const tourUpdateSchema = z.object({
  tour_id: z.string().uuid('Pick the tour from your list'),
  name: z.string().trim().min(1).max(200).optional(),
  start_date: isoDate.nullable().optional(),
  end_date: isoDate.nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(TOUR_STATUSES).optional(),
});
export type TourUpdateArgs = z.infer<typeof tourUpdateSchema>;

const CHANGE_KEYS = ['name', 'start_date', 'end_date', 'description', 'status'] as const;
type ChangeKey = (typeof CHANGE_KEYS)[number];

export interface TourUpdatePayload {
  tour_id: string;
  tour_name: string;
  changes: Partial<Record<ChangeKey, string | null>>;
  previous: Partial<Record<ChangeKey, string | null>>;
}

/**
 * Validates a tour edit against the band's tour and builds the staged payload
 * (only the fields that actually change, plus their previous values for the card).
 *
 * @throws Error with a user-facing message when invalid, not found, or nothing changes
 */
export async function buildTourUpdatePayload(
  service: SupabaseClient,
  actId: string,
  rawArgs: unknown,
): Promise<TourUpdatePayload> {
  const parsed = tourUpdateSchema.safeParse(rawArgs);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'That tour change is not valid.');
  const args = parsed.data;

  const { data: tour, error } = await service
    .from('tours')
    .select('id, name, start_date, end_date, description, status')
    .eq('id', args.tour_id)
    .eq('act_id', actId)
    .maybeSingle();
  if (error) throw new Error(`Tour lookup failed: ${error.message}`);
  if (!tour) throw new Error("That tour wasn't found for this band.");

  const current = tour as Record<ChangeKey, string | null> & { id: string };
  const changes: TourUpdatePayload['changes'] = {};
  const previous: TourUpdatePayload['previous'] = {};
  for (const key of CHANGE_KEYS) {
    const next = args[key];
    if (next === undefined) continue;
    if ((next ?? null) === (current[key] ?? null)) continue;
    changes[key] = next ?? null;
    previous[key] = current[key] ?? null;
  }
  if (Object.keys(changes).length === 0) throw new Error('Nothing would change on that tour.');
  // The card shows the full date range even when only one end moves.
  if ('start_date' in changes || 'end_date' in changes) {
    previous.start_date = current.start_date ?? null;
    previous.end_date = current.end_date ?? null;
  }

  const start = 'start_date' in changes ? changes.start_date : current.start_date;
  const end = 'end_date' in changes ? changes.end_date : current.end_date;
  if (start && end && end < start) throw new Error('The end date is before the start date.');

  return { tour_id: current.id, tour_name: current.name ?? '', changes, previous };
}

/**
 * Applies an approved tour edit. Re-validates the stored payload and only
 * writes whitelisted columns, scoped to the caller's band.
 *
 * @throws Error when the payload is invalid or the write fails / finds no tour
 */
export async function executeTourUpdate(service: SupabaseClient, actId: string, payload: unknown) {
  const p = payload as Partial<TourUpdatePayload> | null;
  const checked = tourUpdateSchema.safeParse({ tour_id: p?.tour_id, ...(p?.changes ?? {}) });
  if (!checked.success) throw new Error('This tour change is no longer valid. Ask the assistant again.');

  const update: Record<string, string | null> = { updated_at: new Date().toISOString() };
  for (const key of CHANGE_KEYS) {
    if (checked.data[key] !== undefined) update[key] = checked.data[key] ?? null;
  }

  const { data, error } = await service
    .from('tours')
    .update(update)
    .eq('id', checked.data.tour_id)
    .eq('act_id', actId)
    .select('id, name, start_date, end_date, status')
    .maybeSingle();
  if (error) throw new Error(`Could not update the tour: ${error.message}`);
  if (!data) throw new Error("That tour wasn't found for this band.");
  return data;
}
