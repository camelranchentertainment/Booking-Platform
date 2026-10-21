// lib/domain/venueStats.ts
//
// Pure helpers behind the Venues page (pages/venues/index.tsx): the header
// metrics (email coverage, venues that can be enriched), filtering, the
// by-state grouping, and a safe ILIKE pattern for the import duplicate check.
// Unit-tested in __tests__/lib/domain/venueStats.test.ts.

/** The venue fields these helpers read. */
export interface VenueLite {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  email?: string | null;
  website?: string | null;
  music_genres?: string[] | null;
}

/** Placeholder state code for venues saved without one. */
export const NO_STATE = '—';

export interface VenueSummary {
  total: number;
  /** Distinct states (venues without a state are not counted as one). */
  states: number;
  withEmail: number;
  /** No email yet, but a website we can scan for one. */
  canEnrich: number;
  /** No email and no website: needs a hand search. */
  noLead: number;
  /** Share of venues with a booking email, 0–100, rounded. 0 when there are no venues. */
  emailPct: number;
}

const hasText = (v: string | null | undefined): boolean => !!v && v.trim().length > 0;

export function summarizeVenues(venues: ReadonlyArray<VenueLite>): VenueSummary {
  let withEmail = 0;
  let canEnrich = 0;
  let noLead = 0;
  const states = new Set<string>();
  for (const v of venues) {
    if (hasText(v.state)) states.add(v.state!.trim().toUpperCase());
    if (hasText(v.email)) withEmail++;
    else if (hasText(v.website)) canEnrich++;
    else noLead++;
  }
  const total = venues.length;
  return {
    total,
    states: states.size,
    withEmail,
    canEnrich,
    noLead,
    emailPct: total === 0 ? 0 : Math.round((withEmail / total) * 100),
  };
}

/** Venues with a website but no email: the ones "Find emails" will scan. */
export function enrichable<T extends VenueLite>(venues: ReadonlyArray<T>): T[] {
  return venues.filter(v => !hasText(v.email) && hasText(v.website));
}

export interface VenueFilter {
  /** Matches venue name or city, case-insensitive. */
  search: string;
  /** Two-letter state code, or '' for all. */
  state: string;
  /** Exact genre tag, or '' for all. */
  genre: string;
}

export function filterVenues<T extends VenueLite>(venues: ReadonlyArray<T>, f: VenueFilter): T[] {
  const q = f.search.trim().toLowerCase();
  return venues.filter(v => {
    const textOk = !q || v.name.toLowerCase().includes(q) || (v.city ?? '').toLowerCase().includes(q);
    const stateOk = !f.state || v.state === f.state;
    const genreOk = !f.genre || (v.music_genres ?? []).includes(f.genre);
    return textOk && stateOk && genreOk;
  });
}

export interface StateGroup<T> {
  state: string;
  venues: T[];
  emailCount: number;
}

/** Venues grouped by state, states A→Z (the no-state bucket last), venues A→Z by name within each. */
export function groupByState<T extends VenueLite>(venues: ReadonlyArray<T>): StateGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const v of venues) {
    const key = hasText(v.state) ? v.state!.trim() : NO_STATE;
    const list = map.get(key);
    if (list) list.push(v);
    else map.set(key, [v]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === NO_STATE ? 1 : b === NO_STATE ? -1 : a.localeCompare(b)))
    .map(([state, list]) => ({
      state,
      venues: list.slice().sort((a, b) => a.name.localeCompare(b.name)),
      emailCount: list.filter(v => hasText(v.email)).length,
    }));
}

/** Distinct, sorted states and genres for the filter dropdowns. */
export function filterOptions(venues: ReadonlyArray<VenueLite>): { states: string[]; genres: string[] } {
  const states = new Set<string>();
  const genres = new Set<string>();
  for (const v of venues) {
    if (hasText(v.state)) states.add(v.state!);
    for (const g of v.music_genres ?? []) if (hasText(g)) genres.add(g);
  }
  return { states: [...states].sort(), genres: [...genres].sort() };
}

/**
 * Escapes `%`, `_` and `\` so a user-typed value is matched literally by
 * Postgres ILIKE (case-insensitive equality), e.g. for "is this venue already
 * in the database?" checks. Without it, "Bar_None" also matches "BarXNone".
 */
export function ilikeExact(value: string): string {
  return value.replace(/[\\%_]/g, ch => `\\${ch}`);
}
