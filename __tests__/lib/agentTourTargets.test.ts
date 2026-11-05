// __tests__/lib/agentTourTargets.test.ts
//
// Adding venues to a tour's outreach list: band scoping, new-venue handling,
// duplicates, and the card's reply check.
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildTourTargetPayload, executeTourTargetAdd, loadTourTarget, type TourTarget } from '../../lib/server/agentTourTargets';
import { phantomCardCorrection } from '../../lib/server/agent/engine';
import { describeTourTargetAdd } from '../../lib/agentStagingHelpers';

jest.mock('../../lib/statusSync', () => ({ syncBooking: jest.fn(async () => undefined) }));

const ACT = 'act-mine';
const TOUR = '11111111-1111-4111-8111-111111111111';
const VENUE = '22222222-2222-4222-8222-222222222222';
const NEW_VENUE = '33333333-3333-4333-8333-333333333333';

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code?: string; message: string } | null };

/** Minimal PostgREST stand-in: rows filtered by eq (ilike = case-insensitive eq); inserts recorded. */
function fakeDb(tables: Record<string, Row[]>, insertError?: { code?: string; message: string }) {
  const inserts: Array<{ table: string; row: Row }> = [];
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let inserted: Row | null = null;
    const rows = () => (tables[table] ?? []).filter(r => filters.every(f => f(r)));
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return builder; },
      ilike: (k: string, v: string) => { filters.push(r => String(r[k]).toLowerCase() === v.toLowerCase()); return builder; },
      limit: () => builder,
      insert: (row: Row) => { inserts.push({ table, row }); inserted = { id: table === 'venues' ? NEW_VENUE : 'tv-new', ...row }; return builder; },
      maybeSingle: async (): Promise<Result> => ({ data: rows()[0] ?? null, error: null }),
      single: async (): Promise<Result> => (table === 'tour_venues' && insertError ? { data: null, error: insertError } : { data: inserted, error: null }),
      then: (resolve: (r: Result) => unknown) => resolve({ data: rows(), error: null }),
    };
    return builder;
  };
  return { service: { from } as unknown as SupabaseClient, inserts };
}

const saved = { id: VENUE, act_id: ACT, name: 'Blue Light', city: 'Lubbock', state: 'TX', email: 'b@x.com' };
const tourRow = { id: TOUR, act_id: ACT, name: 'LONE STAR', status: 'planning' };
const tourTarget = (venueIds: string[] = []): TourTarget => ({ id: TOUR, name: 'LONE STAR', venueIds: new Set(venueIds) });

describe('loadTourTarget', () => {
  it('finds an open tour and what is already on it', async () => {
    const { service } = fakeDb({ tours: [tourRow], tour_venues: [{ tour_id: TOUR, venue_id: VENUE }] });
    const tour = await loadTourTarget(service, ACT, 'lone star');
    expect(tour.id).toBe(TOUR);
    expect(tour.venueIds.has(VENUE)).toBe(true);
  });

  it("refuses another band's tour and closed tours", async () => {
    const { service } = fakeDb({ tours: [{ ...tourRow, act_id: 'other' }, { ...tourRow, id: 't2', name: 'OLD RUN', status: 'completed' }] });
    await expect(loadTourTarget(service, ACT, 'LONE STAR')).rejects.toThrow('couldn\'t tell which tour');
    await expect(loadTourTarget(service, ACT, 'OLD RUN')).rejects.toThrow('couldn\'t tell which tour');
  });
});

describe('buildTourTargetPayload', () => {
  it('uses a saved venue by id', async () => {
    const { service } = fakeDb({ venues: [saved] });
    const p = await buildTourTargetPayload(service, ACT, tourTarget(), { venue_id: VENUE });
    expect(p).toMatchObject({ mode: 'existing', venue_id: VENUE, venue_name: 'Blue Light', tour_id: TOUR });
  });

  it("refuses another band's venue", async () => {
    const { service } = fakeDb({ venues: [{ ...saved, act_id: 'other' }] });
    await expect(buildTourTargetPayload(service, ACT, tourTarget(), { venue_id: VENUE })).rejects.toThrow("wasn't found");
  });

  it('matches a named venue to the saved one instead of duplicating it', async () => {
    const { service } = fakeDb({ venues: [saved] });
    const p = await buildTourTargetPayload(service, ACT, tourTarget(), { name: 'BLUE LIGHT', city: 'lubbock', state: 'TX' });
    expect(p).toMatchObject({ mode: 'existing', venue_id: VENUE });
  });

  it('refuses a venue already on the tour', async () => {
    const { service } = fakeDb({ venues: [saved] });
    await expect(buildTourTargetPayload(service, ACT, tourTarget([VENUE]), { venue_id: VENUE })).rejects.toThrow('already on LONE STAR');
  });

  it('builds a new venue, and needs name, city and state', async () => {
    const { service } = fakeDb({ venues: [] });
    const p = await buildTourTargetPayload(service, ACT, tourTarget(), { name: 'City Limits', city: 'San Angelo', state: 'TX' });
    expect(p).toMatchObject({ mode: 'create', venue_name: 'City Limits', city: 'San Angelo', changes: { name: 'City Limits' } });
    await expect(buildTourTargetPayload(service, ACT, tourTarget(), { name: 'No City' })).rejects.toThrow('name, city and state');
  });
});

