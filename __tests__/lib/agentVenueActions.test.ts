// __tests__/lib/agentVenueActions.test.ts
import {
  buildVenueUpsertPayload, executeVenueUpsert, buildContactUpsertPayload, executeContactUpsert,
} from '../../lib/server/agentVenueActions';
import { describeVenueUpsert, describeContactUpsert } from '../../lib/agentStagingHelpers';
import type { SupabaseClient } from '@supabase/supabase-js';

const ACT = 'act-1';
const VENUE = '22222222-2222-4222-8222-222222222222';
const CONTACT = '33333333-3333-4333-8333-333333333333';

interface Fake {
  venue?: Record<string, unknown> | null;
  venueDupes?: unknown[];
  contact?: Record<string, unknown> | null;
  contactDupes?: unknown[];
}

function svc(f: Fake = {}) {
  const log = {
    filters: [] as Array<[string, string, string, unknown]>,
    inserts: [] as Array<[string, Record<string, unknown>]>,
    updates: [] as Array<[string, Record<string, unknown>]>,
  };
  const from = jest.fn((table: string) => {
    const c: any = {};
    let isWrite = false;
    c.select = () => c;
    for (const m of ['eq', 'neq', 'ilike']) c[m] = (col: string, v: unknown) => { log.filters.push([table, m, col, v]); return c; };
    c.insert = (row: Record<string, unknown>) => { isWrite = true; log.inserts.push([table, row]); return c; };
    c.update = (row: Record<string, unknown>) => { isWrite = true; log.updates.push([table, row]); return c; };
    c.limit = () => Promise.resolve({ data: table === 'venues' ? (f.venueDupes ?? []) : (f.contactDupes ?? []), error: null });
    c.maybeSingle = () => Promise.resolve({
      data: isWrite ? { id: 'written' } : table === 'venues' ? (f.venue === undefined ? { id: VENUE, name: 'Dickson Street Pub', city: 'Fayetteville', state: 'AR', email: null } : f.venue)
        : (f.contact === undefined ? { id: CONTACT, first_name: 'Sam', last_name: 'Lee', email: 'sam@pub.com', status: 'not_contacted' } : f.contact),
      error: null,
    });
    c.single = () => Promise.resolve({ data: { id: 'new' }, error: null });
    return c;
  });
  return { s: { from } as unknown as SupabaseClient, log };
}

describe('venues', () => {
  it('stages a new venue and refuses a duplicate name+city in the band', async () => {
    const p = await buildVenueUpsertPayload(svc().s, ACT, { name: 'Wire Road', city: 'Fayetteville', state: 'AR', email: 'Booking@WireRoad.beer' });
    expect(p).toMatchObject({ mode: 'create', venue_name: 'Wire Road', changes: { email: 'booking@wireroad.beer' } });
    expect(describeVenueUpsert(p)).toBe('New venue: Wire Road (Fayetteville, AR) · booking@wireroad.beer');
    await expect(buildVenueUpsertPayload(svc({ venueDupes: [{ id: 'x' }] }).s, ACT, { name: 'Wire Road', city: 'Fayetteville', state: 'AR' }))
      .rejects.toThrow(/already saved/);
  });

  it('requires name, city and state for a new venue and a valid email', async () => {
    await expect(buildVenueUpsertPayload(svc().s, ACT, { name: 'X' })).rejects.toThrow(/name, city and state/);
    await expect(buildVenueUpsertPayload(svc().s, ACT, { name: 'X', city: 'Y', state: 'AR', email: 'nope' })).rejects.toThrow(/doesn't look right/);
  });

  it('updates only changed fields on the band\'s venue', async () => {
    const { s, log } = svc();
    const p = await buildVenueUpsertPayload(s, ACT, { venue_id: VENUE, city: 'Fayetteville', email: 'b@pub.com', capacity: 200 });
    expect(p.changes).toEqual({ email: 'b@pub.com', capacity: 200 });
    expect(log.filters).toContainEqual(['venues', 'eq', 'act_id', ACT]);
    expect(describeVenueUpsert(p)).toBe('Update venue Dickson Street Pub: email, capacity');
    await expect(buildVenueUpsertPayload(svc({ venue: null }).s, ACT, { venue_id: VENUE, email: 'b@pub.com' })).rejects.toThrow(/wasn't found/);
  });

  it('executes create with the band and creator set, and update scoped to the band', async () => {
    const a = svc();
    await executeVenueUpsert(a.s, ACT, 'u-1', { mode: 'create', changes: { name: 'Wire Road', city: 'F', state: 'AR', act_id: 'evil' } });
    expect(a.log.inserts[0][1]).toMatchObject({ name: 'Wire Road', act_id: ACT, created_by: 'u-1', source: 'agent' });
    const b = svc();
    await executeVenueUpsert(b.s, ACT, 'u-1', { mode: 'update', venue_id: VENUE, changes: { capacity: 300 } });
    expect(b.log.updates[0][1]).toEqual({ capacity: 300, updated_at: expect.any(String) });
    expect(b.log.filters).toContainEqual(['venues', 'eq', 'act_id', ACT]);
    await expect(executeVenueUpsert(svc().s, ACT, 'u', { mode: 'delete', changes: {} })).rejects.toThrow(/no longer valid/);
  });
});

describe('contacts', () => {
  it('stages a new contact at the band\'s venue', async () => {
    const p = await buildContactUpsertPayload(svc().s, ACT, { venue_id: VENUE, first_name: 'Sarah', email: 'Sarah@X.com' });
    expect(p).toMatchObject({ mode: 'create', venue_name: 'Dickson Street Pub', contact_label: 'Sarah', changes: { first_name: 'Sarah', email: 'sarah@x.com' } });
    expect(describeContactUpsert(p)).toBe('New contact at Dickson Street Pub: Sarah · sarah@x.com');
  });

  it('refuses another band\'s venue, an empty contact, and an email already saved', async () => {
    await expect(buildContactUpsertPayload(svc({ venue: null }).s, ACT, { venue_id: VENUE, first_name: 'S' })).rejects.toThrow(/wasn't found/);
    await expect(buildContactUpsertPayload(svc().s, ACT, { venue_id: VENUE })).rejects.toThrow(/name or an email/);
    await expect(buildContactUpsertPayload(svc({ contactDupes: [{ id: 'c', venue: { name: 'Other Pub' } }] }).s, ACT, { venue_id: VENUE, email: 'a@b.com' }))
      .rejects.toThrow(/already saved as a contact at Other Pub/);
  });

  it('edits only changed fields and checks the email across the band', async () => {
    const { s, log } = svc();
    const p = await buildContactUpsertPayload(s, ACT, { venue_id: VENUE, contact_id: CONTACT, email: 'sam@pub.com', status: 'pitched' });
    expect(p.changes).toEqual({ status: 'pitched' });
    expect(log.filters).toContainEqual(['contacts', 'eq', 'venue.act_id', ACT]);
    expect(log.filters).toContainEqual(['contacts', 'neq', 'id', CONTACT]);
  });

  it('executes create/update only after re-checking the venue is the band\'s', async () => {
    const a = svc();
    await executeContactUpsert(a.s, ACT, { mode: 'create', venue_id: VENUE, changes: { email: 'x@y.com' } });
    expect(a.log.inserts[0][1]).toMatchObject({ venue_id: VENUE, email: 'x@y.com', first_name: '', last_name: '' });
    await expect(executeContactUpsert(svc({ venue: null }).s, ACT, { mode: 'create', venue_id: VENUE, changes: { email: 'x@y.com' } }))
      .rejects.toThrow(/wasn't found/);
  });
});
