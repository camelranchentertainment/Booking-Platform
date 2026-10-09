// __tests__/lib/agentMoneyActions.test.ts
import {
  formatMoneyContext, buildMoneyContext, buildWrapupPayload, executeWrapup,
  buildExpenseUpdatePayload, executeExpenseUpdate, buildExpenseArchivePayload, executeExpenseArchive,
} from '../../lib/server/agentMoneyActions';
import { describeWrapup, describeExpenseUpdate } from '../../lib/agentStagingHelpers';
import type { SupabaseClient } from '@supabase/supabase-js';

const ACT = 'act-1';
const TODAY = '2026-10-09';
const B = '44444444-4444-4444-8444-444444444444';
const E = '55555555-5555-4555-8555-555555555555';

const venue = (name: string) => ({ name });
const bk = (over: Record<string, unknown>) => ({
  id: 'b', status: 'completed', show_date: '2026-09-01', entry_type: 'show', deal_type: null,
  agreed_amount: null, actual_amount_received: null, payment_status: null, date_paid: null, venue: venue('Pub'), ...over,
});

describe('formatMoneyContext', () => {
  it('uses Earned = received on completed, Potential = agreed on confirmed upcoming', () => {
    const out = formatMoneyContext([
      bk({ id: 'b1', status: 'completed', actual_amount_received: 800, agreed_amount: 1000 }),       // earned 800
      bk({ id: 'b2', status: 'confirmed', show_date: '2026-11-01', agreed_amount: 1500 }),            // potential 1500
      bk({ id: 'b3', status: 'confirmed', show_date: '2026-08-01', agreed_amount: 999 }),             // past confirmed: neither
      bk({ id: 'b4', status: 'advancing', show_date: '2026-12-01', agreed_amount: 700 }),             // not "confirmed": neither
      bk({ id: 'b5', status: 'completed', show_date: '2025-05-01', actual_amount_received: 300 }),   // last year
      bk({ id: 't1', entry_type: 'travel', status: 'completed', actual_amount_received: 5000 }),      // travel ignored
    ] as never, [
      { id: E, expense_date: '2026-09-02', category: 'Gas', amount: '120.5', status: 'confirmed', notes: null, tour: { name: 'Fall' } },
      { id: 'e2', expense_date: '2026-10-20', category: 'Hotel', amount: 200, status: 'potential', notes: 'two rooms', tour: null },
    ] as never, TODAY);
    expect(out).toContain('2026: earned $800 (1 completed shows) · potential $1,500 (confirmed upcoming) · expenses $120.5 confirmed + $200 projected');
    expect(out).toContain('2025: earned $300');
    expect(out).toContain('id=b2 2026-11-01 [confirmed] Pub: agreed $1,500');
    expect(out).toContain(`expense_id=${E} 2026-09-02 Gas $120.5 [confirmed] tour: Fall`);
    expect(out).not.toContain('id=t1');
  });
});

describe('buildMoneyContext', () => {
  it('reads only the band\'s non-cancelled shows and non-archived expenses; fails soft', async () => {
    const calls: Array<[string, string, ...unknown[]]> = [];
    const from = (t: string) => {
      const c: any = {};
      for (const m of ['select', 'eq', 'neq', 'is', 'order', 'limit']) c[m] = (...a: unknown[]) => { calls.push([t, m, ...a]); return c; };
      c.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(f);
      return c;
    };
    await buildMoneyContext({ from } as unknown as SupabaseClient, ACT, TODAY);
    expect(calls).toContainEqual(['bookings', 'eq', 'act_id', ACT]);
    expect(calls).toContainEqual(['bookings', 'neq', 'status', 'cancelled']);
    expect(calls).toContainEqual(['expenses', 'eq', 'act_id', ACT]);
    expect(calls).toContainEqual(['expenses', 'is', 'archived_at', null]);

    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const boom = { from: () => { throw new Error('down'); } } as unknown as SupabaseClient;
    await expect(buildMoneyContext(boom, ACT, TODAY)).resolves.toMatch(/could not be loaded/);
    spy.mockRestore();
  });
});

function svc(row: Record<string, unknown> | null) {
  const log = { filters: [] as Array<[string, string, string, unknown]>, updates: [] as Array<[string, Record<string, unknown>]> };
  const from = (t: string) => {
    const c: any = {};
    c.select = () => c;
    for (const m of ['eq', 'neq', 'is']) c[m] = (col: string, v: unknown) => { log.filters.push([t, m, col, v]); return c; };
    c.update = (r: Record<string, unknown>) => { log.updates.push([t, r]); return c; };
    c.maybeSingle = () => Promise.resolve({ data: row, error: null });
    return c;
  };
  return { s: { from } as unknown as SupabaseClient, log };
}

