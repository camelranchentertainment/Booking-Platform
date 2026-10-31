// lib/server/agentDeletes.ts
//
// What the /band agent may DELETE, and the checks that keep it from damaging
// the band's records. Policy (Scott, Oct 20 2026):
//
//   May delete  — upcoming shows / calendar days, tours, band members, notes, media.
//   May remove  — a venue from a tour's outreach list (tour_target). Only the
//                 tour_venues row goes; the venue, its contacts and its email
//                 history stay (email_log.tour_venue_id is ON DELETE SET NULL).
//                 Venues themselves are never deleted (Scott, Oct 30 2026).
//   Never       — show history (past or completed shows), anything with money
//                 attached (payments, deposits, expenses, pay history), logins /
//                 profiles, and never more than MAX_DELETES_PER_REQUEST things at once.
//
// A band member with history is RETIRED (is_active = false) instead of erased,
// so pay records and past line-ups stay intact.
//
// Every check runs twice: when the agent stages the proposal (so the card only
// ever offers something allowed) and again in /api/help/actions/execute right
// before anything is removed (so a stale or hand-crafted card can't slip past a
// change that happened in between). Deletes are staged like every agent write
// and only run after the user clicks Confirm.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const DELETE_TARGETS = ['show', 'tour', 'member', 'note', 'media', 'tour_target'] as const;
export type DeleteTarget = (typeof DELETE_TARGETS)[number];

/** Hard cap on items in one delete request — no bulk wipes. */
export const MAX_DELETES_PER_REQUEST = 3;
/**
 * Taking venues off a tour's outreach list erases nothing (the venues stay
 * saved), so a cleanup of a long target list may cover more at once.
 */
export const MAX_TARGET_REMOVALS_PER_REQUEST = 20;
/** A tour deleted together with its shows may not take more than this many shows with it. */
export const MAX_TOUR_SHOWS_DELETED = 30;

export const deleteRequestSchema = z
  .object({
    target: z.enum(DELETE_TARGETS),
    ids: z
      .array(z.string().uuid('Pick the item from your list'))
      .min(1, 'Say which item to delete.')
      .max(MAX_TARGET_REMOVALS_PER_REQUEST, `I can take at most ${MAX_TARGET_REMOVALS_PER_REQUEST} venues off a tour at a time.`),
    include_shows: z.boolean().optional(),
  })
  .refine(r => r.target === 'tour_target' || r.ids.length <= MAX_DELETES_PER_REQUEST, {
    message: `I can delete at most ${MAX_DELETES_PER_REQUEST} things at a time.`,
  })
  .refine(r => r.target !== 'tour' || r.ids.length === 1, { message: 'Delete one tour at a time.' })
  .refine(r => r.target === 'tour' || r.include_shows === undefined, { message: 'include_shows only applies to tours.' });
export type DeleteRequest = z.infer<typeof deleteRequestSchema>;

export interface DeleteItem {
  id: string;
  label: string;
  /**
   * 'retire' = member is kept but marked inactive because they have history.
   * 'remove' = taken off a list (a venue off a tour's outreach); nothing is erased.
   */
  mode: 'delete' | 'retire' | 'remove';
  /** For tour_target: the tour the target belongs to, re-checked against the band on execute. */
  tour_id?: string;
  /** Shows that go with a tour (include_shows) or stay on the calendar without it. */
  shows?: Array<{ id: string; label: string }>;
  note?: string;
}

export interface DeletePayload {
  target: DeleteTarget;
  include_shows: boolean;
  items: DeleteItem[];
}

type Verdict = { ok: true; item: DeleteItem } | { ok: false; reason: string };

