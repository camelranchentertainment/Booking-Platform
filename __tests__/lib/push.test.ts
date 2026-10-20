// __tests__/lib/push.test.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { EXPO_PUSH_URL, formatClock, sendExpoPush, sendShowDayReminders, showDayMessage, type PushMessage } from '../../lib/server/push';

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

describe('formatClock', () => {
  it('formats 24h database times', () => {
    expect(formatClock('17:00:00')).toBe('5:00 PM');
    expect(formatClock('00:30')).toBe('12:30 AM');
    expect(formatClock('12:05:00')).toBe('12:05 PM');
    expect(formatClock(null)).toBeNull();
    expect(formatClock('25:00')).toBeNull();
  });
});

describe('showDayMessage', () => {
  it('builds title and body from what is filled in', () => {
    expect(showDayMessage({ id: 'b', act_id: 'a', load_in_time: '17:00:00', set_time: '21:00:00', venue: { name: 'Southbound', city: 'Tulsa', state: 'OK' } }))
      .toEqual({ title: 'Show day: Southbound', body: 'Load in 5:00 PM · Set 9:00 PM · Tulsa, OK' });
    expect(showDayMessage({ id: 'b', act_id: 'a', load_in_time: null, set_time: null, venue: null }))
      .toEqual({ title: 'Show day: your show', body: 'Open your day sheet for the details.' });
  });
});

describe('sendExpoPush', () => {
  const msg = (n: number): PushMessage => ({ to: `ExponentPushToken[t${n}]`, title: 't', body: 'b' });

  it('batches by 100 and reports dead tokens', async () => {
    const fetchImpl = jest.fn((_url: string, init: { body: string }) => {
      const batch = JSON.parse(init.body) as PushMessage[];
      return ok({ data: batch.map((m, i) => (m.to.endsWith('[t3]') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: String(i) })) });
    });
    const res = await sendExpoPush(Array.from({ length: 150 }, (_, i) => msg(i)), fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe(EXPO_PUSH_URL);
    expect(res).toEqual({ sent: 149, failed: 1, deadTokens: ['ExponentPushToken[t3]'] });
  });

  it('counts a rejected or failed batch without throwing', async () => {
    const rejected = jest.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    expect(await sendExpoPush([msg(1), msg(2)], rejected)).toEqual({ sent: 0, failed: 2, deadTokens: [] });
    const boom = jest.fn(() => Promise.reject(new Error('network')));
    expect(await sendExpoPush([msg(1)], boom)).toEqual({ sent: 0, failed: 1, deadTokens: [] });
  });
});

describe('sendShowDayReminders', () => {
  function fakeService(tables: Record<string, unknown[]>) {
    const deleted: unknown[][] = [];
    const filters: Array<[string, string, unknown]> = [];
    const from = (table: string) => {
      const q: any = {};
      q.select = () => q;
      q.eq = (c: string, v: unknown) => { filters.push([table, c, v]); return q; };
      q.neq = (c: string, v: unknown) => { filters.push([table, `!${c}`, v]); return q; };
      q.in = (c: string, v: unknown[]) => { filters.push([table, `in:${c}`, v]); if (q._del) deleted.push(v); return q; };
      q.delete = () => { q._del = true; return q; };
      q.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(f);
      return q;
    };
    return { s: { from } as unknown as SupabaseClient, deleted, filters };
  }

  it('notifies admins and non-declined linked members of today\'s confirmed shows', async () => {
    const { s, deleted, filters } = fakeService({
      bookings: [{ id: 'b1', act_id: 'a1', load_in_time: '17:00:00', set_time: '21:00:00', venue: [{ name: 'Southbound', city: 'Tulsa', state: 'OK' }] }],
      profiles: [{ id: 'admin1' }],
      booking_personnel: [{ status: 'confirmed', personnel: { linked_user_id: 'm1', is_active: true } }, { status: 'pending', personnel: { linked_user_id: null, is_active: true } }],
      push_tokens: [{ token: 'ExponentPushToken[a]' }, { token: 'ExponentPushToken[dead]' }],
    });
    const fetchImpl = jest.fn((_u: string, init: { body: string }) =>
      ok({ data: (JSON.parse(init.body) as PushMessage[]).map(m => (m.to.includes('dead') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' })) }));

    const res = await sendShowDayReminders(s, '2026-10-21', fetchImpl);

    expect(filters).toEqual(expect.arrayContaining([['bookings', 'show_date', '2026-10-21'], ['bookings', 'status', 'confirmed'], ['booking_personnel', '!status', 'declined'], ['profiles', 'act_id', 'a1']]));
    expect(filters).toContainEqual(['push_tokens', 'in:user_id', ['admin1', 'm1']]);
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body) as PushMessage[];
    expect(sent[0]).toMatchObject({ title: 'Show day: Southbound', data: { type: 'show_day', bookingId: 'b1' } });
    expect(res).toMatchObject({ shows: 1, sent: 1, failed: 1, deadTokens: ['ExponentPushToken[dead]'] });
    expect(deleted).toEqual([['ExponentPushToken[dead]']]);
  });

  it('sends nothing when there are no shows today', async () => {
    const { s } = fakeService({ bookings: [] });
    const fetchImpl = jest.fn();
    expect(await sendShowDayReminders(s, '2026-10-21', fetchImpl)).toMatchObject({ shows: 0, sent: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
