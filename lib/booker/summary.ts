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

import { commissionProjected, repeatShowIds } from './commission';
import { buildIndex, fuzzyFilter, searchIndex, type SearchIndex } from './fuzzy';
import { addDays, weekendRange } from './dates';
import type { BookerContact, BookerShow, BookerVenue, RosterBand, VenueKind } from './types';

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

  const repeats = repeatShowIds(shows);
  const windowCommission = windowShows.reduce((sum, s) => sum + commissionProjected(s, bandsById.get(s.roster_id), today, repeats.has(s.id)), 0);

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

/** Consecutive shows on the same date, kept in the order given (rows must already be sorted). */
export function groupInOrder<T extends Pick<BookerShow, 'show_date'>>(shows: readonly T[]): Array<{ date: string; shows: T[] }> {
  const groups: Array<{ date: string; shows: T[] }> = [];
  for (const s of shows) {
    const last = groups[groups.length - 1];
    if (last && last.date === s.show_date) last.shows.push(s);
    else groups.push({ date: s.show_date, shows: [s] });
  }
  return groups;
}

// ── Venues ──────────────────────────────────────────────────────────────────

/** One venue card on the Venues page. */
export interface VenueCardData {
  venue: BookerVenue;
  contacts: BookerContact[];
  /** Contacts the agent shows to their bands */
  sharedContacts: number;
  /** Non-cancelled shows at this venue, any date */
  shows: number;
  /** Confirmed or in-play shows dated today or later */
  upcoming: number;
  /** The most recent played or past confirmed show date, if any */
  lastPlayed: string | null;
  /** A booking email on the venue or on any of its contacts */
  hasEmail: boolean;
}

/** Card data for every venue in the book, in the order given (the book is sorted by name). */
export function venueCards(venues: readonly BookerVenue[], contacts: readonly BookerContact[], shows: readonly BookerShow[], today: string): VenueCardData[] {
  const live = shows.filter(isLive);
  return venues
    .filter(v => !v.deleted_at)
    .map(venue => {
      const mine = contacts.filter(c => c.venue_id === venue.id && !c.deleted_at);
      const here = live.filter(s => s.venue_id === venue.id);
      const past = here.filter(s => s.show_date < today && (s.status === 'played' || s.status === 'confirmed')).map(s => s.show_date).sort();
      return {
        venue,
        contacts: mine,
        sharedContacts: mine.filter(c => c.share_with_bands).length,
        shows: here.length,
        upcoming: here.filter(s => s.show_date >= today).length,
        lastPlayed: past.length ? past[past.length - 1] : null,
        hasEmail: Boolean(venue.email) || mine.some(c => Boolean(c.email)),
      };
    });
}

/** Venue-book metrics for the Venues page trackers. */
export interface VenueBookSummary {
  venues: number;
  states: number;
  withEmail: number;
  /** Whole-number percent of venues with a booking email */
  emailPct: number;
  contacts: number;
  sharedContacts: number;
  /** Venues with at least one non-cancelled show */
  bookedAt: number;
  /** Venues with an upcoming show */
  upcomingAt: number;
}

export function venueBookSummary(cards: readonly VenueCardData[]): VenueBookSummary {
  const states = new Set(cards.map(c => (c.venue.state ?? '').trim().toUpperCase()).filter(Boolean));
  const withEmail = cards.filter(c => c.hasEmail).length;
  return {
    venues: cards.length,
    states: states.size,
    withEmail,
    emailPct: cards.length ? Math.round((withEmail / cards.length) * 100) : 0,
    contacts: cards.reduce((n, c) => n + c.contacts.length, 0),
    sharedContacts: cards.reduce((n, c) => n + c.sharedContacts, 0),
    bookedAt: cards.filter(c => c.shows > 0).length,
    upcomingAt: cards.filter(c => c.upcoming > 0).length,
  };
}

/** How many venues of each kind are in the book (kinds with none are left out). */
export function venueKindCounts(cards: readonly VenueCardData[]): Partial<Record<VenueKind, number>> {
  const out: Partial<Record<VenueKind, number>> = {};
  for (const c of cards) out[c.venue.kind] = (out[c.venue.kind] ?? 0) + 1;
  return out;
}

/** The text a venue card is searched by: the venue, its tags and its contacts. */
function venueSearchFields(card: VenueCardData): (string | null | undefined)[] {
  const { venue, contacts } = card;
  return [venue.name, venue.city, venue.state, venue.email, ...(venue.tags ?? []), ...contacts.flatMap(c => [c.name, c.email, c.title])];
}

/** A search index over venue cards; build once per data load. */
export function venueIndex(cards: readonly VenueCardData[]): SearchIndex<VenueCardData> {
  return buildIndex(cards, venueSearchFields);
}

/**
 * Venues matching a search across the venue's name, town, state, email and
 * tags and its contacts' names, titles and emails. Tolerates typos (see
 * lib/booker/fuzzy.ts); best match first. Blank matches all, in order.
 */
export function searchVenues(cards: readonly VenueCardData[], query: string): VenueCardData[] {
  return searchIndex(venueIndex(cards), query);
}

/**
 * The contact a search found when the venue's own details did not match, so
 * the card can say who matched. Null when the venue itself matched.
 */
export function matchedContactName(card: VenueCardData, query: string): string | null {
  if (!query.trim()) return null;
  const { venue } = card;
  if (fuzzyFilter([venue], query, v => [v.name, v.city, v.state, v.email, ...(v.tags ?? [])]).length > 0) return null;
  return fuzzyFilter(card.contacts, query, c => [c.name, c.email, c.title])[0]?.name ?? null;
}

/** Capacity bands for the venue filter. */
export const VENUE_SIZES = [
  { key: 'small', label: 'Up to 150', min: 0, max: 150 },
  { key: 'mid', label: '151–500', min: 151, max: 500 },
  { key: 'large', label: '501–1,500', min: 501, max: 1500 },
  { key: 'xl', label: '1,500+', min: 1501, max: Number.POSITIVE_INFINITY },
] as const;
export type VenueSize = (typeof VENUE_SIZES)[number]['key'];

export interface VenueFilters {
  /** Every one of these tags must be on the venue */
  tags?: readonly string[];
  /** Two-letter or full state, matched case-insensitively */
  state?: string;
  size?: VenueSize | '';
}

/** Venue cards passing every filter that is set. A size filter leaves out venues with no capacity. */
export function filterVenueCards(cards: readonly VenueCardData[], filters: VenueFilters): VenueCardData[] {
  const tags = filters.tags ?? [];
  const state = filters.state?.trim().toUpperCase() ?? '';
  const size = filters.size ? VENUE_SIZES.find(z => z.key === filters.size) : undefined;
  return cards.filter(({ venue }) => {
    if (tags.length && !tags.every(t => (venue.tags ?? []).includes(t))) return false;
    if (state && (venue.state ?? '').trim().toUpperCase() !== state) return false;
    if (size && (venue.capacity === null || venue.capacity < size.min || venue.capacity > size.max)) return false;
    return true;
  });
}

/** States in the book, A–Z, for the state filter. */
export function venueStates(cards: readonly VenueCardData[]): string[] {
  return Array.from(new Set(cards.map(c => (c.venue.state ?? '').trim().toUpperCase()).filter(Boolean))).sort();
}
