// lib/booker/summary.ts
// Counting for the Booking Agent workspace's Tours-style pages (Home, Bands,
// Shows): the hero summary line, the four metric trackers, the band cards and
// the Upcoming / Past / All tabs. Pure functions, no I/O; the pages only load
// rows and render what these return.
//
// Status rules shared with lib/booker/workspace.ts and commission.ts:
//   * "Booked" = confirmed. Holds and pending are "in play", never booked.
//   * Cancelled shows are never counted anywhere.
//   * Archived rows (deleted_at set) are ignored.

import { commissionProjected } from './commission';
import { addDays, weekendRange } from './dates';
import type { BookerShow, RosterBand } from './types';

/** Upcoming = dated today or later; Past = before today. */
export type ShowTab = 'upcoming' | 'past' | 'all';
/** Which bands a roster view shows. */
export type RosterTab = 'active' | 'inactive' | 'all';

const isLive = (s: Pick<BookerShow, 'deleted_at' | 'status'>): boolean => !s.deleted_at && s.status !== 'cancelled';
const isInPlay = (s: Pick<BookerShow, 'status'>): boolean => s.status === 'hold' || s.status === 'pending';

/** Everything the agent Home hero and metric trackers show. */
export interface DeskSummary {
  /** Active, non-archived bands on the roster */
  activeBands: number;
  /** Confirmed shows Friday–Sunday of the current weekend */
  weekendConfirmed: number;
  /** Distinct bands playing those weekend shows */
  weekendBands: number;
  /** Confirmed shows from today through the window */
  windowConfirmed: number;
  /** Commission expected from those confirmed shows */
  windowCommission: number;
  /** Holds and pending offers dated today or later */
  holds: number;
  /** Of those, how many have a follow-up date that is today or overdue */
  holdsFollowupDue: number;
  /** The next confirmed show from today on, if any */
  nextShow: BookerShow | null;
}

/**
 * Summarises the agent's whole roster for the Home page.
 *
 * @param windowDays how far ahead "coming up" looks (the Home agenda window)
 */
export function deskSummary(bands: readonly RosterBand[], shows: readonly BookerShow[], today: string, windowDays: number): DeskSummary {
  const active = bands.filter(b => b.status === 'active' && !b.deleted_at);
  const bandsById = new Map(bands.map(b => [b.id, b]));
  const live = shows.filter(isLive);
  const weekend = weekendRange(today);
  const windowEnd = addDays(today, windowDays);

  const weekendShows = live.filter(s => s.status === 'confirmed' && s.show_date >= weekend.start && s.show_date <= weekend.end);
  const windowShows = live
    .filter(s => s.status === 'confirmed' && s.show_date >= today && s.show_date <= windowEnd)
    .sort((a, b) => a.show_date.localeCompare(b.show_date));
  const holds = live.filter(s => isInPlay(s) && s.show_date >= today);

  const windowCommission = windowShows.reduce((sum, s) => sum + commissionProjected(s, bandsById.get(s.roster_id), today), 0);

  return {
    activeBands: active.length,
    weekendConfirmed: weekendShows.length,
    weekendBands: new Set(weekendShows.map(s => s.roster_id)).size,
    windowConfirmed: windowShows.length,
    windowCommission: Math.round(windowCommission * 100) / 100,
    holds: holds.length,
    holdsFollowupDue: holds.filter(s => s.followup_on !== null && s.followup_on <= today).length,
    nextShow: live.filter(s => s.status === 'confirmed' && s.show_date >= today).sort((a, b) => a.show_date.localeCompare(b.show_date))[0] ?? null,
  };
}

/** One band card on the Home and Bands pages. */
export interface BandCardData {
  band: RosterBand;
  /** The next confirmed show, or failing that the next hold/pending */
  nextShow: BookerShow | null;
  /** Confirmed shows today or later */
  booked: number;
  /** Holds and pending offers today or later */
  holds: number;
  /** Shows marked played (all time) */
  played: number;
  /** Active band with no commission rate: commission can't be tracked */
  needsRate: boolean;
}

