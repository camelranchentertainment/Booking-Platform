// lib/booker/venueSearch.ts
// Pure helpers for the agent's venue search (components/booker/VenueSearchPanel)
// and the venue picker in the show form. Kept free of React so they are unit-tested.

import type { BookerVenue } from './types';

/** Offered as suggestions in the search; the field accepts any text (a venue's name works too). */
export const SEARCH_SUGGESTIONS = ['dance hall', 'saloon', 'honky tonk', 'winery', 'brewery', 'listening room', 'amphitheater', 'festival', 'county fair'] as const;

/**
 * Checks the two required search fields.
 *
 * @returns a message naming what is missing, or null when both are filled
 */
export function searchInputError(city: string, state: string): string | null {
  const hasCity = city.trim() !== '';
  const hasState = state.trim() !== '';
  if (!hasCity && !hasState) return 'Enter a city and state to search.';
  if (!hasCity) return 'Enter a city to search.';
  if (!hasState) return 'Enter a state to search.';
  return null;
}

/**
 * Saved venues plus any added while a dialog is open, without duplicate ids.
 * Returns `saved` unchanged (same reference) when nothing new was added, so
 * the picker's order matches the venue book; otherwise sorted by name.
 */
export function mergeVenues(saved: BookerVenue[], added: BookerVenue[]): BookerVenue[] {
  const ids = new Set(saved.map(v => v.id));
  const extra = added.filter(v => !ids.has(v.id));
  if (extra.length === 0) return saved;
  return [...saved, ...extra].sort((a, b) => a.name.localeCompare(b.name));
}
