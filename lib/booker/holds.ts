// lib/booker/holds.ts
// Real holds for the Booking Agent workspace (build list item 2). Pure
// functions, no I/O, unit-tested.
//
// How holds work in live booking: a venue pencils an act in for a date in
// ranked order — the 1st hold has the date, a 2nd hold is next in line. A hold
// usually lasts until a date the venue sets (hold_expires_on). When another
// act wants the date, the venue "challenges" the 1st hold: the agent must
// confirm or release by a deadline (answer_by).
//
// Only live shows that are still a hold or pending offer carry hold fields;
// once a show is confirmed, played or cancelled they no longer apply.

import { addDays, formatShowDate } from './dates';
import type { BookerShow } from './types';

/** Days ahead that make an expiring hold or a challenge deadline "soon". */
export const HOLD_EXPIRY_WARN_DAYS = 3;
export const CHALLENGE_WARN_DAYS = 2;

type HoldFields = Pick<BookerShow, 'status' | 'deleted_at' | 'hold_rank' | 'hold_expires_on' | 'answer_by'>;

/** A live hold or pending offer: the only shows hold fields apply to. */
export function isOpenHold(s: Pick<BookerShow, 'status' | 'deleted_at'>): boolean {
  return !s.deleted_at && (s.status === 'hold' || s.status === 'pending');
}

/** "1st hold", "2nd hold", "3rd hold", "4th hold"… */
export function holdLabel(rank: number | null | undefined): string | null {
  if (!rank || rank < 1) return null;
  const mod100 = rank % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : rank % 10 === 1 ? 'st' : rank % 10 === 2 ? 'nd' : rank % 10 === 3 ? 'rd' : 'th';
  return `${rank}${suffix} hold`;
}

export type HoldUrgency = 'overdue' | 'due' | 'soon';

/** How pressing a hold is right now, and why, or null when nothing is pressing. */
export interface HoldStatus {
  urgency: HoldUrgency;
  /** "challenge" (answer-by deadline) or "expiry" (the hold lapses) */
  reason: 'challenge' | 'expiry';
  /** The deadline driving it */
  date: string;
}

/**
 * The most pressing deadline on an open hold. A challenge outranks an expiry
 * because another act is waiting on the date.
 *   overdue: the deadline has passed
 *   due:     the deadline is today
 *   soon:    within CHALLENGE_WARN_DAYS / HOLD_EXPIRY_WARN_DAYS
 */
export function holdStatus(s: HoldFields, today: string): HoldStatus | null {
  if (!isOpenHold(s)) return null;
  const rate = (date: string | null, warnDays: number): HoldUrgency | null => {
    if (!date) return null;
    if (date < today) return 'overdue';
    if (date === today) return 'due';
    return date <= addDays(today, warnDays) ? 'soon' : null;
  };
  const challenge = rate(s.answer_by, CHALLENGE_WARN_DAYS);
  if (challenge) return { urgency: challenge, reason: 'challenge', date: s.answer_by! };
  const expiry = rate(s.hold_expires_on, HOLD_EXPIRY_WARN_DAYS);
  if (expiry) return { urgency: expiry, reason: 'expiry', date: s.hold_expires_on! };
  return null;
}

/** One line for an alert: "Answer by Fri, Oct 23 — the venue challenged this hold". */
export function holdStatusText(st: HoldStatus, year?: number): string {
  const when = formatShowDate(st.date, year);
  if (st.reason === 'challenge') {
    return st.urgency === 'overdue' ? `Challenge answer was due ${when}` : st.urgency === 'due' ? 'Challenge answer due today' : `Answer the challenge by ${when}`;
  }
  return st.urgency === 'overdue' ? `Hold expired ${when}` : st.urgency === 'due' ? 'Hold expires today' : `Hold expires ${when}`;
}

/** Short chip text for a show row: "Answer by Fri, Oct 23", "Expires today"… */
export function holdChipText(st: HoldStatus, year?: number): string {
  const when = formatShowDate(st.date, year);
  if (st.reason === 'challenge') return st.urgency === 'overdue' ? 'Answer overdue' : st.urgency === 'due' ? 'Answer today' : `Answer by ${when}`;
  return st.urgency === 'overdue' ? 'Hold expired' : st.urgency === 'due' ? 'Expires today' : `Expires ${when}`;
}

const URGENCY_ORDER: Record<HoldUrgency, number> = { overdue: 0, due: 1, soon: 2 };

/**
 * Upcoming open holds and offers, most urgent first: pressing deadlines in
 * urgency then date order, then the rest by show date. Past-dated holds are
 * left to the "stale hold" alert instead.
 */
