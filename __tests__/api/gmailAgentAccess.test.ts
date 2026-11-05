// __tests__/api/gmailAgentAccess.test.ts
//
// The Settings switch: admins only, band from the profile, needs connected Gmail.
import type { NextApiRequest, NextApiResponse } from 'next';

const mockUpdateEq = jest.fn(async (..._a: unknown[]) => ({ error: null }));
const mockUpdate = jest.fn((_row: unknown) => ({ eq: mockUpdateEq }));
let act: Record<string, unknown> | null;
const mockService = { from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: act, error: null }) }) }),
  update: mockUpdate,
}) };
const mockRequire = jest.fn();
jest.mock('../../lib/supabase', () => ({ getServiceClient: () => mockService }));
jest.mock('../../lib/server/requireBandAdmin', () => ({ requireBandAdmin: (...a: unknown[]) => mockRequire(...a) }));

import handler from '../../pages/api/gmail/agent-access';
import { AppError } from '../../lib/apiError';

const call = async (method: string, body?: unknown) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), setHeader: jest.fn() };
  await handler({ method, body, headers: {} } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return { status: res.status.mock.calls[0][0] as number, body: res.json.mock.calls[0][0] as Record<string, unknown> };
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  act = { gmail_address: 'a@x.com', agent_gmail_access: false };
  mockRequire.mockResolvedValue({ actId: 'act-1', userId: 'u', role: 'band_admin' });
});

it('refuses members', async () => {
  mockRequire.mockRejectedValue(new AppError(403, 'Forbidden'));
  expect((await call('PUT', { enabled: true })).status).toBe(403);
  expect(mockUpdate).not.toHaveBeenCalled();
});

it('reads the setting', async () => {
  await expect(call('GET')).resolves.toEqual({ status: 200, body: { enabled: false } });
});

it("saves to the caller's band, ignoring any band in the body", async () => {
  await expect(call('PUT', { enabled: true })).resolves.toEqual({ status: 200, body: { enabled: true } });
  expect(mockUpdateEq).toHaveBeenCalledWith('id', 'act-1');
  expect((await call('PUT', { enabled: true, act_id: 'other' })).status).toBe(400);
});

it('needs connected Gmail to switch on, but not off', async () => {
  act = { gmail_address: null, agent_gmail_access: true };
  expect((await call('PUT', { enabled: true })).status).toBe(409);
  expect((await call('PUT', { enabled: false })).status).toBe(200);
});

it('rejects other methods', async () => {
  expect((await call('DELETE')).status).toBe(405);
});
