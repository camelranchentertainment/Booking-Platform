// __tests__/lib/agentDeletes.test.ts
// Guardrails for agent deletes: what may be removed, what must stay, and the
// re-check at execute time.
import {
  buildDeletePayload,
  executeDelete,
  showRowBlocker,
  MAX_DELETES_PER_REQUEST,
} from '../../lib/server/agentDeletes';
import { describeDelete } from '../../lib/agentStagingHelpers';
import type { SupabaseClient } from '@supabase/supabase-js';

const ACT = 'act-1';
const USER = 'user-1';
const NOW = new Date('2026-10-20T15:00:00Z'); // today = 2026-10-20
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';

const futureShow = (id = A, extra: Record<string, unknown> = {}) => ({
  id, status: 'confirmed', show_date: '2026-11-07', tour_id: null,
  actual_amount_received: null, final_payment_received: null, deposit_paid: false,
  deposit_paid_date: null, date_paid: null, settled_by: null, payment_status: null,
  venue: { name: 'Southbound' }, ...extra,
});

interface World {
  single?: Record<string, Record<string, unknown> | null>;   // table -> row for maybeSingle
  lists?: Record<string, unknown[]>;                          // table -> rows for awaited list queries
  counts?: Record<string, number>;                            // "table.column" -> count
}

function fake(world: World) {
  const log = {
    deletes: [] as string[],
    updates: [] as Array<[string, Record<string, unknown>]>,
    filters: [] as Array<[string, string, unknown]>,
    removed: [] as string[],
  };
  const from = jest.fn((table: string) => {
    const c: any = { _count: false, _col: '' };
    c.select = (_cols: string, opts?: { count?: string; head?: boolean }) => { if (opts?.head) c._count = true; return c; };
    c.eq = (col: string, v: unknown) => { log.filters.push([table, col, v]); if (!c._col) c._col = col; return c; };
    c.update = (row: Record<string, unknown>) => { log.updates.push([table, row]); return c; };
    c.delete = () => { log.deletes.push(table); return c; };
    c.maybeSingle = () => Promise.resolve({ data: world.single?.[table] ?? null, error: null });
    c.then = (f: (v: unknown) => unknown) => {
      if (c._count) return Promise.resolve({ count: world.counts?.[`${table}.${c._col}`] ?? 0, error: null }).then(f);
      return Promise.resolve({ data: world.lists?.[table] ?? [], error: null }).then(f);
    };
    return c;
  });
  const storage = { from: () => ({ remove: (paths: string[]) => { log.removed.push(...paths); return Promise.resolve({ error: null }); } }) };
  return { s: { from, storage } as unknown as SupabaseClient, log };
}

describe('showRowBlocker', () => {
  it('blocks past/completed shows and shows with money received; allows an upcoming unpaid show', () => {
    expect(showRowBlocker(futureShow() as any, '2026-10-20')).toBeNull();
    expect(showRowBlocker(futureShow(A, { show_date: '2026-10-19' }) as any, '2026-10-20')).toMatch(/past show/);
    expect(showRowBlocker(futureShow(A, { status: 'completed' }) as any, '2026-10-20')).toMatch(/history/);
    expect(showRowBlocker(futureShow(A, { payment_status: 'received' }) as any, '2026-10-20')).toMatch(/money/);
    expect(showRowBlocker(futureShow(A, { deposit_paid: true }) as any, '2026-10-20')).toMatch(/money/);
    expect(showRowBlocker(futureShow(A, { actual_amount_received: 500 }) as any, '2026-10-20')).toMatch(/money/);
  });
});

describe('buildDeletePayload — limits and validation', () => {
  it(`refuses more than ${MAX_DELETES_PER_REQUEST} items, several tours, and bad ids`, async () => {
    const { s } = fake({});
    await expect(buildDeletePayload(s, ACT, USER, { target: 'note', ids: [A, B, C, D] }, NOW)).rejects.toThrow(/at most 3/);
    await expect(buildDeletePayload(s, ACT, USER, { target: 'tour', ids: [A, B], include_shows: false }, NOW)).rejects.toThrow(/one tour/);
    await expect(buildDeletePayload(s, ACT, USER, { target: 'show', ids: ['nope'] }, NOW)).rejects.toThrow(/Pick the item/);
    await expect(buildDeletePayload(s, ACT, USER, { target: 'venue', ids: [A] }, NOW)).rejects.toThrow();
  });

  it('is all-or-nothing: one blocked item stages nothing', async () => {
    const { s } = fake({ single: { bookings: futureShow(A, { show_date: '2025-01-01' }) } });
    await expect(buildDeletePayload(s, ACT, USER, { target: 'show', ids: [A] }, NOW)).rejects.toThrow(/past show/);
  });
});