describe('executeTourTargetAdd', () => {
  const existing = { tour_id: TOUR, mode: 'existing', venue_id: VENUE, venue_name: 'Blue Light' };
  const created = { tour_id: TOUR, mode: 'create', venue_name: 'City Limits', changes: { name: 'City Limits', city: 'San Angelo', state: 'TX' } };

  it('adds a saved venue as a Target', async () => {
    const { service, inserts } = fakeDb({ tours: [tourRow], venues: [saved] });
    const r = await executeTourTargetAdd(service, ACT, 'u1', existing);
    expect(r.already_on_tour).toBe(false);
    expect(inserts).toEqual([{ table: 'tour_venues', row: { tour_id: TOUR, venue_id: VENUE, status: 'target', added_by: 'u1' } }]);
  });

  it('saves a new venue, then adds it', async () => {
    const { service, inserts } = fakeDb({ tours: [tourRow], venues: [] });
    await executeTourTargetAdd(service, ACT, 'u1', created);
    expect(inserts.map(i => i.table)).toEqual(['venues', 'tour_venues']);
    expect(inserts[0].row).toMatchObject({ act_id: ACT, name: 'City Limits', source: 'agent' });
    expect(inserts[1].row).toMatchObject({ venue_id: NEW_VENUE });
  });

  it('reuses a venue saved since the card was staged', async () => {
    const { service, inserts } = fakeDb({ tours: [tourRow], venues: [{ ...saved, id: VENUE, name: 'City Limits', city: 'San Angelo' }] });
    await executeTourTargetAdd(service, ACT, 'u1', created);
    expect(inserts.map(i => i.table)).toEqual(['tour_venues']);
  });

  it('counts already being on the tour as done', async () => {
    const { service } = fakeDb({ tours: [tourRow], venues: [saved] }, { code: '23505', message: 'dup' });
    await expect(executeTourTargetAdd(service, ACT, 'u1', existing)).resolves.toMatchObject({ already_on_tour: true });
  });

  it('reports any other insert failure', async () => {
    const { service } = fakeDb({ tours: [tourRow], venues: [saved] }, { message: 'boom' });
    await expect(executeTourTargetAdd(service, ACT, 'u1', existing)).rejects.toThrow("couldn't be added to LONE STAR");
  });

  it("refuses another band's tour or venue, a closed tour, and a bad payload", async () => {
    const other = fakeDb({ tours: [{ ...tourRow, act_id: 'other' }], venues: [saved] });
    await expect(executeTourTargetAdd(other.service, ACT, 'u1', existing)).rejects.toThrow("tour wasn't found");
    const otherVenue = fakeDb({ tours: [tourRow], venues: [{ ...saved, act_id: 'other' }] });
    await expect(executeTourTargetAdd(otherVenue.service, ACT, 'u1', existing)).rejects.toThrow("venue wasn't found");
    const closed = fakeDb({ tours: [{ ...tourRow, status: 'cancelled' }], venues: [saved] });
    await expect(executeTourTargetAdd(closed.service, ACT, 'u1', existing)).rejects.toThrow('is cancelled');
    await expect(executeTourTargetAdd(closed.service, ACT, 'u1', { mode: 'nope' })).rejects.toThrow('no longer valid');
    expect(other.inserts).toEqual([]);
  });
});

describe('phantomCardCorrection', () => {
  it('catches a promised card when nothing was staged', () => {
    expect(phantomCardCorrection("I've put four venues on the card.", false, false)).toContain('no write tool staged');
    expect(phantomCardCorrection('The card above has the four venues.', false, false)).not.toBeNull();
  });

  it('leaves real cards, refused writes and unrelated text alone', () => {
    expect(phantomCardCorrection('Four venues on the card.', true, false)).toBeNull();
    expect(phantomCardCorrection("It couldn't go on the card.", false, true)).toBeNull();
    expect(phantomCardCorrection('Blue Light takes credit cards.', false, false)).toBeNull();
  });
});

describe('describeTourTargetAdd', () => {
  it('names the tour, venue and whether it is new', () => {
    expect(describeTourTargetAdd({ tour_name: 'LONE STAR', venue_name: 'City Limits', city: 'San Angelo', state: 'TX', mode: 'create' }))
      .toBe('LONE STAR outreach list: City Limits (San Angelo, TX) · new venue');
  });
});
