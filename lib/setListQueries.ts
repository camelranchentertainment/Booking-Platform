// lib/setListQueries.ts
//
// Browser-side data access for the Set List Builder. Every call goes through the
// signed-in user's Supabase client, so Row Level Security decides what they can
// read and write (admins only for songs and set list rows). The band (act_id) is
// always the caller's own profile act, passed in by the page from useAuth().
//
// Each function returns a Result instead of throwing, so pages can show a
// specific message and a retry rather than a blank screen.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  friendlyDbError, itemsFromRows, toSavePayload,
  type BuilderItem, type SetListItemRow, type SetListRow, type SongRow,
} from './domain/setLists';

export type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const SONG_COLUMNS = 'id, title, artist, song_key, tempo_bpm, duration_sec, notes, updated_at';
const SET_LIST_COLUMNS = 'id, name, booking_id, is_template, notes, published_version, published_at, updated_at, created_at';
const ITEM_COLUMNS = 'id, position, item_type, song_id, label, key_override, notes';

/** Statuses of shows you'd build a set for. Pitches and holds aren't real nights yet. */
export const SET_LIST_SHOW_STATUSES = ['contract', 'confirmed', 'advancing'] as const;

/** A show a set list can be attached to. */
export interface ShowOption {
  id: string;
  show_date: string;
  status: string;
  set_length_min: number | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_state: string | null;
}

function fail<T>(err: PostgrestError | null, fallback: string, where: string): Result<T> {
  // Structured, no user data: code + message is enough to find it in Sentry/Vercel logs.
  console.error(`[set-lists] ${where} failed`, { code: err?.code, message: err?.message });
  return { ok: false, message: friendlyDbError(err, fallback) };
}

/** Input for creating or editing a song. Strings are trimmed by the caller. */
export interface SongInput {
  title: string;
  artist: string | null;
  song_key: string | null;
  tempo_bpm: number | null;
  duration_sec: number | null;
  notes: string | null;
}

/**
 * Loads the band's song library (not archived), A–Z.
 *
 * @param db signed-in client
 * @param actId the caller's own band
 */
export async function loadSongs(db: SupabaseClient, actId: string): Promise<Result<SongRow[]>> {
  const { data, error } = await db
    .from('songs')
    .select(SONG_COLUMNS)
    .eq('act_id', actId)
    .is('deleted_at', null)
    .order('title', { ascending: true });
  if (error) return fail(error, 'Couldn’t load your songs.', 'loadSongs');
  return { ok: true, data: (data ?? []) as SongRow[] };
}

/**
 * Adds a song, or updates one when `id` is given.
 *
 * @param db signed-in client
 * @param actId the caller's own band
 * @param input song fields
 * @param id existing song id to update
 */
export async function saveSong(db: SupabaseClient, actId: string, input: SongInput, id?: string): Promise<Result<SongRow>> {
  const query = id
    ? db.from('songs').update(input).eq('id', id).eq('act_id', actId).select(SONG_COLUMNS).single()
    : db.from('songs').insert({ ...input, act_id: actId }).select(SONG_COLUMNS).single();
  const { data, error } = await query;
  if (error || !data) return fail(error, 'Couldn’t save that song.', 'saveSong');
  return { ok: true, data: data as SongRow };
}

/**
 * Names of active set lists that still use a song. A song on a set list can't be
 * archived, because the next save of that list would be rejected.
 *
 * @param db signed-in client
 * @param songId the song to check
 */
export async function setListsUsingSong(db: SupabaseClient, songId: string): Promise<Result<string[]>> {
  const { data, error } = await db
    .from('set_list_items')
    .select('set_list:set_list_id ( name, deleted_at )')
    .eq('song_id', songId);
  if (error) return fail(error, 'Couldn’t check where that song is used.', 'setListsUsingSong');
  const names = new Set<string>();
  for (const r of (data ?? []) as Array<{ set_list: { name: string; deleted_at: string | null } | Array<{ name: string; deleted_at: string | null }> | null }>) {
    const sl = Array.isArray(r.set_list) ? r.set_list[0] : r.set_list;
    if (sl && !sl.deleted_at) names.add(sl.name);
  }
  return { ok: true, data: [...names].sort() };
}

