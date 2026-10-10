// lib/booker/workspace.ts
// Pure helpers that combine the agent's rows for display: lookups, venue labels,
// grouping by date and the "needs attention" list. No I/O, so they are unit-tested.

import type { BookerShow, BookerVenue, RosterBand } from './types';
import { commissionDue } from './commission';
import { formatShowDate } from './dates';

export function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map(r => [r.id, r]));
}

/** "Venue — City" from the saved venue, or the free-text fallback on the show. */
export function venueLabel(show: Pick<BookerShow, 'venue_id' | 'venue_name' | 'venue_city'>, venuesById: ReadonlyMap<string, Pick<BookerVenue, 'name' | 'city'>>): string {
  const saved = show.venue_id ? venuesById.get(show.venue_id) : undefined;
  const name = saved?.name ?? show.venue_name ?? 'Venue not set';
  const city = saved ? saved.city : show.venue_city;
  return city ? `${name} — ${city}` : name;
}

/** Shows grouped by date, dates in ascending order, cancelled shows left out. */
export function groupByDate<T extends Pick<BookerShow, 'show_date' | 'status'>>(shows: readonly T[]): Array<{ date: string; shows: T[] }> {
  const groups = new Map<string, T[]>();
  for (const s of shows) {
    if (s.status === 'cancelled') continue;
    const list = groups.get(s.show_date) ?? [];
    list.push(s);
    groups.set(s.show_date, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({ date, shows: list }));
}

/** Other non-cancelled shows for the same band on the same date (possible double-booking). */
export function findConflicts(shows: readonly BookerShow[], rosterId: string, date: string, excludeId?: string): BookerShow[] {
  return shows.filter(s => s.roster_id === rosterId && s.show_date === date && s.status !== 'cancelled' && s.id !== excludeId && !s.deleted_at);
}

export type AttentionKind = 'followup_due' | 'stale_hold' | 'needs_settling' | 'band_without_rate';

export interface AttentionItem {
  kind: AttentionKind;
  /** Stable key for React lists */
  key: string;
  message: string;
  showId?: string;
  rosterId?: string;
}

/**
 * What the agent should look at today, most urgent first:
 *   1. follow-ups due today or overdue (on holds/pending)
 *   2. holds/pending whose date has passed without being confirmed or cancelled
 *   3. confirmed shows in the past that still need marking played
 *   4. active bands with no commission rate set
 */
export function attentionItems(
  shows: readonly BookerShow[],
  bands: readonly RosterBand[],
  venuesById: ReadonlyMap<string, BookerVenue>,
  today: string,
): AttentionItem[] {
  const bandsById = byId(bands);
  const name = (s: BookerShow) => bandsById.get(s.roster_id)?.band_name ?? 'Unknown band';
  const items: AttentionItem[] = [];
  const open = shows.filter(s => !s.deleted_at);

  for (const s of open) {
    if ((s.status === 'hold' || s.status === 'pending') && s.followup_on && s.followup_on <= today) {
      items.push({ kind: 'followup_due', key: `f-${s.id}`, showId: s.id, message: `Follow up: ${name(s)} at ${venueLabel(s, venuesById)}` });
    }
  }
  for (const s of open) {
    if ((s.status === 'hold' || s.status === 'pending') && s.show_date < today) {
      items.push({ kind: 'stale_hold', key: `h-${s.id}`, showId: s.id, message: `${name(s)} on ${formatShowDate(s.show_date)} is still a ${s.status} — confirm or cancel it` });
    }
  }
  for (const s of open) {
    if (s.status === 'confirmed' && s.show_date < today) {
      items.push({ kind: 'needs_settling', key: `p-${s.id}`, showId: s.id, message: `${name(s)} at ${venueLabel(s, venuesById)} on ${formatShowDate(s.show_date)} — mark it Played to track commission` });
    }
  }
  for (const b of bands) {
    if (b.status === 'active' && !b.deleted_at && b.commission_pct === null) {
      items.push({ kind: 'band_without_rate', key: `r-${b.id}`, rosterId: b.id, message: `${b.band_name} has no commission rate set` });
    }
  }
  return items;
}

/** Per-band summary for the home tiles. */
export interface BandTileSummary {
  band: RosterBand;
  nextShow: BookerShow | null;
  upcomingCount: number;
  holdCount: number;
}

export function bandTiles(bands: readonly RosterBand[], shows: readonly BookerShow[], today: string): BandTileSummary[] {
  return bands
    .filter(b => b.status === 'active' && !b.deleted_at)
    .map(band => {
      const upcoming = shows
        .filter(s => s.roster_id === band.id && !s.deleted_at && s.show_date >= today && s.status !== 'cancelled')
        .sort((a, b) => a.show_date.localeCompare(b.show_date));
      return {
        band,
        nextShow: upcoming.find(s => s.status === 'confirmed') ?? upcoming[0] ?? null,
        upcomingCount: upcoming.filter(s => s.status === 'confirmed').length,
        holdCount: upcoming.filter(s => s.status === 'hold' || s.status === 'pending').length,
      };
    });
}

/** Played shows still owed commission, as options for the payment form. */
export function payableShows(
  shows: readonly BookerShow[],
  bandsById: ReadonlyMap<string, RosterBand>,
  venuesById: ReadonlyMap<string, BookerVenue>,
): Array<{ id: string; label: string; due: number }> {
  return shows
    .filter(s => s.status === 'played' && !s.deleted_at)
    .sort((a, b) => b.show_date.localeCompare(a.show_date))
    .map(s => {
      const band = bandsById.get(s.roster_id);
      return { id: s.id, label: `${formatShowDate(s.show_date)} · ${band?.band_name ?? 'Unknown band'} · ${venueLabel(s, venuesById)}`, due: commissionDue(s, band) };
    });
}
