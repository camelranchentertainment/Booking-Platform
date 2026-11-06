// lib/domain/setLists.ts
//
// Pure logic for the Set List Builder: song lengths, running time, push status,
// the payload the save_set_list_items() database function expects, and turning
// database errors into sentences a band admin can act on.
//
// No Supabase or React here, so all of it is unit-tested
// (__tests__/lib/domain/setLists.test.ts).

/** A song in the band's library (public.songs). */
export interface SongRow {
  id: string;
  title: string;
  artist: string | null;
  song_key: string | null;
  tempo_bpm: number | null;
  duration_sec: number | null;
  notes: string | null;
  updated_at: string;
}

/** A set list header (public.set_lists), without the snapshot body. */
export interface SetListRow {
  id: string;
  name: string;
  booking_id: string | null;
  is_template: boolean;
  notes: string | null;
  published_version: number;
  published_at: string | null;
  updated_at: string;
  created_at: string;
}

export type SetItemType = 'song' | 'break' | 'note';

/** One row in the builder. `key` is a client-only id for React lists and drag-and-drop. */
export interface BuilderItem {
  key: string;
  item_type: SetItemType;
  song_id: string | null;
  label: string | null;
  key_override: string | null;
  notes: string | null;
}

/** A row as stored in public.set_list_items. */
export interface SetListItemRow {
  id: string;
  position: number;
  item_type: SetItemType;
  song_id: string | null;
  label: string | null;
  key_override: string | null;
  notes: string | null;
}

/** The exact element shape save_set_list_items() reads from its JSON array. */
export interface SaveItemPayload {
  item_type: SetItemType;
  song_id: string | null;
  label: string | null;
  key_override: string | null;
  notes: string | null;
}

/** Hard limits that mirror the database CHECK constraints, so the UI fails early and clearly. */
export const LIMITS = {
  items: 200,
  title: 200,
  artist: 200,
  key: 12,
  songNotes: 2000,
  itemNotes: 500,
  label: 200,
  setName: 200,
  bpmMin: 20,
  bpmMax: 400,
  durationMaxSec: 3600,
} as const;

/**
 * Parses a song length typed by a person.
 * Accepts "3:45", "03:45", "1:02:30" (h:mm:ss) and plain seconds ("225").
 *
 * @param input raw text from the length field
 * @returns seconds, `null` for blank input, or `undefined` when it can't be read
 */
export function parseDuration(input: string): number | null | undefined {
  const text = input.trim();
  if (text === '') return null;
  if (/^\d+$/.test(text)) {
    const secs = Number(text);
    return secs >= 1 && secs <= LIMITS.durationMaxSec ? secs : undefined;
  }
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(text);
  if (!m) return undefined;
  const hours = m[1] ? Number(m[1]) : 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  if (seconds > 59 || (m[1] !== undefined && minutes > 59)) return undefined;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total >= 1 && total <= LIMITS.durationMaxSec ? total : undefined;
}

/**
 * Formats seconds as "3:45" (or "1:02:30" past an hour).
 *
 * @param seconds length in seconds; null/invalid → ""
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export interface SetTotals {
  songs: number;
  /** Sum of known song lengths, in seconds. */
  seconds: number;
  /** Songs on the list with no length entered, so the total is a floor. */
  songsWithoutLength: number;
}

/**
 * Totals a set: song count and running time. Breaks and notes don't count.
 *
 * @param items builder rows in order
 * @param songsById the band's library keyed by id
 */
export function setTotals(items: readonly BuilderItem[], songsById: ReadonlyMap<string, SongRow>): SetTotals {
  let songs = 0;
  let seconds = 0;
  let songsWithoutLength = 0;
  for (const item of items) {
    if (item.item_type !== 'song' || !item.song_id) continue;
    songs += 1;
    const len = songsById.get(item.song_id)?.duration_sec;
    if (typeof len === 'number' && len > 0) seconds += len;
    else songsWithoutLength += 1;
  }
  return { songs, seconds, songsWithoutLength };
}

export type SetLengthFit = 'none' | 'under' | 'over';

/**
 * Compares the set's running time with the show's booked set length.
 *
 * @param totalSeconds running time from setTotals
 * @param setLengthMin bookings.set_length_min (null when unknown)
 */
export function setLengthFit(totalSeconds: number, setLengthMin: number | null | undefined): SetLengthFit {
  if (!setLengthMin || setLengthMin <= 0) return 'none';
  return totalSeconds > setLengthMin * 60 ? 'over' : 'under';
}

