// __tests__/lib/agentTourActions.test.ts
import { buildTourUpdatePayload, executeTourUpdate } from '../../lib/server/agentTourActions';
import { describeTourUpdate } from '../../lib/agentStagingHelpers';
import { stageAction } from '../../lib/server/agentStage';
import type { SupabaseClient } from '@supabase/supabase-js';

const ACT = 'act-1';
const TOUR = '11111111-1111-4111-8111-111111111111';
const current = { id: TOUR, name: 'Fall Run', start_date: '2026-11-01', end_date: '2026-11-10', description: null, status: 'planning' };

function svc(opts: { tour?: Record<string, unknown> | null; insertError?: string } = {}) {
  const log = { filters: [] as Array<[string, unknown]>, updates: [] as Record<string, unknown>[], inserts: [] as Record<string, unknown>[] };
  const from = jest.fn(() => {
    const c: any = {};
    c.select = () => c;
    c.eq = (col: string, v: unknown) => { log.filters.push([col, v]); return c; };
    c.update = (row: Record<string, unknown>) => { log.updates.push(row); return c; };
    c.insert = (row: Record<string, unknown>) => { log.inserts.push(row); return c; };
    c.maybeSingle = () => Promise.resolve({ data: opts.tour === undefined ? current : opts.tour, error: null });
    c.single = () => Promise.resolve(opts.insertError ? { data: null, error: { message: opts.insertError } } : { data: { id: 'staged-1' }, error: null });
    return c;
  });
  return { s: { from } as unknown as SupabaseClient, log };
}

describe('buildTourUpdatePayload', () => {
  it('keeps only real changes, with previous values for the card', async () => {
    const { s, log } = svc();
    const p = await buildTourUpdatePayload(s, ACT, { tour_id: TOUR, name: 'Fall Run', end_date: '2026-11-12', status: 'cancelled' });
    expect(p.changes).toEqual({ end_date: '2026-11-12', status: 'cancelled' });
    expect(p.previous).toEqual({ start_date: '2026-11-01', end_date: '2026-11-10', status: 'planning' });
    expect(log.filters).toContainEqual(['act_id', ACT]);
    expect(describeTourUpdate(p)).toBe('Tour "Fall Run": dates 2026-11-01 – 2026-11-12, cancel tour (shows unchanged)');
  });

  it('rejects another band\'s tour, no-op edits, bad dates and bad status', async () => {
    await expect(buildTourUpdatePayload(svc({ tour: null }).s, ACT, { tour_id: TOUR, name: 'X' })).rejects.toThrow(/wasn't found/);
    await expect(buildTourUpdatePayload(svc().s, ACT, { tour_id: TOUR, name: 'Fall Run' })).rejects.toThrow(/Nothing would change/);
    await expect(buildTourUpdatePayload(svc().s, ACT, { tour_id: TOUR, end_date: '2026-10-01' })).rejects.toThrow(/before the start/);
    await expect(buildTourUpdatePayload(svc().s, ACT, { tour_id: TOUR, start_date: '11/3/2026' })).rejects.toThrow(/YYYY-MM-DD/);
    await expect(buildTourUpdatePayload(svc().s, ACT, { tour_id: TOUR, status: 'deleted' })).rejects.toThrow();
    await expect(buildTourUpdatePayload(svc().s, ACT, { tour_id: 'not-a-uuid', name: 'X' })).rejects.toThrow(/Pick the tour/);
  });
});

describe('executeTourUpdate', () => {
  it('writes only whitelisted fields, scoped to the band', async () => {
    const { s, log } = svc();
    await executeTourUpdate(s, ACT, { tour_id: TOUR, changes: { status: 'cancelled', act_id: 'evil' } });
    expect(log.updates[0]).toEqual({ status: 'cancelled', updated_at: expect.any(String) });
    expect(log.filters).toContainEqual(['act_id', ACT]);
    expect(log.filters).toContainEqual(['id', TOUR]);
  });

  it('refuses a tampered payload', async () => {
    await expect(executeTourUpdate(svc().s, ACT, { tour_id: TOUR, changes: { status: 'deleted' } })).rejects.toThrow(/no longer valid/);
  });

  it('fails when the tour is not the band\'s', async () => {
    await expect(executeTourUpdate(svc({ tour: null }).s, ACT, { tour_id: TOUR, changes: { name: 'X' } })).rejects.toThrow(/wasn't found/);
  });
});

describe('stageAction', () => {
  it('stages for the caller\'s band', async () => {
    const { s, log } = svc();
    const r = await stageAction(s, ACT, 'u-1', 'tour_update', { a: 1 });
    expect(r).toEqual({ action_type: 'tour_update', staged_action_id: 'staged-1', proposal: { a: 1 }, requires_confirmation: true });
    expect(log.inserts[0]).toMatchObject({ act_id: ACT, created_by: 'u-1', action_type: 'tour_update' });
  });

  it('explains a missing database update in plain words', async () => {
    const { s } = svc({ insertError: 'new row violates check constraint "ai_staged_actions_action_type_check"' });
    await expect(stageAction(s, ACT, 'u', 'tour_update', {})).rejects.toThrow(/SQL update needs to be run/);
  });
});