/** Today as YYYY-MM-DD (UTC). A show dated before this is history. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

interface ShowRow {
  id: string;
  status: string | null;
  show_date: string | null;
  tour_id?: string | null;
  actual_amount_received: number | null;
  final_payment_received: number | null;
  deposit_paid: boolean | null;
  deposit_paid_date: string | null;
  date_paid: string | null;
  settled_by: string | null;
  payment_status: string | null;
  venue?: { name: string | null } | { name: string | null }[] | null;
}

const SHOW_COLUMNS =
  'id, status, show_date, tour_id, actual_amount_received, final_payment_received, deposit_paid, ' +
  'deposit_paid_date, date_paid, settled_by, payment_status, venue:venues(name)';

const UNPAID_STATUSES = new Set(['unpaid', 'pending', 'none', '']);

function showLabel(s: ShowRow): string {
  const v = Array.isArray(s.venue) ? s.venue[0] : s.venue;
  return `${v?.name || 'Show'} — ${s.show_date ?? 'no date'}`;
}

/**
 * Why a show row may not be deleted, judged from the row alone (no extra
 * queries). Returns null when the row itself is deletable.
 */
export function showRowBlocker(s: ShowRow, today: string): string | null {
  if (s.status === 'completed' || (s.show_date && s.show_date < today)) {
    return `${showLabel(s)} is a past show — it's part of your history and stays.`;
  }
  const moneyIn =
    (s.actual_amount_received ?? 0) > 0 ||
    (s.final_payment_received ?? 0) > 0 ||
    s.deposit_paid === true ||
    !!s.deposit_paid_date ||
    !!s.date_paid ||
    !!s.settled_by ||
    (s.payment_status != null && !UNPAID_STATUSES.has(s.payment_status));
  if (moneyIn) return `${showLabel(s)} has money recorded against it, so it can't be deleted. I can mark it cancelled instead.`;
  return null;
}

async function count(service: SupabaseClient, table: string, column: string, value: string): Promise<number> {
  const { count: n, error } = await service.from(table).select('id', { count: 'exact', head: true }).eq(column, value);
  if (error) throw new Error(`Safety check failed (${table}): ${error.message}`);
  return n ?? 0;
}

async function assessShow(service: SupabaseClient, actId: string, id: string, today: string): Promise<Verdict> {
  const { data, error } = await service.from('bookings').select(SHOW_COLUMNS).eq('id', id).eq('act_id', actId).maybeSingle();
  if (error) throw new Error(`Show lookup failed: ${error.message}`);
  if (!data) return { ok: false, reason: "That show wasn't found for this band." };
  const show = data as unknown as ShowRow;
  const blocker = showRowBlocker(show, today);
  if (blocker) return { ok: false, reason: blocker };
  if ((await count(service, 'expenses', 'booking_id', id)) > 0) {
    return { ok: false, reason: `${showLabel(show)} has expenses on it, so it can't be deleted. I can mark it cancelled instead.` };
  }
  if ((await count(service, 'email_log', 'booking_id', id)) > 0) {
    return { ok: false, reason: `${showLabel(show)} has email history, so it can't be deleted. I can mark it cancelled instead.` };
  }
  return { ok: true, item: { id, label: showLabel(show), mode: 'delete' } };
}

async function assessTour(
  service: SupabaseClient, actId: string, id: string, today: string, includeShows: boolean,
): Promise<Verdict> {
  const { data: tour, error } = await service.from('tours').select('id, name').eq('id', id).eq('act_id', actId).maybeSingle();
  if (error) throw new Error(`Tour lookup failed: ${error.message}`);
  if (!tour) return { ok: false, reason: "That tour wasn't found for this band." };
  const name = (tour as { name: string | null }).name || 'that tour';

  if ((await count(service, 'expenses', 'tour_id', id)) > 0) {
    return { ok: false, reason: `"${name}" has expenses recorded, so it can't be deleted. I can mark it cancelled instead.` };
  }
  const { data: rows, error: sErr } = await service.from('bookings').select(SHOW_COLUMNS).eq('tour_id', id).eq('act_id', actId);
  if (sErr) throw new Error(`Tour shows lookup failed: ${sErr.message}`);
  const shows = (rows ?? []) as unknown as ShowRow[];

  // Past or paid shows are history whether or not they'd be deleted — a tour
  // that has any can't be removed (that would strip the history of its tour).
  for (const s of shows) {
    const blocker = showRowBlocker(s, today);
    if (blocker) return { ok: false, reason: `"${name}" has show history (${showLabel(s)}), so it can't be deleted. I can mark the tour cancelled instead.` };
  }

  if (includeShows) {
    if (shows.length > MAX_TOUR_SHOWS_DELETED) {
      return { ok: false, reason: `"${name}" has ${shows.length} shows — too many to delete at once. Delete or cancel some first.` };
    }
    for (const s of shows) {
      const v = await assessShow(service, actId, s.id, today);
      if (!v.ok) return { ok: false, reason: v.reason };
    }
  }

  return {
    ok: true,
    item: {
      id,
      label: `Tour "${name}"`,
      mode: 'delete',
      shows: shows.map(s => ({ id: s.id, label: showLabel(s) })),
      note: shows.length === 0
        ? undefined
        : includeShows
          ? `Its ${shows.length} upcoming show${shows.length === 1 ? '' : 's'} will be deleted too.`
          : `Its ${shows.length} upcoming show${shows.length === 1 ? '' : 's'} stay on your calendar as standalone shows.`,
    },
  };
}

