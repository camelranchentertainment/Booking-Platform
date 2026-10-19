// lib/server/agentVenueBatch.ts
//
// Batch venue edits for the Booking Agent.
//
// Why: the agent used to stage exactly one venue per reply, so updating a list
// of venues meant approve → "next" → approve → "next". A venue_batch action
// stages up to VENUE_BATCH_CAP venue changes in one reply; they appear on one
// approval card and a single Confirm executes them all through
// /api/help/actions/execute (which already accepts an array of ids).
//
// Nothing about the safety model changes: every venue is validated by the same
// buildVenueUpsertPayload used for single edits, stored as its own pending
// 'venue_upsert' row (no new action type, so no database migration), and
// nothing writes to `venues` until the user approves.
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildVenueUpsertPayload, type VenueUpsertPayload } from './agentVenueActions';
import { stageAction, type StagedResult } from './agentStage';

/** Most venue changes staged from one reply. Keeps the model's JSON well under max_tokens. */
export const VENUE_BATCH_CAP = 8;

/** Most venue names one multi-name find_venue lookup may search for. */
export const MAX_LOOKUP_NAMES = VENUE_BATCH_CAP;

export type StagedVenue = StagedResult<'venue_upsert', VenueUpsertPayload> & { kind: 'venue_upsert' };

export interface VenueBatchResult {
  staged: StagedVenue[];
  errors: string[];
  /** Venues the model sent beyond VENUE_BATCH_CAP; not staged. */
  overflow: number;
}

/** A short label for error messages, from whatever identifying fields the model sent. */
function labelFor(raw: unknown, index: number): string {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (typeof r.name === 'string' && r.name.trim()) return r.name.trim();
  }
  return `venue ${index + 1}`;
}

/**
 * Validates and stages a list of venue creates/edits from one agent reply.
 * Each venue is handled independently: one bad entry is reported in `errors`
 * and the rest still stage. The same venue twice in one batch is refused
 * (the second copy would silently overwrite the first on approval).
 *
 * @param service service-role client
 * @param actId   caller's band (from their profile) — every venue is scoped to it
 * @param userId  caller
 * @param rawList model output: expected to be an array of venue_upsert argument objects
 * @returns staged rows, per-venue errors, and how many were over the cap
 */
export async function stageVenueBatch(
  service: SupabaseClient,
  actId: string,
  userId: string,
  rawList: unknown,
): Promise<VenueBatchResult> {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return { staged: [], errors: ['No venues were listed to update.'], overflow: 0 };
  }

  const capped = rawList.slice(0, VENUE_BATCH_CAP);
  const overflow = rawList.length - capped.length;
  const staged: StagedVenue[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenNewVenues = new Set<string>();

  // Sequential on purpose: per-venue reads + inserts are cheap, and ordering the
  // card in the same order the user listed the venues keeps review easy.
  for (const [i, raw] of capped.entries()) {
    const label = labelFor(raw, i);
    try {
      const payload = await buildVenueUpsertPayload(service, actId, raw);

      const key = payload.mode === 'update'
        ? payload.venue_id ?? ''
        : `${payload.venue_name}|${String(payload.changes.city ?? '')}`.toLowerCase();
      const seen = payload.mode === 'update' ? seenIds : seenNewVenues;
      if (seen.has(key)) {
        errors.push(`${payload.venue_name || label} is listed twice — put all its changes in one entry.`);
        continue;
      }
      seen.add(key);

      const result = await stageAction(service, actId, userId, 'venue_upsert', payload);
      staged.push({ kind: 'venue_upsert', ...result });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not stage this venue.';
      errors.push(`${label}: ${msg}`);
    }
  }

  if (errors.length > 0) {
    console.warn('[agent] venue_batch partial', { actId, staged: staged.length, failed: errors.length, overflow });
  }
  return { staged, errors, overflow };
}

/**
 * Normalises the names in a multi-venue find_venue ({"names":[...]}): trimmed,
 * non-empty, de-duplicated case-insensitively, capped at MAX_LOOKUP_NAMES.
 */
export function normaliseLookupNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of raw) {
    if (typeof n !== 'string') continue;
    const t = n.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length === MAX_LOOKUP_NAMES) break;
  }
  return out;
}
