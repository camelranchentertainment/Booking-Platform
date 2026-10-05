// __tests__/api/agentRoutesRoleGuard.test.ts
//
// The three agent routes use the service-role client (bypasses RLS), so they
// must refuse Members server-side. Each test drives the real handler with a
// mocked caller and asserts a Member gets 403 before any data work happens.

const mockGetUser = jest.fn();
let mockProfile: Record<string, unknown> | null = null;
const mockFrom = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

jest.mock('../../lib/supabase', () => ({
  getServiceClient: () => ({ from: mockFrom, auth: { getUser: mockGetUser } }),
}));

jest.mock('../../lib/platformSettings', () => ({ getSetting: jest.fn().mockResolvedValue('key') }));
jest.mock('../../lib/emailSend', () => ({ sendActEmail: jest.fn() }));
jest.mock('../../lib/calendarSync', () => ({ syncBookingToGoogleCalendar: jest.fn() }));
jest.mock('@anthropic-ai/sdk', () => {
  class Anthropic { messages = { create: jest.fn() }; }
  return { __esModule: true, default: Anthropic };
});

import type { NextApiRequest, NextApiResponse } from 'next';
import agentHandler from '../../pages/api/agent';
import bulkSendHandler from '../../pages/api/agent-bulk-send';
import executeHandler from '../../pages/api/help/actions/execute';
import { isBandAdminRole } from '../../lib/server/requireBandAdmin';

/** Profile lookups resolve to `mockProfile`; any other table records that data work started. */
const touchedTables: string[] = [];
function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'gt', 'lt', 'not', 'or', 'order', 'limit', 'ilike', 'update', 'insert', 'delete']) {
    c[m] = () => c;
  }
  c.single = () => Promise.resolve(result);
  c.maybeSingle = () => Promise.resolve(result);
  c.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => Promise.resolve(result).then(f, r);
  return c;
}

function req(body: Record<string, unknown>): NextApiRequest {
  return { method: 'POST', body, headers: { authorization: 'Bearer tok' } } as unknown as NextApiRequest;
}
function res() {
  const json = jest.fn();
  const end = jest.fn();
  const status = jest.fn().mockReturnValue({ json, end });
  return { r: { status, json, end } as unknown as NextApiResponse, status };
}

beforeEach(() => {
  touchedTables.length = 0;
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') return chain({ data: mockProfile, error: null });
    touchedTables.push(table);
    return chain({ data: [], error: null });
  });
});

const routes: Array<[string, (q: NextApiRequest, s: NextApiResponse) => unknown, Record<string, unknown>]> = [
  ['/api/agent', agentHandler, { message: 'hi', history: [] }],
  ['/api/agent-bulk-send', bulkSendHandler, { venues: [{ id: 'v1' }], subject: 's', body: 'b', actId: 'act-1' }],
  ['/api/help/actions/execute', executeHandler, { staged_action_id: 'sa-1' }],
];

describe.each(routes)('%s role guard', (_name, handler, body) => {
  it('refuses a Member with 403 before touching any band data', async () => {
    mockProfile = { act_id: 'act-1', role: 'member' };
    const { r, status } = res();
    await handler(req(body), r);
    expect(status).toHaveBeenCalledWith(403);
    expect(touchedTables).toEqual([]);
  });

  it('refuses a profile with no role', async () => {
    mockProfile = { act_id: 'act-1', role: null };
    const { r, status } = res();
    await handler(req(body), r);
    expect(status).toHaveBeenCalledWith(403);
  });

  it('lets a Band Admin past the guard', async () => {
    mockProfile = { act_id: 'act-1', role: 'band_admin' };
    const { r, status } = res();
    await Promise.resolve(handler(req(body), r)).catch(() => undefined);
    expect(status).not.toHaveBeenCalledWith(403);
  });
});

describe('isBandAdminRole', () => {
  it.each([
    ['band_admin', true],
    ['superadmin', true],
    ['member', false],
    [null, false],
    [undefined, false],
    ['Band_Admin', false],
  ])('%p → %p', (role, expected) => {
    expect(isBandAdminRole(role)).toBe(expected);
  });
});
