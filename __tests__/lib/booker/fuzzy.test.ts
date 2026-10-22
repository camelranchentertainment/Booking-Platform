// __tests__/lib/booker/fuzzy.test.ts
// Typo-tolerant search (build list item 6).

import { buildIndex, editDistance, fuzzyFilter, normalizeText, searchIndex, typoLimit } from '../../../lib/booker/fuzzy';

describe('normalizeText', () => {
  it('drops accents, apostrophes and punctuation, reads & as and', () => {
    expect(normalizeText("  Billy Bob's — Fort Worth  ")).toBe('billy bobs fort worth');
    expect(normalizeText('Café Brazil')).toBe('cafe brazil');
    expect(normalizeText('Cain’s Ballroom')).toBe('cains ballroom');
    expect(normalizeText('Rock & Roll')).toBe('rock and roll');
    expect(normalizeText('21+ / all-ages')).toBe('21 all ages');
  });
});

describe('typoLimit and editDistance', () => {
  it('allows no typos in short words, one in medium, two in long', () => {
    expect([typoLimit(3), typoLimit(4), typoLimit(7), typoLimit(8)]).toEqual([0, 1, 1, 2]);
  });
  it('counts edits, with a swapped pair as one, and gives up past the limit', () => {
    expect(editDistance('gruene', 'gruene', 1)).toBe(0);
    expect(editDistance('gruen', 'gruene', 1)).toBe(1);
    expect(editDistance('greune', 'gruene', 1)).toBe(1);
    expect(editDistance('saloon', 'salon', 1)).toBe(1);
    expect(editDistance('austin', 'boston', 1)).toBe(2);
    expect(editDistance('a', 'abcdef', 2)).toBe(3);
  });
});

describe('searchIndex', () => {
  const venues = [
    { id: 1, name: 'Gruene Hall', city: 'New Braunfels', state: 'TX', tags: ['dance hall'] },
    { id: 2, name: "Billy Bob's Texas", city: 'Fort Worth', state: 'TX', tags: [] },
    { id: 3, name: "Cain's Ballroom", city: 'Tulsa', state: 'OK', tags: ['all ages'] },
    { id: 4, name: 'Saxon Pub', city: 'Austin', state: 'TX', tags: ['listening room'] },
    { id: 5, name: 'The Grand', city: 'Tyler', state: 'TX', tags: [] },
  ];
  const index = buildIndex(venues, v => [v.name, v.city, v.state, ...v.tags]);
  const ids = (q: string) => searchIndex(index, q).map(v => v.id);

  it('finds names despite typos and missing punctuation', () => {
    expect(ids('Gruen Hal')).toEqual([1]);
    expect(ids('greune')).toEqual([1]);
    expect(ids('billy bobs')).toEqual([2]);
    expect(ids('billybobs')).toEqual([2]);
    expect(ids('cains balroom')).toEqual([3]);
    expect(ids('Saxxon')).toEqual([4]);
  });

  it('matches word starts while typing', () => {
    expect(ids('tul')).toEqual([3]);
    expect(ids('fort w')).toEqual([2]);
    expect(ids('braunfl')).toEqual([1]);
  });

  it('needs every word to match, so extra words narrow', () => {
    expect(ids('tx')).toEqual([1, 2, 4, 5]);
    expect(ids('hall tx')).toEqual([1]);
    expect(ids('gruene ok')).toEqual([]);
  });

  it('searches tags', () => {
    expect(ids('dance hall')).toEqual([1]);
    expect(ids('listening')).toEqual([4]);
  });

  it('never fuzzes short words, so a two-letter state stays exact', () => {
    expect(ids('ty')).toEqual([5]);
    expect(ids('ox')).toEqual([]);
  });

  it('ranks exact matches above typo matches, keeping input order on ties', () => {
    const idx = buildIndex(
      [
        { id: 'typo', name: 'Grand Saloon' },
        { id: 'exact', name: 'The Salon' },
      ],
      r => [r.name],
    );
    expect(searchIndex(idx, 'salon').map(r => r.id)).toEqual(['exact', 'typo']);
  });

  it('returns everything in order for a blank or punctuation-only query', () => {
    expect(ids('')).toEqual([1, 2, 3, 4, 5]);
    expect(ids('  — ')).toEqual([1, 2, 3, 4, 5]);
  });

  it('ignores missing fields', () => {
    expect(fuzzyFilter([{ a: null, b: undefined, c: 'Moxi' }], 'moxy', r => [r.a, r.b, r.c])).toHaveLength(1);
    expect(fuzzyFilter([{ a: null }], 'x', r => [r.a])).toEqual([]);
  });
});
