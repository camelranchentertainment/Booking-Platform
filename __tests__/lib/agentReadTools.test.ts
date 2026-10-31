// __tests__/lib/agentReadTools.test.ts
//
// The read tools run on the service-role client, which bypasses RLS. The one
// thing that keeps a band's data its own is the act_id filter on every query,
// so the core test here records every query each tool makes and asserts it is
// scoped to the caller's band.

import {
  READ_TOOLS,
  BOOKING_STATUSES,
  clip,
  findVenuesTool,
  formatShow,
  formatVenue,
  getShowsTool,
  getVenueTool,
  money,
  scopeEmbedded,
} from '../../lib/server/agent/readTools';
import type { AgentToolContext } from '../../lib/server/agent/types';

const ACT = 'act-mine';

type Call = { table: string; ops: Array<[string, unknown[]]> };

/**
 * A Supabase stand-in that records each query's chain of calls and resolves
 * with canned rows per table.
 */
function recordingClient(rows: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const result = () => ({ data: rows[table] ?? [], error: null });
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'in', 'not', 'gte', 'lte', 'gt', 'lt', 'is', 'order', 'limit', 'ilike', 'or']) {
        chain[m] = (...args: unknown[]) => { call.ops.push([m, args]); return chain; };
      }
      chain.maybeSingle = () => {
        const r = result();
        return Promise.resolve({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data });
      };
      chain.single = chain.maybeSingle;
      chain.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => Promise.resolve(result()).then(f, r);
      return chain;
    },
  };
  return { client, calls };
}

const ctxWith = (client: unknown): AgentToolContext => ({
  service: client as AgentToolContext['service'], actId: ACT, userId: 'user-1', today: '2026-10-30',
});

/** Valid input for each tool, so every tool can be exercised by the scoping test. */
const SAMPLE_INPUT: Record<string, unknown> = {
  get_shows: { from: '2026-11-01', to: '2026-11-30', tour_name: 'Fall', venue_name: 'Wire' },
  get_tours: {},
  find_venues: { name: 'wire', city: 'Fayetteville', state: 'AR' },
  get_venue: { venue_id: '6f1c1a2e-2b1e-4a5b-9a3c-1d2e3f4a5b6c' },
  get_money: {},
  get_outreach: {},
  get_inbox: {},
  get_notes_and_media: {},
};

const SAMPLE_ROWS = {
  tours: [{ id: 'tour-1', name: 'Fall Run', status: 'active', start_date: '2026-11-01', end_date: '2026-11-20' }],
  venues: [{ id: 'venue-1', name: 'Wire Road', contacts: [], bookings: [] }],
};

describe('every read tool is scoped to the caller\'s band', () => {
  it('has sample input for every tool', () => {
    expect(Object.keys(SAMPLE_INPUT).sort()).toEqual(READ_TOOLS.map(t => t.name).sort());
  });

  // tour_venues has no act_id column; it is only ever queried by tour ids that were themselves loaded with the act filter.
  const UNSCOPED_BY_DESIGN = new Set(['tour_venues']);

  it.each(READ_TOOLS.map(t => [t.name, t] as const))('%s filters every query on act_id', async (_name, tool) => {
    const { client, calls } = recordingClient(SAMPLE_ROWS);
    const input = tool.schema.parse(SAMPLE_INPUT[tool.name]);
    await tool.run(ctxWith(client), input);

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      if (UNSCOPED_BY_DESIGN.has(call.table)) {
        expect(call.ops.some(([op, args]) => op === 'in' && args[0] === 'tour_id')).toBe(true);
        continue;
      }
      const actFilters = call.ops.filter(([op, args]) => op === 'eq' && args[0] === 'act_id');
      expect({ table: call.table, actFilters }).toEqual({ table: call.table, actFilters: [['eq', ['act_id', ACT]]] });
    }
  });

  it.each(READ_TOOLS.map(t => [t.name, t] as const))('%s refuses an act_id in its input', (_name, tool) => {
    const input = { ...(SAMPLE_INPUT[tool.name] as object), act_id: 'act-someone-else' };
    expect(tool.schema.safeParse(input).success).toBe(false);
  });
});

describe('get_shows', () => {
  it('excludes cancelled shows unless asked', async () => {
    const { client, calls } = recordingClient();
    await getShowsTool.run(ctxWith(client), getShowsTool.schema.parse({}));
    expect(calls[0].ops).toContainEqual(['neq', ['status', 'cancelled']]);
  });

  it('filters by the given statuses instead', async () => {
    const { client, calls } = recordingClient();
    await getShowsTool.run(ctxWith(client), getShowsTool.schema.parse({ statuses: ['hold', 'followup'] }));
    expect(calls[0].ops).toContainEqual(['in', ['status', ['hold', 'followup']]]);
    expect(calls[0].ops.some(([op]) => op === 'neq')).toBe(false);
  });

  it('says so when no tour matches instead of returning every show', async () => {
    const { client } = recordingClient({ tours: [] });
    const result = await getShowsTool.run(ctxWith(client), getShowsTool.schema.parse({ tour_name: 'Nope' }));
    expect(result.content).toMatch(/No tour matches "Nope"/);
  });

  it('escapes LIKE wildcards in names', async () => {
    const { client, calls } = recordingClient({ venues: [] });
    await getShowsTool.run(ctxWith(client), getShowsTool.schema.parse({ venue_name: '100%_Club' }));
    const venueQuery = calls.find(c => c.table === 'venues');
    expect(venueQuery?.ops).toContainEqual(['ilike', ['name', '%100\\%\\_Club%']]);
  });

  it('rejects dates that are not YYYY-MM-DD and statuses the database does not have', () => {
    expect(getShowsTool.schema.safeParse({ from: 'next friday' }).success).toBe(false);
    expect(getShowsTool.schema.safeParse({ statuses: ['booked'] }).success).toBe(false);
  });

  it('knows every booking status in the database enum', () => {
    expect(BOOKING_STATUSES).toEqual(['pitch', 'followup', 'negotiation', 'hold', 'contract', 'confirmed', 'advancing', 'completed', 'cancelled']);
  });
});