describe('shows', () => {
  it('stages an upcoming show with no money or email history, scoped to the band', async () => {
    const { s, log } = fake({ single: { bookings: futureShow() } });
    const p = await buildDeletePayload(s, ACT, USER, { target: 'show', ids: [A] }, NOW);
    expect(p.items).toEqual([{ id: A, label: 'Southbound — 2026-11-07', mode: 'delete' }]);
    expect(log.filters).toContainEqual(['bookings', 'act_id', ACT]);
    expect(describeDelete(p)).toBe('Delete Southbound — 2026-11-07');
  });

  it('blocks shows with expenses or email history', async () => {
    const withExpense = fake({ single: { bookings: futureShow() }, counts: { 'expenses.booking_id': 1 } });
    await expect(buildDeletePayload(withExpense.s, ACT, USER, { target: 'show', ids: [A] }, NOW)).rejects.toThrow(/expenses/);
    const withEmail = fake({ single: { bookings: futureShow() }, counts: { 'email_log.booking_id': 2 } });
    await expect(buildDeletePayload(withEmail.s, ACT, USER, { target: 'show', ids: [A] }, NOW)).rejects.toThrow(/email history/);
  });

  it('execute cancels (to clear Google Calendar) then deletes', async () => {
    const { s, log } = fake({ single: { bookings: futureShow() } });
    const cleanup = jest.fn().mockResolvedValue(undefined);
    const out = await executeDelete(s, ACT, USER, { target: 'show', items: [{ id: A }] }, cleanup, NOW);
    expect(log.updates).toContainEqual(['bookings', { status: 'cancelled' }]);
    expect(cleanup).toHaveBeenCalledWith(A, ACT);
    expect(log.deletes).toEqual(['bookings']);
    expect(out.done).toEqual([{ id: A, label: 'Southbound — 2026-11-07', mode: 'delete' }]);
  });

  it('execute re-checks: a show that got paid since the card was made is not deleted', async () => {
    const { s, log } = fake({ single: { bookings: futureShow(A, { payment_status: 'received' }) } });
    await expect(executeDelete(s, ACT, USER, { target: 'show', items: [{ id: A }] }, jest.fn(), NOW)).rejects.toThrow(/money/);
    expect(log.deletes).toEqual([]);
  });
});

describe('tours', () => {
  const tour = { id: A, name: 'Fall Run' };

  it('refuses a tour with expenses or any past show', async () => {
    const exp = fake({ single: { tours: tour }, counts: { 'expenses.tour_id': 1 } });
    await expect(buildDeletePayload(exp.s, ACT, USER, { target: 'tour', ids: [A], include_shows: true }, NOW)).rejects.toThrow(/expenses/);
    const past = fake({ single: { tours: tour }, lists: { bookings: [futureShow(B, { show_date: '2026-09-01' })] } });
    await expect(buildDeletePayload(past.s, ACT, USER, { target: 'tour', ids: [A], include_shows: false }, NOW)).rejects.toThrow(/show history/);
  });

  it('keeps upcoming shows (detached) when include_shows is false', async () => {
    const { s, log } = fake({ single: { tours: tour, bookings: futureShow(B) }, lists: { bookings: [futureShow(B)] } });
    const p = await buildDeletePayload(s, ACT, USER, { target: 'tour', ids: [A], include_shows: false }, NOW);
    expect(p.items[0].note).toMatch(/stay on your calendar/);
    await executeDelete(s, ACT, USER, p, jest.fn(), NOW);
    expect(log.updates).toContainEqual(['bookings', { tour_id: null }]);
    expect(log.updates).toContainEqual(['daily_notes', { tour_id: null }]);
    expect(log.deletes).toEqual(['tours']);
  });

  it('deletes its upcoming shows too when include_shows is true', async () => {
    const { s, log } = fake({ single: { tours: tour, bookings: futureShow(B) }, lists: { bookings: [futureShow(B)] } });
    const p = await buildDeletePayload(s, ACT, USER, { target: 'tour', ids: [A], include_shows: true }, NOW);
    expect(p.items[0].note).toMatch(/deleted too/);
    await executeDelete(s, ACT, USER, p, jest.fn(), NOW);
    expect(log.deletes).toEqual(['bookings', 'tours']);
  });
});

