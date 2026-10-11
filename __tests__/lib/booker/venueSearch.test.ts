// __tests__/lib/booker/venueSearch.test.ts
import { mergeVenues, searchInputError } from '../../../lib/booker/venueSearch';
import type { BookerVenue } from '../../../lib/booker/types';

function venue(id: string, name: string): BookerVenue {
  return {
    id,
    booker_id: 'b1',
    name,
    address: null,
    city: null,
    state: null,
    postal_code: null,
    capacity: null,
    website: null,
    notes: null,
    kind: 'venue',
    place_id: null,
    email: null,
    phone: null,
    last_scanned_at: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
  };
}

describe('searchInputError', () => {
  it('passes when city and state are filled', () => {
    expect(searchInputError('New Braunfels', 'TX')).toBeNull();
  });
  it('names both when both are blank or whitespace', () => {
    expect(searchInputError('  ', '')).toBe('Enter a city and state to search.');
  });
  it('names the city when only the city is missing', () => {
    expect(searchInputError('', 'TX')).toBe('Enter a city to search.');
  });
  it('names the state when only the state is missing', () => {
    expect(searchInputError('Austin', ' ')).toBe('Enter a state to search.');
  });
});

describe('mergeVenues', () => {
  const saved = [venue('a', 'Broken Spoke'), venue('c', 'Gruene Hall')];

  it('returns the saved list itself when nothing was added', () => {
    expect(mergeVenues(saved, [])).toBe(saved);
  });
  it('ignores added venues that are already saved', () => {
    expect(mergeVenues(saved, [venue('a', 'Broken Spoke')])).toBe(saved);
  });
  it('adds new venues and keeps the list in name order', () => {
    const merged = mergeVenues(saved, [venue('b', 'Cheatham Street Warehouse')]);
    expect(merged.map(v => v.id)).toEqual(['a', 'b', 'c']);
  });
  it('does not mutate the saved list', () => {
    mergeVenues(saved, [venue('z', 'Arkey Blue')]);
    expect(saved.map(v => v.id)).toEqual(['a', 'c']);
  });
});