describe('find_venues', () => {
  it('needs at least a name, city or state', () => {
    expect(findVenuesTool.schema.safeParse({}).success).toBe(false);
    expect(findVenuesTool.schema.safeParse({ city: 'Tulsa' }).success).toBe(true);
  });
});

describe('get_venue', () => {
  it('reports a venue that is not this band\'s as an error', async () => {
    const { client } = recordingClient({ venues: [] });
    const result = await getVenueTool.run(ctxWith(client), getVenueTool.schema.parse(SAMPLE_INPUT.get_venue));
    expect(result.isError).toBe(true);
  });

  it('rejects a venue_id that is not a uuid', () => {
    expect(getVenueTool.schema.safeParse({ venue_id: 'wire road' }).success).toBe(false);
  });
});

describe('scopeEmbedded', () => {
  it('drops embedded contacts and shows from other bands, and rows with no band', () => {
    const [venue] = scopeEmbedded([{
      id: 'v', name: 'Wire Road', city: null, state: null, email: null, secondary_emails: null, phone: null, website: null,
      venue_type: null, capacity: null, booking_contact: null, live_music: null, pay_notes: null, last_contacted_at: null, last_reply_at: null,
      contacts: [
        { id: 'c1', first_name: 'Mine', last_name: null, title: null, email: null, status: null, act_id: ACT },
        { id: 'c2', first_name: 'Theirs', last_name: null, title: null, email: 'x@y.z', status: null, act_id: 'act-other' },
        { id: 'c3', first_name: 'Unknown', last_name: null, title: null, email: null, status: null, act_id: null },
      ],
      bookings: [{ show_date: '2026-01-01', status: 'completed', act_id: 'act-other' }],
    }], ACT);
    expect(venue.contacts?.map(c => c.id)).toEqual(['c1']);
    expect(venue.bookings).toEqual([]);
  });
});

describe('formatting helpers', () => {
  it('formats money and keeps missing money blank, never $0', () => {
    expect(money(1250)).toBe('$1,250');
    expect(money('800.5')).toBe('$800.5');
    expect(money(null)).toBe('');
    expect(money(0)).toBe('$0');
  });

  it('clips long notes and flattens whitespace', () => {
    expect(clip('a\n\n b', 10)).toBe('a b');
    expect(clip('x'.repeat(20), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(clip(null)).toBe('');
  });

  it('shows a venue\'s saved address and zip, and flags a missing one', () => {
    const base = {
      id: 'v1', name: "Kobi's Bar", city: 'Bonner Springs', state: 'KS', email: null, secondary_emails: null, phone: '(913) 745-4242',
      website: null, venue_type: null, capacity: null, booking_contact: null, live_music: null, pay_notes: null,
      last_contacted_at: null, last_reply_at: null, contacts: [], bookings: [],
    };
    expect(formatVenue({ ...base, address: '113 Oak St', zip: '66012' })).toContain('address 113 Oak St 66012');
    expect(formatVenue({ ...base, address: '113 Oak St', zip: null })).toContain('address 113 Oak St (no zip)');
    expect(formatVenue({ ...base, address: null, zip: null })).toContain('no street address');
  });

  it('formats a show with times, money and ids', () => {
    const line = formatShow({
      id: 'b1', show_date: '2026-11-07', status: 'confirmed', entry_type: 'show',
      load_in_time: '17:00:00', soundcheck_time: null, door_time: '19:00:00', set_time: '21:00:00', end_time: null, set_length_min: 90,
      deal_type: 'guarantee', agreed_amount: 800, actual_amount_received: null, payment_status: 'pending', deposit_amount: null, deposit_paid: null,
      notes: 'Bring the PA', deal_notes: null, advance_notes: null, internal_notes: null,
      hotel_booked: true, meals_provided: null, details_pending: null, attendance: null, rating: null,
      venue: { id: 'v1', name: 'Wire Road', city: 'Fayetteville', state: 'AR' }, tour: { id: 't1', name: 'Fall Run' },
    });
    expect(line).toContain('booking_id=b1 2026-11-07 [confirmed] Wire Road, Fayetteville AR (venue_id=v1) · tour "Fall Run"');
    expect(line).toContain('load-in 17:00 · doors 19:00 · set 21:00 (90 min)');
    expect(line).toContain('agreed $800');
    expect(line).not.toContain('received');
    expect(line).toContain('hotel booked');
    expect(line).toContain('notes: Bring the PA');
  });
});