async function assessMember(service: SupabaseClient, actId: string, id: string, today: string): Promise<Verdict> {
  const { data, error } = await service
    .from('act_personnel').select('id, name, is_active, linked_user_id').eq('id', id).eq('act_id', actId).maybeSingle();
  if (error) throw new Error(`Roster lookup failed: ${error.message}`);
  if (!data) return { ok: false, reason: "That band member wasn't found on your roster." };
  const m = data as { id: string; name: string | null; is_active: boolean | null; linked_user_id: string | null };
  const name = m.name || 'that member';

  const reasons: string[] = [];
  if (m.linked_user_id) reasons.push('has a login');
  if ((await count(service, 'expenses', 'personnel_id', id)) > 0) reasons.push('has pay history');
  if ((await count(service, 'act_invitations', 'personnel_id', id)) > 0) reasons.push('has an invitation on file');
  const { data: gigs, error: gErr } = await service
    .from('booking_personnel').select('booking:bookings(status, show_date)').eq('personnel_id', id);
  if (gErr) throw new Error(`Roster history check failed: ${gErr.message}`);
  const playedPast = (gigs ?? []).some((g: { booking: unknown }) => {
    const b = (Array.isArray(g.booking) ? g.booking[0] : g.booking) as { status?: string; show_date?: string } | null;
    return !!b && (b.status === 'completed' || (!!b.show_date && b.show_date < today));
  });
  if (playedPast) reasons.push('played past shows');

  if (reasons.length === 0) return { ok: true, item: { id, label: name, mode: 'delete' } };
  if (m.is_active === false) return { ok: false, reason: `${name} is already retired and ${reasons[0]}, so they stay on record.` };
  return {
    ok: true,
    item: { id, label: name, mode: 'retire', note: `${name} ${reasons.join(' and ')}, so they'll be retired (hidden, records kept) instead of erased.` },
  };
}