/**
 * Archives a song (soft delete). Pushed set lists keep their copy.
 *
 * @param db signed-in client
 * @param actId the caller's own band
 * @param songId the song to archive
 */
export async function archiveSong(db: SupabaseClient, actId: string, songId: string): Promise<Result<null>> {
  const { error } = await db
    .from('songs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', songId)
    .eq('act_id', actId);
  if (error) return fail(error, 'Couldn’t remove that song.', 'archiveSong');
  return { ok: true, data: null };
}

/**
 * Loads all active set lists for the band, newest first.
 *
 * @param db signed-in client
 * @param actId the caller's own band
 */
export async function loadSetLists(db: SupabaseClient, actId: string): Promise<Result<SetListRow[]>> {
  const { data, error } = await db
    .from('set_lists')
    .select(SET_LIST_COLUMNS)
    .eq('act_id', actId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) return fail(error, 'Couldn’t load your set lists.', 'loadSetLists');
  return { ok: true, data: (data ?? []) as SetListRow[] };
}

/**
 * Loads one set list header.
 *
 * @param db signed-in client
 * @param actId the caller's own band
 * @param id set list id
 */
export async function loadSetList(db: SupabaseClient, actId: string, id: string): Promise<Result<SetListRow | null>> {
  const { data, error } = await db
    .from('set_lists')
    .select(SET_LIST_COLUMNS)
    .eq('id', id)
    .eq('act_id', actId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return fail(error, 'Couldn’t load that set list.', 'loadSetList');
  return { ok: true, data: (data as SetListRow | null) ?? null };
}

/**
 * Loads a set list's rows in order, ready for the builder.
 *
 * @param db signed-in client
 * @param setListId set list id
 */
export async function loadItems(db: SupabaseClient, setListId: string): Promise<Result<BuilderItem[]>> {
  const { data, error } = await db
    .from('set_list_items')
    .select(ITEM_COLUMNS)
    .eq('set_list_id', setListId)
    .order('position', { ascending: true });
  if (error) return fail(error, 'Couldn’t load the songs on this set list.', 'loadItems');
  return { ok: true, data: itemsFromRows((data ?? []) as SetListItemRow[]) };
}

/**
 * Replaces the set list's rows in one database transaction.
 *
 * @param db signed-in client
 * @param setListId set list id
 * @param items rows in display order
 */
export async function saveItems(db: SupabaseClient, setListId: string, items: readonly BuilderItem[]): Promise<Result<null>> {
  let payload;
  try {
    payload = toSavePayload(items);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'That set list is too long.' };
  }
  const { error } = await db.rpc('save_set_list_items', { p_set_list_id: setListId, p_items: payload });
  if (error) return fail(error, 'Couldn’t save your changes.', 'saveItems');
  return { ok: true, data: null };
}

/** Fields an admin can change on a set list header. */
export interface SetListHeaderInput {
  name?: string;
  notes?: string | null;
}

/**
 * Renames a set list or changes its notes.
 *
 * @param db signed-in client
 * @param actId the caller's own band
 * @param id set list id
 * @param input changed fields
 */
export async function updateSetListHeader(
  db: SupabaseClient, actId: string, id: string, input: SetListHeaderInput,
): Promise<Result<SetListRow>> {
  const { data, error } = await db
    .from('set_lists')
    .update(input)
    .eq('id', id)
    .eq('act_id', actId)
    .select(SET_LIST_COLUMNS)
    .single();
  if (error || !data) return fail(error, 'Couldn’t save that change.', 'updateSetListHeader');
  return { ok: true, data: data as SetListRow };
}

/** What a new set list is for. */
export type NewSetListTarget = { kind: 'show'; bookingId: string } | { kind: 'template' };

/**
 * Creates a set list, optionally starting from a copy of another one's rows.
 * If copying the rows fails, the new (empty) list is removed again so the
 * admin isn't left with a half-made copy.
 *
 * @param db signed-in client
 * @param actId the caller's own band
 * @param name set list name
 * @param target the show it's for, or a reusable template
 * @param copyFromId set list whose rows to copy
 */
