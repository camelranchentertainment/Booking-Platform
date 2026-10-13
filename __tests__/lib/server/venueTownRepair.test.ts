// __tests__/lib/server/venueTownRepair.test.ts
// Venues saved under the searched town (before #108) are found and corrected
// from Google; reads and writes stay inside the caller's own book.

jest.mock('../../../lib/platformSettings', () => ({ getSetting: jest.fn().mockResolvedValue('test-key') }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import type { SupabaseClient } from '@supabase/supabase-js';
import { applyVenueTowns, checkVenueTowns, compareTowns, type TownRow } from '../../../lib/server/venueTownRepair';
import type { PlaceDetails } from '../../../lib/server/googlePlaces';

const NONE: PlaceDetails = { website: null, phone: null, name: null, city: null, state: null, postal_code: null, street: null };
const GOOGLE: Record<string, PlaceDetails> = {
  'p-cahoots': { ...NONE, city: 'Lebanon', state: 'TN', postal_code: '37087' },
  'p-boondox': { ...NONE, city: 'Decherd', state: 'TN', postal_code: '37324' },
  'p-pond': { ...NONE, city: 'Franklin', state: 'TN', postal_code: '37064' },
  'p-gone': NONE,
};
const lookup = jest.fn((placeId: string) => Promise.resolve(GOOGLE[placeId] ?? NONE));

const row = (id: string, place_id: string, city: string | null, state: string | null, zip: string | null = null): TownRow => ({ id, name: id, place_id, city, state, zip });

describe('compareTowns', () => {
  beforeEach(() => lookup.mockClear());

  it('proposes Google’s town only where it differs, and counts unknowns', async () => {
    const r = await compareTowns(
      [
        row('cahoots', 'p-cahoots', 'Decherd', 'TN'),
        row('boondox', 'p-boondox', 'decherd', 'Tennessee'), // same town, different spelling
        row('pond', 'p-pond', null, null),
        row('gone', 'p-gone', 'Manchester', 'TN'),
      ],
      lookup,
    );
    expect(r.checked).toBe(4);
    expect(r.unknown).toBe(1);
    expect(r.fixes).toEqual([
      { id: 'cahoots', name: 'cahoots', from: 'Decherd, TN', to: 'Lebanon, TN', city: 'Lebanon', state: 'TN', zip: '37087' },
      { id: 'pond', name: 'pond', from: '(no town)', to: 'Franklin, TN', city: 'Franklin', state: 'TN', zip: '37064' },
    ]);
  });

  it('never overwrites an existing ZIP', async () => {
    const r = await compareTowns([row('cahoots', 'p-cahoots', 'Decherd', 'TN', '37324')], lookup);
    expect(r.fixes[0].zip).toBeNull();
  });
});

/** PostgREST-like chain recording filters, for the venues query and each update. */
function fakeService(table: string, rows: Array<Record<string, unknown>>) {
  const selects: Array<Array<[string, string, unknown]>> = [];
  const updates: Array<{ values: Record<string, unknown>; filters: Array<[string, string, unknown]> }> = [];
  const from = jest.fn((t: string) => {
    expect(t).toBe(table);
    const filters: Array<[string, string, unknown]> = [];
    let update: Record<string, unknown> | null = null;
    const c: Record<string, unknown> = {};
    const rec = (op: string) => (col: string, val: unknown) => {
      filters.push([op, col, val]);
      return c;
    };
    c.select = () => c;
    c.eq = rec('eq');
    c.is = rec('is');
    c.in = rec('in');
    c.order = () => c;
    c.update = (v: Record<string, unknown>) => {
      update = v;
      return c;
    };
    c.limit = () => {
      selects.push(filters);
      const ids = filters.find(f => f[0] === 'in')?.[2] as string[] | undefined;
      return Promise.resolve({ data: ids ? rows.filter(r => ids.includes(String(r.id))) : rows, error: null });
    };
    c.then = (ok: (v: unknown) => unknown) => {
      updates.push({ values: update ?? {}, filters });
      return Promise.resolve({ error: null }).then(ok);
    };
    return c;
  });
  return { service: { from } as unknown as SupabaseClient, selects, updates };
}

describe('checkVenueTowns / applyVenueTowns — band', () => {
  const bandRows = [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Cahoots', place_id: 'p-cahoots', city: 'Decherd', state: 'TN', zip: null },
    { id: '22222222-2222-4222-8222-222222222222', name: 'The Boondox', place_id: 'p-boondox', city: 'Decherd', state: 'TN', zip: '37324' },
    { id: '33333333-3333-4333-8333-333333333333', name: 'Typed In', place_id: null, city: 'Decherd', state: 'TN', zip: null },
  ];

  it('previews only real differences, scoped to the band, counting hand-typed venues', async () => {
    const { service, selects, updates } = fakeService('venues', bandRows);
    const r = await checkVenueTowns(service, { kind: 'band', actId: 'act-1' }, lookup);
    expect(selects[0]).toContainEqual(['eq', 'act_id', 'act-1']);
    expect(r).toMatchObject({ checked: 2, noPlaceId: 1, unknown: 0, truncated: false });
    expect(r.fixes.map(f => [f.name, f.to])).toEqual([['Cahoots', 'Lebanon, TN']]);
    expect(updates).toHaveLength(0);
  });

  it('applies only chosen venues, re-derived from Google, scoped by id and band', async () => {
    const { service, selects, updates } = fakeService('venues', bandRows);
    const r = await applyVenueTowns(service, { kind: 'band', actId: 'act-1' }, [bandRows[0].id, bandRows[1].id], lookup);
    expect(selects[0]).toContainEqual(['in', 'id', [bandRows[0].id, bandRows[1].id]]);
    expect(r).toMatchObject({ failed: 0 });
    expect(r.applied.map(f => f.id)).toEqual([bandRows[0].id]); // Boondox is already right
    expect(updates).toHaveLength(1);
    expect(updates[0].values).toMatchObject({ city: 'Lebanon', state: 'TN', zip: '37087' });
    expect(updates[0].filters).toEqual(expect.arrayContaining([['eq', 'id', bandRows[0].id], ['eq', 'act_id', 'act-1']]));
  });
});

describe('applyVenueTowns — agent', () => {
  it('writes postal_code and stays inside the agent’s live venues', async () => {
    const rows = [{ id: '44444444-4444-4444-8444-444444444444', name: 'Cahoots', place_id: 'p-cahoots', city: 'Decherd', state: 'TN', postal_code: null }];
    const { service, selects, updates } = fakeService('booker_venues', rows);
    await applyVenueTowns(service, { kind: 'booker', bookerId: 'bk-1' }, [rows[0].id], lookup);
    expect(selects[0]).toEqual(expect.arrayContaining([['eq', 'booker_id', 'bk-1'], ['is', 'deleted_at', null]]));
    expect(updates[0].values).toMatchObject({ city: 'Lebanon', state: 'TN', postal_code: '37087' });
    expect(updates[0].values).not.toHaveProperty('zip');
    expect(updates[0].filters).toEqual(expect.arrayContaining([['eq', 'booker_id', 'bk-1'], ['is', 'deleted_at', null]]));
  });
});
