// __tests__/api/setListPublish.test.ts
//
// Push to Band route: admins only, band from the profile, templates refused,
// publishes as the caller, and notifies only when something actually changed.
import type { NextApiRequest, NextApiResponse } from 'next';

const SL_ID = '0b6f2c1e-8a8e-4b51-9d5e-3f2a1c4b5d6e';

let setList: Record<string, unknown> | null;
let show: Record<string, unknown> | null;
const mockFilters: Array<[string, string, unknown]> = [];
const mockService = {
  from: (table: string) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (c: string, v: unknown) => { mockFilters.push([table, c, v]); return q; };
    q.is = () => q;
    q.maybeSingle = async () => ({ data: table === 'set_lists' ? setList : show, error: null });
    return q;
  },
};
const mockRequire = jest.fn();
const mockRecipients = jest.fn();
const mockDeliver = jest.fn();
const mockRpc = jest.fn();
const mockCreateClient = jest.fn((..._a: unknown[]) => ({ rpc: mockRpc }));

jest.mock('../../lib/supabase', () => ({ getServiceClient: () => mockService }));
jest.mock('../../lib/server/requireBandAdmin', () => ({ requireBandAdmin: (...a: unknown[]) => mockRequire(...a) }));
jest.mock('../../lib/server/setListPush', () => ({
  ...jest.requireActual('../../lib/server/setListPush'),
  setListRecipients: (...a: unknown[]) => mockRecipients(...a),
  deliverSetListPush: (...a: unknown[]) => mockDeliver(...a),
}));
jest.mock('@supabase/supabase-js', () => ({ createClient: (...a: unknown[]) => mockCreateClient(...a) }));

import handler from '../../pages/api/set-lists/[id]/publish';
import { AppError } from '../../lib/apiError';

const call = async (method: string, id: unknown = SL_ID) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), setHeader: jest.fn() };
  await handler(
    { method, query: { id }, headers: { authorization: 'Bearer user-token' } } as unknown as NextApiRequest,
    res as unknown as NextApiResponse,
  );
  return { status: res.status.mock.calls[0][0] as number, body: res.json.mock.calls[0][0] as Record<string, any> };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFilters.length = 0;
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockRequire.mockResolvedValue({ actId: 'act-1', userId: 'admin-1', role: 'band_admin' });
  setList = { id: SL_ID, name: 'Friday set', booking_id: 'b1', act_id: 'act-1' };
  show = { id: 'b1', show_date: '2026-11-14', venue: { name: 'The Blue Moose' } };
  mockRecipients.mockResolvedValue([{ userId: 'u1', bookingPersonnelId: 'bp1' }, { userId: 'u2', bookingPersonnelId: 'bp2' }]);
  mockRpc.mockResolvedValue({ data: { set_list_id: SL_ID, version: 1, published_at: '2026-11-06T19:00:00Z', changed: true }, error: null });
  mockDeliver.mockResolvedValue({ notified: 2, push: { sent: 3, failed: 0, deadTokens: [] } });
});

it('refuses members and signed-out callers', async () => {
  mockRequire.mockRejectedValueOnce(new AppError(403, 'Forbidden'));
  expect((await call('POST')).status).toBe(403);
  mockRequire.mockRejectedValueOnce(new AppError(401, 'Missing authorization header'));
  expect((await call('POST')).status).toBe(401);
  expect(mockRpc).not.toHaveBeenCalled();
});

it('rejects other methods and bad ids', async () => {
  expect((await call('DELETE')).status).toBe(405);
  expect((await call('POST', 'not-a-uuid')).status).toBe(400);
});

it("only finds set lists in the caller's own band", async () => {
  setList = null;
  const res = await call('POST');
  expect(res.status).toBe(404);
  expect(mockFilters).toContainEqual(['set_lists', 'act_id', 'act-1']);
  expect(mockRpc).not.toHaveBeenCalled();
});

it('refuses to push a template', async () => {
  setList = { ...setList, booking_id: null };
  const res = await call('POST');
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('TEMPLATE_NOT_PUSHABLE');
});

it('GET returns how many members will be told, without publishing', async () => {
  await expect(call('GET')).resolves.toEqual({ status: 200, body: { data: { recipients: 2 } } });
  expect(mockRecipients).toHaveBeenCalledWith(mockService, 'b1', 'admin-1');
  expect(mockRpc).not.toHaveBeenCalled();
});

it('publishes as the caller and delivers to the lineup', async () => {
  const res = await call('POST');
  expect(res).toEqual({ status: 200, body: { data: { version: 1, changed: true, notified: 2, pushed: 3, pushFailed: 0 } } });
  // The RPC runs on a client carrying the caller's token, not the service role.
  expect(mockCreateClient.mock.calls[0][2]).toEqual(expect.objectContaining({ global: { headers: { Authorization: 'Bearer user-token' } } }));
  expect(mockRpc).toHaveBeenCalledWith('publish_set_list', { p_set_list_id: SL_ID });
  expect(mockDeliver).toHaveBeenCalledWith(mockService, expect.objectContaining({
    actId: 'act-1', setListId: SL_ID, bookingId: 'b1', version: 1,
    text: { title: 'New set list: The Blue Moose', body: 'Friday set is ready. The Blue Moose · Sat, Nov 14' },
  }));
});

it('notifies nobody when nothing changed since the last push', async () => {
  mockRpc.mockResolvedValue({ data: { set_list_id: SL_ID, version: 4, published_at: 'x', changed: false }, error: null });
  const res = await call('POST');
  expect(res).toEqual({ status: 200, body: { data: { version: 4, changed: false, notified: 0, pushed: 0, pushFailed: 0 } } });
  expect(mockDeliver).not.toHaveBeenCalled();
});

it('maps database refusals and failures', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Not authorized' } });
  expect((await call('POST')).status).toBe(403);
  mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'boom' } });
  const res = await call('POST');
  expect(res.status).toBe(500);
  expect(res.body.error.code).toBe('PUBLISH_FAILED');
  expect(mockDeliver).not.toHaveBeenCalled();
});

it('fails safely when the lineup cannot be read', async () => {
  mockRecipients.mockRejectedValue(new Error('down'));
  expect((await call('POST')).status).toBe(500);
  expect(mockRpc).not.toHaveBeenCalled();
});