export function holdsByUrgency<T extends HoldFields & Pick<BookerShow, 'show_date'>>(shows: readonly T[], today: string): T[] {
  return shows
    .filter(s => isOpenHold(s) && s.show_date >= today)
    .map(s => ({ s, st: holdStatus(s, today) }))
    .sort((a, b) => {
      if (a.st && b.st) return URGENCY_ORDER[a.st.urgency] - URGENCY_ORDER[b.st.urgency] || a.st.date.localeCompare(b.st.date) || a.s.show_date.localeCompare(b.s.show_date);
      if (a.st) return -1;
      if (b.st) return 1;
      return a.s.show_date.localeCompare(b.s.show_date) || (a.s.hold_rank ?? 99) - (b.s.hold_rank ?? 99);
    })
    .map(x => x.s);
}

/** Counts for the Holds tracker: open upcoming holds, challenged, and expiring soon (or lapsed). */
export function holdCounts(shows: readonly (HoldFields & Pick<BookerShow, 'show_date'>)[], today: string): { open: number; challenged: number; expiring: number } {
  const open = shows.filter(s => isOpenHold(s) && s.show_date >= today);
  let challenged = 0;
  let expiring = 0;
  for (const s of open) {
    const st = holdStatus(s, today);
    if (s.answer_by) challenged += 1;
    if (st?.reason === 'expiry') expiring += 1;
  }
  return { open: open.length, challenged, expiring };
}

type ClashShow = Pick<BookerShow, 'id' | 'roster_id' | 'venue_id' | 'venue_name' | 'show_date' | 'status' | 'deleted_at' | 'hold_rank'>;

/** Same venue on the same date: a saved venue by id, a typed venue by name (case-insensitive). */
function sameVenue(a: Pick<BookerShow, 'venue_id' | 'venue_name'>, b: Pick<BookerShow, 'venue_id' | 'venue_name'>): boolean {
  if (a.venue_id || b.venue_id) return Boolean(a.venue_id) && a.venue_id === b.venue_id;
  const an = a.venue_name?.trim().toLowerCase();
  return Boolean(an) && an === b.venue_name?.trim().toLowerCase();
}

/**
 * Other bands of this agent's with a live show (hold, pending or confirmed) at
 * the same venue on the same date — the agent is competing with themself.
 */
export function venueClashes<T extends ClashShow>(
  shows: readonly T[],
  draft: Pick<BookerShow, 'roster_id' | 'venue_id' | 'venue_name' | 'show_date'>,
  excludeId?: string,
): T[] {
  if (!draft.show_date || (!draft.venue_id && !draft.venue_name?.trim())) return [];
  return shows.filter(
    s =>
      s.id !== excludeId &&
      !s.deleted_at &&
      s.status !== 'cancelled' &&
      s.status !== 'played' &&
      s.show_date === draft.show_date &&
      s.roster_id !== draft.roster_id &&
      sameVenue(s, draft),
  );
}

/** A clash between two of the agent's own shows, for the Needs attention list. */
export interface HoldClash {
  date: string;
  /** The shows involved, sorted by hold rank then id */
  showIds: string[];
  rosterIds: string[];
  /** Two or more of them claim the same hold position (e.g. both "1st hold") */
  sameRank: boolean;
}

/**
 * Upcoming dates where two or more of the agent's bands hold or are booked at
 * the same venue. Each clash appears once.
 */
export function findHoldClashes<T extends ClashShow>(shows: readonly T[], today: string): HoldClash[] {
  const live = shows.filter(s => !s.deleted_at && s.show_date >= today && (s.status === 'hold' || s.status === 'pending' || s.status === 'confirmed'));
  const groups = new Map<string, T[]>();
  for (const s of live) {
    const place = s.venue_id ? `id:${s.venue_id}` : s.venue_name?.trim() ? `name:${s.venue_name.trim().toLowerCase()}` : null;
    if (!place) continue;
    const key = `${s.show_date}|${place}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const out: HoldClash[] = [];
  for (const group of groups.values()) {
    const bands = new Set(group.map(s => s.roster_id));
    if (bands.size < 2) continue;
    const sorted = [...group].sort((a, b) => (a.hold_rank ?? 99) - (b.hold_rank ?? 99) || a.id.localeCompare(b.id));
    const ranks = sorted.map(s => s.hold_rank).filter((r): r is number => r !== null && r !== undefined);
    out.push({
      date: sorted[0].show_date,
      showIds: sorted.map(s => s.id),
      rosterIds: [...bands],
      sameRank: new Set(ranks).size < ranks.length,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