describe('members', () => {
  const member = { id: A, name: 'Travis Reed', is_active: true, linked_user_id: null };

  it('erases a member with no history', async () => {
    const { s, log } = fake({ single: { act_personnel: member } });
    const p = await buildDeletePayload(s, ACT, USER, { target: 'member', ids: [A] }, NOW);
    expect(p.items[0].mode).toBe('delete');
    await executeDelete(s, ACT, USER, p, jest.fn(), NOW);
    expect(log.deletes).toEqual(['act_personnel']);
  });

  it('retires (never erases) a member with a login, pay history or past shows', async () => {
    const login = fake({ single: { act_personnel: { ...member, linked_user_id: 'u-9' } } });
    expect((await buildDeletePayload(login.s, ACT, USER, { target: 'member', ids: [A] }, NOW)).items[0].mode).toBe('retire');

    const paid = fake({ single: { act_personnel: member }, counts: { 'expenses.personnel_id': 3 } });
    const p = await buildDeletePayload(paid.s, ACT, USER, { target: 'member', ids: [A] }, NOW);
    expect(p.items[0]).toMatchObject({ mode: 'retire' });
    expect(describeDelete(p)).toMatch(/^Retire Travis Reed — .*pay history/);
    await executeDelete(paid.s, ACT, USER, p, jest.fn(), NOW);
    expect(paid.log.updates).toContainEqual(['act_personnel', { is_active: false }]);
    expect(paid.log.deletes).toEqual([]);

    const played = fake({ single: { act_personnel: member }, lists: { booking_personnel: [{ booking: { status: 'completed', show_date: '2026-08-08' } }] } });
    expect((await buildDeletePayload(played.s, ACT, USER, { target: 'member', ids: [A] }, NOW)).items[0].mode).toBe('retire');
  });
});

describe('notes and media', () => {
  it('deletes a band-visible note but not someone else\'s private one', async () => {
    const mine = fake({ single: { daily_notes: { id: A, act_id: ACT, user_id: USER, note_date: '2026-10-19', content: 'Load in at 5', visibility: 'private' } } });
    expect((await buildDeletePayload(mine.s, ACT, USER, { target: 'note', ids: [A] }, NOW)).items[0].label).toBe('Note 2026-10-19: "Load in at 5"');
    const theirs = fake({ single: { daily_notes: { id: A, act_id: ACT, user_id: 'other', note_date: '2026-10-19', content: 'x', visibility: 'private' } } });
    await expect(buildDeletePayload(theirs.s, ACT, USER, { target: 'note', ids: [A] }, NOW)).rejects.toThrow(/wasn't found/);
  });

  it('removes a media row and its file; refuses the main logo and files in use', async () => {
    const ok = fake({ single: { media_library: { id: A, file_name: 'promo.jpg', is_primary_logo: false, storage_path: 'act-1/promo.jpg' } } });
    const p = await buildDeletePayload(ok.s, ACT, USER, { target: 'media', ids: [A] }, NOW);
    await executeDelete(ok.s, ACT, USER, p, jest.fn(), NOW);
    expect(ok.log.deletes).toEqual(['media_library']);
    expect(ok.log.removed).toEqual(['act-1/promo.jpg']);

    const logo = fake({ single: { media_library: { id: A, file_name: 'logo.png', is_primary_logo: true } } });
    await expect(buildDeletePayload(logo.s, ACT, USER, { target: 'media', ids: [A] }, NOW)).rejects.toThrow(/main logo/);
    const used = fake({ single: { media_library: { id: A, file_name: 'bg.jpg', is_primary_logo: false } }, counts: { 'social_announcements.background_media_id': 1 } });
    await expect(buildDeletePayload(used.s, ACT, USER, { target: 'media', ids: [A] }, NOW)).rejects.toThrow(/poster or social/);
  });
});