async function assessNote(service: SupabaseClient, actId: string, userId: string, id: string): Promise<Verdict> {
  const { data, error } = await service
    .from('daily_notes').select('id, act_id, user_id, note_date, content, visibility').eq('id', id).maybeSingle();
  if (error) throw new Error(`Note lookup failed: ${error.message}`);
  const n = data as { act_id: string | null; user_id: string; note_date: string; content: string | null; visibility: string } | null;
  const visible = !!n && (n.user_id === userId || (n.act_id === actId && ['band_admin', 'all_members'].includes(n.visibility)));
  if (!n || !visible) return { ok: false, reason: "That note wasn't found." };
  const snippet = (n.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return { ok: true, item: { id, label: `Note ${n.note_date}${snippet ? `: "${snippet}${(n.content ?? '').length > 60 ? '…' : ''}"` : ''}`, mode: 'delete' } };
}

async function assessMedia(service: SupabaseClient, actId: string, id: string): Promise<Verdict> {
  const { data, error } = await service
    .from('media_library').select('id, file_name, is_primary_logo').eq('id', id).eq('act_id', actId).maybeSingle();
  if (error) throw new Error(`Media lookup failed: ${error.message}`);
  if (!data) return { ok: false, reason: "That file wasn't found in your media." };
  const m = data as { file_name: string | null; is_primary_logo: boolean | null };
  const name = m.file_name || 'that file';
  if (m.is_primary_logo) return { ok: false, reason: `${name} is your band's main logo. Pick a new logo first, then it can be deleted.` };
  const inUse =
    (await count(service, 'generated_posters', 'media_asset_id', id)) +
    (await count(service, 'generated_posters', 'output_media_asset_id', id)) +
    (await count(service, 'social_announcements', 'background_media_id', id));
  if (inUse > 0) return { ok: false, reason: `${name} is used in a poster or social post, so it stays.` };
  return { ok: true, item: { id, label: name, mode: 'delete' } };
}

async function assessTourTarget(service: SupabaseClient, actId: string, id: string): Promise<Verdict> {
  // tour_venues has no act_id: ownership is proven through its tour.
  const { data, error } = await service
    .from('tour_venues').select('id, status, tour_id, tour:tours(id, name, act_id), venue:venues(name)').eq('id', id).maybeSingle();
  if (error) throw new Error(`Outreach lookup failed: ${error.message}`);
  const row = data as unknown as {
    status: string | null; tour_id: string;
    tour: { name: string | null; act_id: string } | { name: string | null; act_id: string }[] | null;
    venue: { name: string | null } | { name: string | null }[] | null;
  } | null;
  const tour = Array.isArray(row?.tour) ? row?.tour[0] : row?.tour;
  if (!row || !tour || tour.act_id !== actId) return { ok: false, reason: "That venue isn't on one of your tours' outreach lists." };
  const venue = (Array.isArray(row.venue) ? row.venue[0] : row.venue)?.name || 'That venue';
  const tourName = tour.name || 'the tour';

  const notes: string[] = [];
  if (row.status === 'confirmed') notes.push('Its confirmed show stays on your calendar.');
  const drafts = await count(service, 'email_drafts', 'tour_venue_id', id);
  if (drafts > 0) notes.push(`${drafts} unsent draft${drafts === 1 ? '' : 's'} for it will be discarded.`);
  return {
    ok: true,
    item: {
      id,
      tour_id: row.tour_id,
      label: `${venue} from ${tourName} outreach (the venue stays saved)`,
      mode: 'remove',
      ...(notes.length ? { note: notes.join(' ') } : {}),
    },
  };
}

/** Runs the right check for one item. */
async function assess(
  service: SupabaseClient, actId: string, userId: string, target: DeleteTarget, id: string, today: string, includeShows: boolean,
): Promise<Verdict> {
  switch (target) {
    case 'show': return assessShow(service, actId, id, today);
    case 'tour': return assessTour(service, actId, id, today, includeShows);
    case 'member': return assessMember(service, actId, id, today);
    case 'note': return assessNote(service, actId, userId, id);
    case 'media': return assessMedia(service, actId, id);
    case 'tour_target': return assessTourTarget(service, actId, id);
  }
}

/**
 * Validates a delete request and builds the staged payload. All-or-nothing:
 * if any item may not be deleted, nothing is staged and the reasons are given.
 *
 * @throws Error with a user-facing message when invalid or not allowed
 */
export async function buildDeletePayload(
  service: SupabaseClient, actId: string, userId: string, rawArgs: unknown, now: Date = new Date(),
): Promise<DeletePayload> {
  const parsed = deleteRequestSchema.safeParse(rawArgs);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'That delete request is not valid.');
  const { target, include_shows } = parsed.data;
  const ids = [...new Set(parsed.data.ids)];
  const today = todayIso(now);

  const items: DeleteItem[] = [];
  const blocked: string[] = [];
  for (const id of ids) {
    const v = await assess(service, actId, userId, target, id, today, include_shows === true);
    if (v.ok) items.push(v.item); else blocked.push(v.reason);
  }
  if (blocked.length > 0) throw new Error(blocked.join('\n'));
  return { target, include_shows: include_shows === true, items };
}

export type ShowCalendarCleanup = (bookingId: string, actId: string) => Promise<unknown>;

/**
 * Carries out an approved delete. Re-checks every item first; if anything is
 * no longer allowed, nothing is removed.
 *
 * Not one database transaction: a tour delete removes its shows, detaches
 * notes and then removes the tour in order, each scoped to the caller's band.
 *
 * @param cleanupCalendar removes a show's Google Calendar event before the row goes
 * @throws Error when the payload is invalid, a re-check fails, or a write fails
 */