/** Card data for every non-archived band, in roster order (active first, then by name). */
export function bandCards(bands: readonly RosterBand[], shows: readonly BookerShow[], today: string): BandCardData[] {
  const live = shows.filter(isLive);
  return bands
    .filter(b => !b.deleted_at)
    .slice()
    .sort((a, b) => (a.status === b.status ? a.band_name.localeCompare(b.band_name) : a.status === 'active' ? -1 : 1))
    .map(band => {
      const mine = live.filter(s => s.roster_id === band.id);
      const upcoming = mine.filter(s => s.show_date >= today).sort((a, b) => a.show_date.localeCompare(b.show_date));
      return {
        band,
        nextShow: upcoming.find(s => s.status === 'confirmed') ?? upcoming.find(isInPlay) ?? null,
        booked: upcoming.filter(s => s.status === 'confirmed').length,
        holds: upcoming.filter(isInPlay).length,
        played: mine.filter(s => s.status === 'played').length,
        needsRate: band.status === 'active' && band.commission_pct === null,
      };
    });
}

/** Bands for a roster tab. */
export function bandsForTab(cards: readonly BandCardData[], tab: RosterTab): BandCardData[] {
  if (tab === 'all') return [...cards];
  return cards.filter(c => c.band.status === tab);
}

/** How many bands each roster tab holds. */
export function rosterTabCounts(cards: readonly BandCardData[]): Record<RosterTab, number> {
  const active = cards.filter(c => c.band.status === 'active').length;
  return { active, inactive: cards.length - active, all: cards.length };
}

/** Roster metrics for the Bands page trackers. */
export interface RosterSummary {
  activeBands: number;
  booked: number;
  holds: number;
  /** Active bands with no commission rate */
  needsRate: number;
  /** Active bands with nothing confirmed or in play from today on */
  idleBands: number;
}

export function rosterSummary(cards: readonly BandCardData[]): RosterSummary {
  const active = cards.filter(c => c.band.status === 'active');
  return {
    activeBands: active.length,
    booked: active.reduce((n, c) => n + c.booked, 0),
    holds: active.reduce((n, c) => n + c.holds, 0),
    needsRate: active.filter(c => c.needsRate).length,
    idleBands: active.filter(c => c.booked === 0 && c.holds === 0).length,
  };
}

/**
 * Shows for a time tab. Upcoming runs soonest first; Past and All run most
 * recent first. Archived rows are always dropped; cancelled rows are kept so
 * the agent can still find and reopen them (the Shows page marks them).
 */
export function showsForTab<T extends Pick<BookerShow, 'show_date' | 'deleted_at'>>(shows: readonly T[], tab: ShowTab, today: string): T[] {
  const kept = shows.filter(s => !s.deleted_at);
  if (tab === 'upcoming') return kept.filter(s => s.show_date >= today).sort((a, b) => a.show_date.localeCompare(b.show_date));
  const pool = tab === 'past' ? kept.filter(s => s.show_date < today) : kept;
  return pool.sort((a, b) => b.show_date.localeCompare(a.show_date));
}

/** How many shows each time tab holds (archived rows excluded). */
export function showTabCounts(shows: readonly Pick<BookerShow, 'show_date' | 'deleted_at'>[], today: string): Record<ShowTab, number> {
  const kept = shows.filter(s => !s.deleted_at);
  const upcoming = kept.filter(s => s.show_date >= today).length;
  return { upcoming, past: kept.length - upcoming, all: kept.length };
}

/** Metrics for the Shows page trackers. */
export interface ShowsSummary {
  /** Confirmed, today or later */
  booked: number;
  /** Hold or pending, today or later */
  inPlay: number;
  /** Confirmed shows already past: waiting to be marked played */
  toSettle: number;
  /** Played this calendar year */
  playedThisYear: number;
}

export function showsSummary(shows: readonly BookerShow[], today: string): ShowsSummary {
  const live = shows.filter(isLive);
  const year = today.slice(0, 4);
  return {
    booked: live.filter(s => s.status === 'confirmed' && s.show_date >= today).length,
    inPlay: live.filter(s => isInPlay(s) && s.show_date >= today).length,
    toSettle: live.filter(s => s.status === 'confirmed' && s.show_date < today).length,
    playedThisYear: live.filter(s => s.status === 'played' && s.show_date.slice(0, 4) === year).length,
  };
}

/** "1 band", "3 shows" — count with the right noun. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