describe('wrap-up', () => {
  const played = { id: B, status: 'confirmed', show_date: '2026-10-01', entry_type: 'show', venue: venue('Wire Road') };

  it('stages a wrap-up for a played show of the band', async () => {
    const { s, log } = svc(played);
    const p = await buildWrapupPayload(s, ACT, { booking_id: B, attendance: 180, rating: 5, rebook_flag: 'yes', mark_completed: true }, TODAY);
    expect(p).toMatchObject({ venue_name: 'Wire Road', fields: { attendance: 180, rating: 5, rebook_flag: 'yes' }, mark_completed: true });
    expect(log.filters).toContainEqual(['bookings', 'eq', 'act_id', ACT]);
    expect(describeWrapup(p)).toBe('Wrap-up: Wire Road 2026-10-01 — 180 people, 5/5, rebook: yes, mark completed');
  });

  it('refuses future, cancelled, travel and empty wrap-ups, and bad ratings', async () => {
    await expect(buildWrapupPayload(svc({ ...played, show_date: '2026-12-01' }).s, ACT, { booking_id: B, rating: 4 }, TODAY)).rejects.toThrow(/hasn't happened/);
    await expect(buildWrapupPayload(svc({ ...played, status: 'cancelled' }).s, ACT, { booking_id: B, rating: 4 }, TODAY)).rejects.toThrow(/cancelled/);
    await expect(buildWrapupPayload(svc({ ...played, entry_type: 'travel' }).s, ACT, { booking_id: B, rating: 4 }, TODAY)).rejects.toThrow(/travel day/);
    await expect(buildWrapupPayload(svc(played).s, ACT, { booking_id: B }, TODAY)).rejects.toThrow(/at least one/);
    await expect(buildWrapupPayload(svc(played).s, ACT, { booking_id: B, rating: 9 }, TODAY)).rejects.toThrow(/1–5/);
    await expect(buildWrapupPayload(svc(null).s, ACT, { booking_id: B, rating: 4 }, TODAY)).rejects.toThrow(/wasn't found/);
  });

  it('executes on the band\'s booking, marks completed, and updates the venue rebook flag scoped to the band', async () => {
    const { s, log } = svc({ id: B, venue_id: 'v1', status: 'completed' });
    await executeWrapup(s, ACT, { booking_id: B, fields: { rating: 4, rebook_flag: 'maybe', fee: 99999 }, mark_completed: true });
    expect(log.updates[0]).toEqual(['bookings', { rating: 4, rebook_flag: 'maybe', status: 'completed', updated_at: expect.any(String) }]);
    expect(log.updates[1][0]).toBe('venues');
    expect(log.updates[1][1]).toMatchObject({ rebook_flag: 'maybe' });
    expect(log.filters).toContainEqual(['venues', 'eq', 'act_id', ACT]);
    expect(log.filters).toContainEqual(['bookings', 'neq', 'status', 'cancelled']);
  });
});

describe('expenses', () => {
  const exp = { id: E, category: 'Gas', amount: '120', expense_date: '2026-09-02', notes: null, status: 'potential' };

  it('stages only changed fields on an active band expense', async () => {
    const { s, log } = svc(exp);
    const p = await buildExpenseUpdatePayload(s, ACT, { expense_id: E, amount: 120, status: 'confirmed' });
    expect(p.changes).toEqual({ status: 'confirmed' });
    expect(log.filters).toContainEqual(['expenses', 'is', 'archived_at', null]);
    expect(describeExpenseUpdate({ kind: 'expense_update', ...p })).toBe('Edit expense Gas $120 on 2026-09-02: status → confirmed');
    await expect(buildExpenseUpdatePayload(svc(exp).s, ACT, { expense_id: E, amount: -5 })).rejects.toThrow(/negative/);
    await expect(buildExpenseUpdatePayload(svc(null).s, ACT, { expense_id: E, amount: 5 })).rejects.toThrow(/already archived/);
  });

  it('archives instead of deleting, scoped to the band', async () => {
    const p = await buildExpenseArchivePayload(svc(exp).s, ACT, { expense_id: E });
    expect(describeExpenseUpdate({ kind: 'expense_archive', ...p })).toMatch(/^Archive expense: Gas \$120 on 2026-09-02/);
    const { s, log } = svc({ id: E, archived_at: 'now' });
    await executeExpenseArchive(s, ACT, p);
    expect(log.updates[0][1]).toEqual({ archived_at: expect.any(String), updated_at: expect.any(String) });
    expect(log.filters).toContainEqual(['expenses', 'eq', 'act_id', ACT]);
    expect(log.filters).toContainEqual(['expenses', 'is', 'archived_at', null]);
  });

  it('refuses tampered expense payloads', async () => {
    await expect(executeExpenseUpdate(svc(exp).s, ACT, { expense_id: E, changes: { amount: 'lots' } })).rejects.toThrow(/no longer valid/);
    await expect(executeExpenseArchive(svc(exp).s, ACT, { expense_id: 'x' })).rejects.toThrow(/no longer valid/);
  });
});
