// __tests__/lib/domain/venueStats.test.ts
import {
  NO_STATE, summarizeVenues, enrichable, filterVenues, groupByState, filterOptions, ilikeExact,
  type VenueLite,
} from '../../../lib/domain/venueStats';

const v = (id: string, over: Partial<VenueLite> = {}): VenueLite => ({
  id, name: `Venue ${id}`, city: 'Austin', state: 'TX', email: null, website: null, music_genres: null, ...over,
});

describe('summarizeVenues', () => {
  it('splits venues into email / can-enrich / no-lead', () => {
    const s = summarizeVenues([
      v('a', { email: 'book@a.com' }),
      v('b', { website: 'https://b.com' }),
      v('c', { website: '  ' }),
      v('d', { state: 'OK', email: 'x@d.com', website: 'https://d.com' }),
    ]);
    expect(s).toEqual({ total: 4, states: 2, withEmail: 2, canEnrich: 1, noLead: 1, emailPct: 50 });
  });
  it('is all zeros for an empty list', () => {
    expect(summarizeVenues([])).toEqual({ total: 0, states: 0, withEmail: 0, canEnrich: 0, noLead: 0, emailPct: 0 });
  });
  it('does not count a missing state as a state', () => {
    expect(summarizeVenues([v('a', { state: null }), v('b', { state: '' })]).states).toBe(0);
  });
});

describe('enrichable', () => {
  it('keeps only venues with a website and no email', () => {
    const list = [v('a', { website: 'w' }), v('b', { website: 'w', email: 'e' }), v('c')];
    expect(enrichable(list).map(x => x.id)).toEqual(['a']);
  });
});

describe('filterVenues', () => {
  const list = [
    v('a', { name: 'The Blue Door', city: 'Oklahoma City', state: 'OK', music_genres: ['Folk'] }),
    v('b', { name: 'Cheatham Street', city: 'San Marcos', state: 'TX', music_genres: ['Country'] }),
  ];
  it('matches name or city, case-insensitively', () => {
    expect(filterVenues(list, { search: 'blue', state: '', genre: '' }).map(x => x.id)).toEqual(['a']);
    expect(filterVenues(list, { search: 'san mar', state: '', genre: '' }).map(x => x.id)).toEqual(['b']);
  });
  it('combines state and genre filters', () => {
    expect(filterVenues(list, { search: '', state: 'TX', genre: 'Folk' })).toEqual([]);
    expect(filterVenues(list, { search: ' ', state: 'OK', genre: 'Folk' }).map(x => x.id)).toEqual(['a']);
  });
});

describe('groupByState', () => {
  it('sorts states with the no-state bucket last, and venues by name', () => {
    const groups = groupByState([
      v('1', { name: 'Zed', state: 'TX', email: 'e' }),
      v('2', { name: 'Alpha', state: 'TX' }),
      v('3', { name: 'Mid', state: null }),
      v('4', { name: 'Okie', state: 'OK' }),
    ]);
    expect(groups.map(g => g.state)).toEqual(['OK', 'TX', NO_STATE]);
    expect(groups[1].venues.map(x => x.name)).toEqual(['Alpha', 'Zed']);
    expect(groups[1].emailCount).toBe(1);
  });
});

describe('filterOptions', () => {
  it('returns distinct sorted states and genres', () => {
    expect(filterOptions([
      v('a', { state: 'TX', music_genres: ['Rock', 'Folk'] }),
      v('b', { state: 'AR', music_genres: ['Folk', ''] }),
      v('c', { state: null }),
    ])).toEqual({ states: ['AR', 'TX'], genres: ['Folk', 'Rock'] });
  });
});

describe('ilikeExact', () => {
  it('escapes LIKE wildcards and backslashes', () => {
    expect(ilikeExact('Bar_None 100%')).toBe('Bar\\_None 100\\%');
    expect(ilikeExact('a\\b')).toBe('a\\\\b');
    expect(ilikeExact('Plain Name')).toBe('Plain Name');
  });
});
