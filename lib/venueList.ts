// lib/venueList.ts
//
// Keeps a page's in-memory venue list in step with a venue saved elsewhere on
// the page (the VenueDrawer), so the list never shows stale details after a
// save and the user doesn't need to reload the browser.

/** The only fields the merge relies on; any venue row type with these works. */
export interface ListedVenue {
  id: string;
  name?: string | null;
}

/**
 * Replace the saved venue in the list (matched by id) with its saved values,
 * keeping the list sorted by name, as /api/venues/list returns it. A venue that
 * isn't in the list is left out: the list's own query decides what belongs there.
 * Returns a new array; the input is not modified.
 */
export function mergeSavedVenue<T extends ListedVenue>(list: T[], saved: Partial<T> & { id: string }): T[] {
  if (!list.some(v => v.id === saved.id)) return list;
  return list
    .map(v => (v.id === saved.id ? { ...v, ...saved } : v))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}