export type PushStatus =
  | { kind: 'draft' }
  | { kind: 'pushed'; version: number; at: string }
  | { kind: 'changed'; version: number; at: string };

/**
 * Whether members have the latest version. Matches publish_set_list(): after a
 * push, updated_at equals published_at; any later edit makes updated_at newer.
 *
 * @param row the set list header
 */
export function pushStatus(row: Pick<SetListRow, 'published_at' | 'published_version' | 'updated_at'>): PushStatus {
  if (!row.published_at || row.published_version < 1) return { kind: 'draft' };
  const changed = Date.parse(row.updated_at) > Date.parse(row.published_at);
  return changed
    ? { kind: 'changed', version: row.published_version, at: row.published_at }
    : { kind: 'pushed', version: row.published_version, at: row.published_at };
}

const clean = (value: string | null | undefined): string | null => {
  const t = (value ?? '').trim();
  return t === '' ? null : t;
};

/**
 * Builds the JSON array save_set_list_items() expects. Order = position.
 * Breaks/notes without text get a sensible label so the row is never rejected.
 *
 * @param items builder rows in display order
 * @throws Error when the list is longer than the database allows
 */
export function toSavePayload(items: readonly BuilderItem[]): SaveItemPayload[] {
  if (items.length > LIMITS.items) {
    throw new Error(`A set list can have at most ${LIMITS.items} rows.`);
  }
  return items.map(item => {
    if (item.item_type === 'song') {
      return {
        item_type: 'song',
        song_id: item.song_id,
        label: null,
        key_override: clean(item.key_override),
        notes: clean(item.notes),
      };
    }
    return {
      item_type: item.item_type,
      song_id: null,
      label: clean(item.label) ?? (item.item_type === 'break' ? 'Break' : 'Note'),
      key_override: null,
      notes: clean(item.notes),
    };
  });
}

/**
 * Song numbers for display: 1, 2, 3… on songs; null on breaks and notes.
 *
 * @param items rows in display order
 * @returns one entry per row, same order
 */
export function songNumbers(items: readonly Pick<BuilderItem, 'item_type'>[]): Array<number | null> {
  return items.reduce<{ n: number; out: Array<number | null> }>((acc, item) => {
    if (item.item_type !== 'song') return { n: acc.n, out: [...acc.out, null] };
    return { n: acc.n + 1, out: [...acc.out, acc.n + 1] };
  }, { n: 0, out: [] }).out;
}

let keyCounter = 0;
/** A client-only id for a new builder row. */
export function newItemKey(): string {
  keyCounter += 1;
  return `row-${Date.now().toString(36)}-${keyCounter}`;
}

/**
 * Converts stored rows into builder rows, in position order.
 *
 * @param rows rows from public.set_list_items
 */
export function itemsFromRows(rows: readonly SetListItemRow[]): BuilderItem[] {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map(r => ({
      key: r.id,
      item_type: r.item_type,
      song_id: r.song_id,
      label: r.label,
      key_override: r.key_override,
      notes: r.notes,
    }));
}

/**
 * Moves one row up or down by one place. Returns the same array when the move
 * would fall off either end, so callers can compare by reference.
 *
 * @param items current rows
 * @param index row to move
 * @param direction -1 up, +1 down
 */
export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): readonly T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

/** Shape of a Supabase/PostgREST error we care about. */
export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
}

/**
 * Turns a database error into a short, specific sentence for the admin.
 * Never shows raw SQL text for errors we don't recognise.
 *
 * @param err error returned by supabase-js
 * @param fallback what to say when the error isn't one we know
 */
export function friendlyDbError(err: DbErrorLike | null | undefined, fallback: string): string {
  if (!err) return fallback;
  const message = err.message ?? '';
  switch (err.code) {
    case '23505':
      if (message.includes('songs_act_title_artist_uniq')) return 'That song is already in your library.';
      if (message.includes('set_lists_one_per_booking')) return 'That show already has a set list. Open it instead.';
      return 'That already exists.';
    case '23514':
      // Our own trigger messages are written for people; the CHECK constraint names are not.
      if (/does not belong|not in this band|cannot be moved|limit reached/i.test(message)) return message;
      return 'One of the fields is too long or out of range.';
    case '23503':
      return 'That song is still on a set list, so it can’t be removed.';
    case '42501':
      return 'Only band admins can change set lists.';
    case 'P0002':
      return 'That set list no longer exists. Refresh the page.';
    case '22023':
      return message || fallback;
    default:
      return fallback;
  }
}
