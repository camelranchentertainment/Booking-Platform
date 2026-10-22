// __tests__/lib/booker/tags.test.ts
// Venue tags (build list item 6): cleaning to the database rule, the venue
// form's schema, counts for the filter chips, filtering the book, and the
// assistant never wiping tags.

import { buildWrite, type WorkspaceRows } from '../../../lib/booker/assistantApply';
import { VenueSchema, fieldErrors } from '../../../lib/booker/schemas';
import { filterVenueCards, matchedContactName, searchVenues, venueCards, venueStates } from '../../../lib/booker/summary';
import { MAX_TAGS, normalizeTag, parseTags, tagCounts, tagsToText } from '../../../lib/booker/tags';
import type { BookerContact, BookerVenue } from '../../../lib/booker/types';

const ts = { created_at: '', updated_at: '', deleted_at: null };
const venue = (over: Partial<BookerVenue> = {}): BookerVenue => ({
  id: 'v1', booker_id: 'k', name: 'Gruene Hall', address: null, city: 'New Braunfels', state: 'TX', postal_code: null, capacity: 800,
  website: null, notes: null, kind: 'venue', place_id: null, email: null, phone: null, last_scanned_at: null, tags: [], ...ts, ...over,
});
const contact = (over: Partial<BookerContact> = {}): BookerContact => ({
  id: 'c1', booker_id: 'k', venue_id: 'v1', name: 'Sarah Lee', title: 'Talent buyer', email: 'sarah@gruenehall.com', phone: null, notes: null,
  share_with_bands: false, source: 'manual', ...ts, ...over,
});

describe('normalizeTag and parseTags', () => {
  it('cleans to the stored form: lower-case, single spaces, no commas, 40 characters', () => {
    expect(normalizeTag('  Dance   HALL ')).toBe('dance hall');
    expect(normalizeTag('x'.repeat(50))).toHaveLength(40);
    expect(normalizeTag('   ')).toBe('');
  });
  it('splits form text on commas, drops blanks and repeats, keeps first order', () => {
    expect(parseTags('Dance Hall, all ages,, dance hall , 21+')).toEqual(['dance hall', 'all ages', '21+']);
    expect(parseTags(['B', 'a', 'b', 7])).toEqual(['b', 'a']);
    expect(parseTags(undefined)).toEqual([]);
    expect(tagsToText(['a', 'b c'])).toBe('a, b c');
    expect(tagsToText(null)).toBe('');
  });
});

describe('VenueSchema tags', () => {
  it('parses the form text into clean tags', () => {
    expect(VenueSchema.parse({ name: 'X', tags: 'Dance Hall, all ages' }).tags).toEqual(['dance hall', 'all ages']);
    expect(VenueSchema.parse({ name: 'X', tags: '' }).tags).toEqual([]);
  });
  it('leaves tags out when they are not sent, so other writers never wipe them', () => {
    expect('tags' in VenueSchema.parse({ name: 'X' })).toBe(false);
  });
  it('refuses more than the limit with a clear message', () => {
    const r = VenueSchema.safeParse({ name: 'X', tags: Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`).join(',') });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).tags).toMatch(/up to 20/i);
  });
});

describe('the assistant and tags', () => {
  it('editing a venue never sends tags, so they stay as they are', () => {
    const rows: WorkspaceRows = { bands: [], venues: [venue({ tags: ['dance hall'] })], shows: [], contacts: [] };
    const r = buildWrite({ type: 'update_venue', venue_id: 'v1', changes: { capacity: 900 }, reason: 'x' }, rows);
    expect(r.ok).toBe(true);
    if (r.ok && r.write.op === 'updateVenue') {
      expect(r.write.input.capacity).toBe(900);
      expect('tags' in r.write.input).toBe(false);
    }
  });
});

describe('tag counts, filters and search', () => {
  const venues = [
    venue({ id: 'v1', tags: ['dance hall', 'all ages'], capacity: 800 }),
    venue({ id: 'v2', name: 'Saxon Pub', city: 'Austin', tags: ['listening room'], capacity: 150 }),
    venue({ id: 'v3', name: "Cain's Ballroom", city: 'Tulsa', state: 'ok', tags: ['dance hall'], capacity: 1700 }),
    venue({ id: 'v4', name: 'No Size', city: 'Waco', capacity: null }),
    venue({ id: 'gone', tags: ['dance hall'], deleted_at: '2026-01-01' }),
  ];
  const cards = venueCards(venues, [contact({ venue_id: 'v2', name: 'Mike Ray', email: null })], [], '2026-10-21');
  const ids = (cs: { venue: { id: string } }[]) => cs.map(c => c.venue.id);

  it('counts tags across live venues, most used first', () => {
    expect(tagCounts(venues)).toEqual([
      { tag: 'dance hall', count: 2 },
      { tag: 'all ages', count: 1 },
      { tag: 'listening room', count: 1 },
    ]);
  });

  it('filters by every tag picked, by state, and by size', () => {
    expect(ids(filterVenueCards(cards, { tags: ['dance hall'] }))).toEqual(['v1', 'v3']);
    expect(ids(filterVenueCards(cards, { tags: ['dance hall', 'all ages'] }))).toEqual(['v1']);
    expect(ids(filterVenueCards(cards, { state: 'OK' }))).toEqual(['v3']);
    expect(ids(filterVenueCards(cards, { size: 'small' }))).toEqual(['v2']);
    expect(ids(filterVenueCards(cards, { size: 'xl' }))).toEqual(['v3']);
    expect(ids(filterVenueCards(cards, { size: 'mid', tags: ['dance hall'] }))).toEqual([]);
    expect(ids(filterVenueCards(cards, {}))).toEqual(['v1', 'v2', 'v3', 'v4']);
    expect(venueStates(cards)).toEqual(['OK', 'TX']);
  });

  it('searches tags and contacts with typos, and says which contact matched', () => {
    expect(ids(searchVenues(cards, 'listning room'))).toEqual(['v2']);
    expect(ids(searchVenues(cards, 'mike ray'))).toEqual(['v2']);
    const saxon = cards.find(c => c.venue.id === 'v2');
    expect(saxon && matchedContactName(saxon, 'mikee')).toBe('Mike Ray');
    expect(saxon && matchedContactName(saxon, 'saxon')).toBeNull();
    expect(saxon && matchedContactName(saxon, '')).toBeNull();
  });
});
