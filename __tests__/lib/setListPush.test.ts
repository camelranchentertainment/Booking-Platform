// __tests__/lib/setListPush.test.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverSetListPush, setListPushText, setListRecipients } from '../../lib/server/setListPush';

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

/** Minimal chainable fake of the service client, recording what was asked for. */
function fakeService(tables: Record<string, unknown[]>, errors: Record<string, { code: string; message: string }> = {}) {
  const calls: Array<{ table: string; op: string; arg?: unknown }> = [];
  const from = (table: string) => {
    const q: Record<string, unknown> & { _op?: string } = {};
    const chain = (op: string) => (arg?: unknown, arg2?: unknown) => { calls.push({ table, op, arg: arg2 === undefined ? arg : [arg, arg2] }); return q; };
    q.select = chain('select');
    q.eq = chain('eq');
    q.neq = chain('neq');
    q.in = chain('in');
    q.delete = () => { q._op = 'delete'; calls.push({ table, op: 'delete' }); return q; };
    q.insert = (rows: unknown) => { calls.push({ table, op: 'insert', arg: rows }); return Promise.resolve({ error: errors[`${table}.insert`] ?? null }); };
    q.then = (f: (v: unknown) => unknown) =>
      Promise.resolve({ data: tables[table] ?? [], error: errors[table] ?? null }).then(f);
    return q;
  };
  return { service: { from } as unknown as SupabaseClient, calls };
}

describe('setListRecipients', () => {
  it('keeps active, linked, non-declined members once each and skips the admin who pushed', async () => {
    const { service, calls } = fakeService({
      booking_personnel: [
        { id: 'bp1', status: 'confirmed', personnel: { linked_user_id: 'u1', is_active: true } },
        { id: 'bp2', status: 'pending', personnel: [{ linked_user_id: 'u2', is_active: null }] },
        { id: 'bp3', status: 'confirmed', personnel: { linked_user_id: null, is_active: true } },
        { id: 'bp4', status: 'confirmed', personnel: { linked_user_id: 'u4', is_active: false } },
        { id: 'bp5', status: 'confirmed', personnel: { linked_user_id: 'admin', is_active: true } },
        { id: 'bp6', status: 'confirmed', personnel: { linked_user_id: 'u1', is_active: true } },
      ],
    });
    await expect(setListRecipients(service, 'b1', 'admin')).resolves.toEqual([
      { userId: 'u1', bookingPersonnelId: 'bp1' },
      { userId: 'u2', bookingPersonnelId: 'bp2' },
    ]);
    expect(calls).toContainEqual({ table: 'booking_personnel', op: 'eq', arg: ['booking_id', 'b1'] });
    expect(calls).toContainEqual({ table: 'booking_personnel', op: 'neq', arg: ['status', 'declined'] });
  });

  it('throws when the lineup cannot be read', async () => {
    const { service } = fakeService({}, { booking_personnel: { code: 'X', message: 'down' } });
    await expect(setListRecipients(service, 'b1', 'admin')).rejects.toThrow(/lineup/);
  });
});

describe('setListPushText', () => {
  it('says new on the first push and updated after', () => {
    expect(setListPushText({ name: 'Friday set', version: 1, venueName: 'The Blue Moose', showDate: '2026-11-14' }))
      .toEqual({ title: 'New set list: The Blue Moose', body: 'Friday set is ready. The Blue Moose · Sat, Nov 14' });
    expect(setListPushText({ name: 'Friday set', version: 3, venueName: null, showDate: null }))
      .toEqual({ title: 'Set list updated: your show', body: 'Friday set changed (version 3). your show' });
  });
});

describe('deliverSetListPush', () => {
  const base = {
    actId: 'act-1', setListId: 'sl-1', bookingId: 'b1', version: 2,
    recipients: [{ userId: 'u1', bookingPersonnelId: 'bp1' }, { userId: 'u2', bookingPersonnelId: 'bp2' }],
    text: { title: 'T', body: 'B' },
  };

  it('writes one notice per member linking to their show page, pushes every device and removes dead tokens', async () => {
    const { service, calls } = fakeService({ push_tokens: [{ token: 'tok-a' }, { token: 'tok-b' }] });
    const fetchImpl = jest.fn(() => ok({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }));

    const res = await deliverSetListPush(service, base, fetchImpl);

    expect(res).toEqual({ notified: 2, push: { sent: 1, failed: 1, deadTokens: ['tok-b'] } });
    const insert = calls.find(c => c.table === 'notifications' && c.op === 'insert');
    expect(insert?.arg).toEqual([
      expect.objectContaining({ user_id: 'u1', act_id: 'act-1', type: 'set_list_published', related_id: 'sl-1', action_url: '/member/shows/bp1' }),
      expect.objectContaining({ user_id: 'u2', action_url: '/member/shows/bp2' }),
    ]);
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body[0]).toEqual(expect.objectContaining({ to: 'tok-a', data: { type: 'set_list', setListId: 'sl-1', bookingId: 'b1', version: '2' } }));
    expect(calls).toContainEqual({ table: 'push_tokens', op: 'in', arg: ['token', ['tok-b']] });
  });

  it('does nothing when there is no one to tell', async () => {
    const { service, calls } = fakeService({});
    await expect(deliverSetListPush(service, { ...base, recipients: [] })).resolves.toEqual({ notified: 0, push: { sent: 0, failed: 0, deadTokens: [] } });
    expect(calls).toEqual([]);
  });

  it('still pushes when the notice insert fails, and reports it', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service } = fakeService({ push_tokens: [{ token: 'tok-a' }] }, { 'notifications.insert': { code: '23514', message: 'bad type' } });
    const res = await deliverSetListPush(service, base, jest.fn(() => ok({ data: [{ status: 'ok' }] })));
    expect(res.notified).toBe(0);
    expect(res.push.sent).toBe(1);
  });
});