export async function executeDelete(
  service: SupabaseClient, actId: string, userId: string, payload: unknown,
  cleanupCalendar: ShowCalendarCleanup, now: Date = new Date(),
) {
  const p = payload as Partial<DeletePayload> | null;
  const fresh = await buildDeletePayload(service, actId, userId, {
    target: p?.target,
    ids: (p?.items ?? []).map(i => i?.id),
    ...(p?.target === 'tour' ? { include_shows: p?.include_shows === true } : {}),
  }, now);

  const done: Array<{ id: string; label: string; mode: DeleteItem['mode'] }> = [];
  for (const item of fresh.items) {
    switch (fresh.target) {
      case 'show':
        await deleteShow(service, actId, item.id, cleanupCalendar);
        break;
      case 'tour': {
        if (fresh.include_shows) {
          for (const s of item.shows ?? []) await deleteShow(service, actId, s.id, cleanupCalendar);
        } else {
          const { error } = await service.from('bookings').update({ tour_id: null }).eq('tour_id', item.id).eq('act_id', actId);
          if (error) throw new Error(`Could not move the tour's shows off the tour: ${error.message}`);
        }
        const { error: nErr } = await service.from('daily_notes').update({ tour_id: null }).eq('tour_id', item.id).eq('act_id', actId);
        if (nErr) throw new Error(`Could not keep the tour's notes: ${nErr.message}`);
        const { error } = await service.from('tours').delete().eq('id', item.id).eq('act_id', actId);
        if (error) throw new Error(`Could not delete the tour: ${error.message}`);
        break;
      }
      case 'member': {
        const q = item.mode === 'retire'
          ? service.from('act_personnel').update({ is_active: false }).eq('id', item.id).eq('act_id', actId)
          : service.from('act_personnel').delete().eq('id', item.id).eq('act_id', actId);
        const { error } = await q;
        if (error) throw new Error(`Could not ${item.mode === 'retire' ? 'retire' : 'remove'} ${item.label}: ${error.message}`);
        break;
      }
      case 'note': {
        const { error } = await service.from('daily_notes').delete().eq('id', item.id);
        if (error) throw new Error(`Could not delete the note: ${error.message}`);
        break;
      }
      case 'tour_target': {
        // Scoped to the tour the re-check just proved is this band's. Only the outreach row goes.
        if (!item.tour_id) throw new Error(`Could not remove ${item.label}: its tour is unknown.`);
        const { error } = await service.from('tour_venues').delete().eq('id', item.id).eq('tour_id', item.tour_id);
        if (error) throw new Error(`Could not remove ${item.label}: ${error.message}`);
        break;
      }
      case 'media': {
        const { data: row, error } = await service
          .from('media_library').delete().eq('id', item.id).eq('act_id', actId).select('storage_path').maybeSingle();
        if (error) throw new Error(`Could not delete ${item.label}: ${error.message}`);
        const path = (row as { storage_path: string | null } | null)?.storage_path;
        if (path) {
          // The record is gone either way; a leftover file is only storage, so log rather than fail.
          const { error: sErr } = await service.storage.from('media-library').remove([path]);
          if (sErr) console.error('[agentDeletes] storage remove failed:', sErr.message);
        }
        break;
      }
    }
    done.push({ id: item.id, label: item.label, mode: item.mode });
  }
  return { target: fresh.target, done };
}

async function deleteShow(service: SupabaseClient, actId: string, id: string, cleanupCalendar: ShowCalendarCleanup) {
  // Cancel first so the existing calendar sync removes any Google Calendar
  // event; then remove the row. Calendar cleanup failing must not block the delete.
  const { error: cErr } = await service.from('bookings').update({ status: 'cancelled' }).eq('id', id).eq('act_id', actId);
  if (cErr) throw new Error(`Could not delete the show: ${cErr.message}`);
  try {
    await cleanupCalendar(id, actId);
  } catch (err) {
    console.error('[agentDeletes] calendar cleanup failed:', err instanceof Error ? err.message : err);
  }
  const { error } = await service.from('bookings').delete().eq('id', id).eq('act_id', actId);
  if (error) throw new Error(`Could not delete the show: ${error.message}`);
}
