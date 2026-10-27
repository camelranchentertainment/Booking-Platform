// __tests__/api/bookingRoutesRoleGuard.test.ts
//
// /api/bookings/{settle,move-status,update} use the service-role client
// (RLS bypassed). Members used to be able to call all three — mark shows
// paid, change status, or rewrite any field. These drive the real handlers
// with a mocked caller and assert Members get 403 before any booking work,
// and that update can't move a show to another band or set unlisted fields.

const mockGetUser = jest.fn();
let mockProfile: Record<string, unknown> | null = null;
let mockBooking: Record<string, unknown> | null = null;
const mockFrom = jest.fn();
const updates: Array<{ table: string; values: unknown }> = [];

jest.mock('../../lib/supabase', () => ({
  getServiceClient: () => ({ from: mockFrom, auth: { getUser: mockGetUser } }),
}));
jest.mock('../../lib/calendarSync', () => ({ syncBookingToGoogleCalendar: jest.fn() }));
jest.mock('../../lib/statusSync', () => ({ updateBookingStatus: jest.fn() }));
jest.mock('../../lib/notifications', () => ({ notifyActMembers: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import type { NextApiRequest, NextApiResponse } from 'next';
import settleHandler from '../../pages/api/bookings/settle';
import moveStatusHandler from '../../pages/api/bookings/move-status';
import updateHandler from '../../pages/api/bookings/update';
import { updateBookingStatus } from '../../lib/statusSync';

const touchedTables: string[] = [];
function chain(table: string, result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'order', 'limit', 'insert', 'delete']) c[m] = () => c;
  c.update = (values: unknown) => {
    updates.push({ table, values });
    return c;
  };
  c.single = () => Promise.resolve(result);
  c.maybeSingle = () => Promise.resolve(result);
  c.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => Promise.resolve({ error: null }).then(f, r);
  return c;
}

function req(body: Record<string, unknown>): NextApiRequest {
  return { method: 'POST', body, headers: { authorization: 'Bearer tok' } } as unknown as NextApiRequest;
}
function res() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json, end: jest.fn() });
  return { r: { status, json } as unknown as NextApiResponse, status, json };
}

beforeEach(() => {
  touchedTables.length = 0;
  updates.length = 0;
  mockBooking = { id: 'b1', act_id: 'act-1', venue_id: null, show_date: '2026-11-20', venue: { name: 'X' } };
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') return chain(table, { data: mockProfile, error: null });
    touchedTables.push(table);
    if (table === 'bookings') return chain(table, { data: mockBooking, error: null });
    return chain(table, { data: { id: 'x' }, error: null });
  });
  (updateBookingStatus as jest.Mock).mockReset();
});

const routes: Array<[string, (q: NextApiRequest, s: NextApiResponse) => unknown, Record<string, unknown>]> = [
  ['settle', settleHandler, { bookingId: 'b1', actual_amount_received: '500' }],
  ['move-status', moveStatusHandler, { bookingId: 'b1', status: 'completed' }],
  ['update', updateHandler, { bookingId: 'b1', updates: { status: 'confirmed' } }],
];

describe.each(routes)('/api/bookings/%s', (_name, handler, body) => {
  it('refuses a Member with 403 before touching bookings', async () => {
    mockProfile = { act_id: 'act-1', role: 'member' };
    const { r, status } = res();
    await handler(req(body), r);
    expect(status).toHaveBeenCalledWith(403);
    expect(touchedTables).toEqual([]);
  });

  it('lets a band admin through', async () => {
    mockProfile = { act_id: 'act-1', role: 'band_admin' };
    const { r, status } = res();
    await handler(req(body), r);
    expect(status).toHaveBeenCalledWith(200);
  });

  it('404s a show outside the admin’s band', async () => {
    mockProfile = { act_id: 'act-1', role: 'band_admin' };
    mockBooking = null;
    const { r, status } = res();
    await handler(req(body), r);
    expect(status).toHaveBeenCalledWith(404);
  });
});

describe('/api/bookings/update field rules', () => {
  beforeEach(() => {
    mockProfile = { act_id: 'act-1', role: 'band_admin' };
  });

  it('refuses moving a show to another band', async () => {
    const { r, status } = res();
    await updateHandler(req({ bookingId: 'b1', updates: { act_id: 'act-2', status: 'confirmed' } }), r);
    expect(status).toHaveBeenCalledWith(400);
    expect(updates).toEqual([]);
  });

  it('writes only allowlisted fields', async () => {
    const { r, status } = res();
    await updateHandler(
      req({ bookingId: 'b1', updates: { act_id: 'act-1', status: 'confirmed', actual_amount_received: 9999, created_by: 'z' } }),
      r
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(updates).toEqual([{ table: 'bookings', values: { status: 'confirmed' } }]);
  });
});

describe('/api/bookings/settle amounts', () => {
  beforeEach(() => {
    mockProfile = { act_id: 'act-1', role: 'band_admin' };
  });

  it('keeps a real $0 instead of nulling it', async () => {
    const { r } = res();
    await settleHandler(req({ bookingId: 'b1', actual_amount_received: 0 }), r);
    const write = updates.find(u => u.table === 'bookings');
    expect(write?.values).toMatchObject({ actual_amount_received: 0, status: 'completed', settled_by: 'u1' });
  });

  it('400s a nonsense amount', async () => {
    const { r, status } = res();
    await settleHandler(req({ bookingId: 'b1', actual_amount_received: 'lots' }), r);
    expect(status).toHaveBeenCalledWith(400);
  });
});
