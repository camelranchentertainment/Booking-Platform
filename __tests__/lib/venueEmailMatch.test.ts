// __tests__/lib/venueEmailMatch.test.ts
import {
  buildVenueEmailIndex, matchSenderToVenue, isSharedMailDomain, loadVenueEmailIndex,
} from '../../lib/server/venueEmailMatch';
import type { SupabaseClient } from '@supabase/supabase-js';

const maxines = { id: 'v-max', name: "Maxine's Tap Room" };
const pub = { id: 'v-pub', name: 'Dickson Street Pub' };
const brewery = { id: 'v-brew', name: 'Wire Road Brewing' };

describe('matchSenderToVenue', () => {
  const index = buildVenueEmailIndex([
    { address: 'MaxinesOnBlock@gmail.com', venue: maxines },
    { address: 'booking@dicksonpub.com', venue: pub },
    { address: 'events@wireroad.beer', venue: brewery },
  ]);

  it('matches an exact address, ignoring case and spaces', () => {
    expect(matchSenderToVenue(index, ' maxinesonblock@GMAIL.com ')).toEqual(maxines);
  });

  it('does NOT give every gmail.com sender to the one venue that uses gmail (the Maxine\'s bug)', () => {
    expect(matchSenderToVenue(index, 'cindyawill3@gmail.com')).toBeNull();
    expect(matchSenderToVenue(index, 'betterthannothinjr@gmail.com')).toBeNull();
  });

  it('still matches a colleague at a venue\'s own company domain', () => {
    expect(matchSenderToVenue(index, 'owner@dicksonpub.com')).toEqual(pub);
  });

  it('does not guess when two venues share a company domain', () => {
    const shared = buildVenueEmailIndex([
      { address: 'a@group.com', venue: pub },
      { address: 'b@group.com', venue: brewery },
    ]);
    expect(matchSenderToVenue(shared, 'a@group.com')).toEqual(pub);
    expect(matchSenderToVenue(shared, 'c@group.com')).toBeNull();
  });

  it('ignores blank and malformed addresses', () => {
    expect(matchSenderToVenue(index, '')).toBeNull();
    expect(matchSenderToVenue(index, null)).toBeNull();
    expect(matchSenderToVenue(index, 'not-an-address')).toBeNull();
  });
});

describe('isSharedMailDomain', () => {
  it.each(['gmail.com', 'hotmail.com', 'yahoo.co.uk', 'hotmail.fr', 'icloud.com', 'sbcglobal.net'])('%s is shared', d => {
    expect(isSharedMailDomain(d)).toBe(true);
  });
  it.each(['dicksonpub.com', 'wireroad.beer', 'livenation.com'])('%s is a company domain', d => {
    expect(isSharedMailDomain(d)).toBe(false);
  });
});

describe('loadVenueEmailIndex', () => {
  function service(opts: { venuesError?: boolean } = {}) {
    const filters: Array<[string, string, unknown]> = [];
    const make = (table: string, result: unknown) => {
      const c: any = {};
      c.select = () => c;
      c.eq = (col: string, val: unknown) => { filters.push([table, col, val]); return c; };
      c.not = () => c;
      c.then = (f: (v: unknown) => unknown) => Promise.resolve(result).then(f);
      return c;
    };
    const from = jest.fn((table: string) => table === 'venues'
      ? make('venues', opts.venuesError
        ? { data: null, error: { message: 'boom' } }
        : { data: [{ id: 'v1', name: 'Pub', email: 'a@pub.com', secondary_emails: ['b@pub.com'] }], error: null })
      : make('contacts', { data: [{ email: 'c@gmail.com', venue_id: 'v1', venue: { name: 'Pub' } }], error: null }));
    return { svc: { from } as unknown as SupabaseClient, filters };
  }

  it('only loads the caller\'s band\'s venues and contacts', async () => {
    const { svc, filters } = service();
    const index = await loadVenueEmailIndex(svc, 'act-1');
    expect(filters).toContainEqual(['venues', 'act_id', 'act-1']);
    expect(filters).toContainEqual(['contacts', 'venue.act_id', 'act-1']);
    expect(matchSenderToVenue(index, 'b@pub.com')?.id).toBe('v1');
    expect(matchSenderToVenue(index, 'c@gmail.com')?.id).toBe('v1'); // exact contact match still works
  });

  it('throws rather than syncing against a partial list', async () => {
    const { svc } = service({ venuesError: true });
    await expect(loadVenueEmailIndex(svc, 'act-1')).rejects.toThrow(/venue lookup failed/);
  });
});
