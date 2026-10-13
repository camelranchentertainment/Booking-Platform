// __tests__/lib/venueList.test.ts
import { mergeSavedVenue } from '../../lib/venueList';

const list = [
  { id: 'a', name: 'Antone’s Nightclub', email: null as string | null, city: 'Austin' },
  { id: 'b', name: 'Bearded Wheat Distillery', email: null as string | null, city: 'Hillsboro' },
  { id: 'c', name: 'Stampede', email: 'old@stampede.test', city: 'Ft. Worth' },
];

describe('mergeSavedVenue', () => {
  it('shows a newly saved email in the list straight away', () => {
    const out = mergeSavedVenue(list, { id: 'b', email: 'booking@beardedwheat.test' });
    expect(out.find(v => v.id === 'b')?.email).toBe('booking@beardedwheat.test');
    expect(out.find(v => v.id === 'b')?.city).toBe('Hillsboro'); // untouched fields kept
  });

  it('replaces a changed email and leaves other venues alone', () => {
    const out = mergeSavedVenue(list, { id: 'c', email: 'new@stampede.test' });
    expect(out.find(v => v.id === 'c')?.email).toBe('new@stampede.test');
    expect(out.find(v => v.id === 'a')).toBe(list[0]);
  });

  it('re-sorts when the name changes', () => {
    const out = mergeSavedVenue(list, { id: 'a', name: 'Zilker Hall' });
    expect(out.map(v => v.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not modify the original list', () => {
    mergeSavedVenue(list, { id: 'b', email: 'x@y.test' });
    expect(list[1].email).toBeNull();
  });

  it('ignores a venue that is not in the list', () => {
    expect(mergeSavedVenue(list, { id: 'zzz', email: 'x@y.test' })).toBe(list);
  });
});