export async function createSetList(
  db: SupabaseClient, actId: string, name: string, target: NewSetListTarget, copyFromId: string | null,
): Promise<Result<SetListRow>> {
  let sourceItems: BuilderItem[] = [];
  if (copyFromId) {
    const src = await loadItems(db, copyFromId);
    if (!src.ok) return src;
    sourceItems = src.data;
  }

  const { data, error } = await db
    .from('set_lists')
    .insert({
      act_id: actId,
      name,
      is_template: target.kind === 'template',
      booking_id: target.kind === 'show' ? target.bookingId : null,
    })
    .select(SET_LIST_COLUMNS)
    .single();
  if (error || !data) return fail(error, 'Couldn’t create the set list.', 'createSetList');
  const created = data as SetListRow;

  if (sourceItems.length) {
    const saved = await saveItems(db, created.id, sourceItems);
    if (!saved.ok) {
      await db.from('set_lists').update({ deleted_at: new Date().toISOString() }).eq('id', created.id).eq('act_id', actId);
      return { ok: false, message: `Couldn’t copy the songs over. ${saved.message}` };
    }
  }
  return { ok: true, data: created };
}

/**
 * Removes a set list (soft delete). Frees its show for a new set list.
 *
 * @param db signed-in client
 * @param actId the caller's own band
 * @param id set list id
 */
export async function archiveSetList(db: SupabaseClient, actId: string, id: string): Promise<Result<null>> {
  const { error } = await db
    .from('set_lists')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('act_id', actId);
  if (error) return fail(error, 'Couldn’t delete that set list.', 'archiveSetList');
  return { ok: true, data: null };
}

type ShowJoinRow = {
  id: string; show_date: string; status: string; set_length_min: number | null;
  venue: { name: string | null; city: string | null; state: string | null } | Array<{ name: string | null; city: string | null; state: string | null }> | null;
};

function toShowOption(r: ShowJoinRow): ShowOption {
  const v = Array.isArray(r.venue) ? (r.venue[0] ?? null) : r.venue;
  return {
    id: r.id, show_date: r.show_date, status: r.status, set_length_min: r.set_length_min,
    venue_name: v?.name ?? null, venue_city: v?.city ?? null, venue_state: v?.state ?? null,
  };
}

/**
 * Loads the band's upcoming contracted/confirmed shows, soonest first.
 *
 * @param db signed-in client
 * @param actId the caller's own band
 * @param fromDate "YYYY-MM-DD" (the user's local today)
 */
export async function loadUpcomingShows(db: SupabaseClient, actId: string, fromDate: string): Promise<Result<ShowOption[]>> {
  const { data, error } = await db
    .from('bookings')
    .select('id, show_date, status, set_length_min, venue:venue_id ( name, city, state )')
    .eq('act_id', actId)
    .in('status', [...SET_LIST_SHOW_STATUSES])
    .gte('show_date', fromDate)
    .order('show_date', { ascending: true })
    .limit(150);
  if (error) return fail(error, 'Couldn’t load your upcoming shows.', 'loadUpcomingShows');
  return { ok: true, data: ((data ?? []) as unknown as ShowJoinRow[]).map(toShowOption) };
}

/**
 * Loads specific shows by id (for set lists attached to shows that are now past).
 *
 * @param db signed-in client
 * @param actId the caller's own band
 * @param ids booking ids
 */
export async function loadShowsByIds(db: SupabaseClient, actId: string, ids: readonly string[]): Promise<Result<ShowOption[]>> {
  if (ids.length === 0) return { ok: true, data: [] };
  const { data, error } = await db
    .from('bookings')
    .select('id, show_date, status, set_length_min, venue:venue_id ( name, city, state )')
    .eq('act_id', actId)
    .in('id', [...ids]);
  if (error) return fail(error, 'Couldn’t load the shows for your set lists.', 'loadShowsByIds');
  return { ok: true, data: ((data ?? []) as unknown as ShowJoinRow[]).map(toShowOption) };
}

/** "The Blue Moose · Iowa City, IA" — or "Venue TBD". */
export function showLabel(show: Pick<ShowOption, 'venue_name' | 'venue_city' | 'venue_state'>): string {
  const place = [show.venue_city, show.venue_state].filter(Boolean).join(', ');
  const name = show.venue_name?.trim() || 'Venue TBD';
  return place ? `${name} · ${place}` : name;
}
