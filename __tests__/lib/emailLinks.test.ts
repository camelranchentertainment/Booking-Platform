import { resolveEmailLinks } from '../../lib/server/emailLinks';

const ID = {
  booking: '11111111-1111-4111-8111-111111111111',
  venue: '22222222-2222-4222-8222-222222222222',
  tv: '33333333-3333-4333-8333-333333333333',
  contact: '44444444-4444-4444-8444-444444444444',
};

/** Fake client: `found[table]` decides whether that table's lookup finds a row. */
function client(found: Record<string, boolean | 'error' | 'throw'>) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  return {
    calls,
    from(table: string) {
      const call = { table, filters: [] as Array<[string, unknown]> };
      calls.push(call);
      const b: any = {
        select: () => b,
        eq: (col: string, v: unknown) => { call.filters.push([col, v]); return b; },
        maybeSingle: () => {
          const f = found[table];
          if (f === 'throw') return Promise.reject(new Error('network'));
          if (f === 'error') return Promise.resolve({ data: null, error: { message: 'boom' } });
          return Promise.resolve({ data: f ? { id: 'x' } : null, error: null });
        },
      };
      return b;
    },
  };
}

describe('resolveEmailLinks', () => {
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it("keeps links to the band's own records, scoped by act", async () => {
    const c = client({ bookings: true, venues: true, tour_venues: true, contacts: true });
    const r = await resolveEmailLinks(c, 'act-1', { bookingId: ID.booking, venueId: ID.venue, tourVenueId: ID.tv, contactId: ID.contact });
    expect(r).toEqual({ links: { bookingId: ID.booking, venueId: ID.venue, tourVenueId: ID.tv, contactId: ID.contact }, dropped: [] });
    expect(c.calls.find(x => x.table === 'bookings')!.filters).toContainEqual(['act_id', 'act-1']);
    expect(c.calls.find(x => x.table === 'tour_venues')!.filters).toContainEqual(['tour.act_id', 'act-1']);
  });

  it('drops a booking id that does not exist (the Dan\'s SilverLeaf case) but keeps the venue', async () => {
    const c = client({ bookings: false, venues: true });
    const r = await resolveEmailLinks(c, 'act-1', { bookingId: ID.booking, venueId: ID.venue });
    expect(r.links).toEqual({ bookingId: null, venueId: ID.venue, tourVenueId: null, contactId: null });
    expect(r.dropped).toEqual(['bookingId']);
  });

  it('drops malformed ids without querying', async () => {
    const c = client({});
    const r = await resolveEmailLinks(c, 'act-1', { bookingId: 'not-a-uuid', contactId: 'x' });
    expect(r.dropped.sort()).toEqual(['bookingId', 'contactId']);
    expect(c.calls).toHaveLength(0);
  });

  it('skips empty links', async () => {
    const c = client({});
    const r = await resolveEmailLinks(c, 'act-1', { bookingId: null, venueId: undefined, tourVenueId: '' });
    expect(r.dropped).toEqual([]);
    expect(c.calls).toHaveLength(0);
  });

  it('drops a link when its lookup errors or throws, without failing', async () => {
    const c = client({ bookings: 'error', venues: 'throw' });
    const r = await resolveEmailLinks(c, 'act-1', { bookingId: ID.booking, venueId: ID.venue });
    expect(r.links.bookingId).toBeNull();
    expect(r.links.venueId).toBeNull();
    expect(r.dropped.sort()).toEqual(['bookingId', 'venueId']);
  });
});
