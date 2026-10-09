// __tests__/api/membersInvite.test.ts
jest.mock('../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../lib/server/memberInvite', () => {
  const actual = jest.requireActual('../../lib/server/memberInvite');
  return { ...actual, createAndSendInvite: jest.fn().mockResolvedValue({ emailSent: true }) };
});

import handler from '../../pages/api/members/invite';
import { getServiceClient } from '../../lib/supabase';
import { createAndSendInvite } from '../../lib/server/memberInvite';
import type { NextApiRequest, NextApiResponse } from 'next';

const ACT = 'act-1';

function setup(opts: { role?: string; actId?: string; personnelFound?: boolean } = {}) {
  const from = (t: string) => {
    const c: any = {};
    c.select = () => c;
    c.eq = () => c;
    c.single = () => Promise.resolve({ data: t === 'profiles' ? { act_id: opts.actId ?? ACT, role: opts.role ?? 'band_admin', display_name: 'Scott' } : null });
    c.maybeSingle = () => Promise.resolve({ data: opts.personnelFound === false ? null : { id: 'p1' } });
    return c;
  };
  (getServiceClient as jest.Mock).mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1', email: 'u@x.com' } } }) },
    from,
  });
}
async function call(body: Record<string, unknown>) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const req = { method: 'POST', headers: { authorization: 'Bearer t' }, body } as unknown as NextApiRequest;
  await handler(req, { status, json, end: jest.fn() } as unknown as NextApiResponse);
  return { status, json };
}

beforeEach(() => jest.clearAllMocks());

describe('/api/members/invite', () => {
  it('refuses a band member trying to invite (incl. as admin)', async () => {
    setup({ role: 'member' });
    const { status } = await call({ actId: ACT, email: 'new@x.com', role: 'band_admin' });
    expect(status).toHaveBeenCalledWith(403);
    expect(createAndSendInvite).not.toHaveBeenCalled();
  });

  it('refuses another band', async () => {
    setup({ actId: 'other' });
    const { status } = await call({ actId: ACT, email: 'new@x.com', role: 'member' });
    expect(status).toHaveBeenCalledWith(403);
  });

  it('refuses a roster person from another band', async () => {
    setup({ personnelFound: false });
    const { status } = await call({ actId: ACT, email: 'new@x.com', role: 'member', personnel_id: 'p-other' });
    expect(status).toHaveBeenCalledWith(403);
    expect(createAndSendInvite).not.toHaveBeenCalled();
  });

  it('lets an admin invite, forcing member role for roster invites', async () => {
    setup();
    const { status, json } = await call({ actId: ACT, email: ' New@X.com ', role: 'band_admin', personnel_id: 'p1' });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ ok: true, emailSent: true });
    expect((createAndSendInvite as jest.Mock).mock.calls[0][1]).toMatchObject({ actId: ACT, email: 'new@x.com', role: 'member', personnelId: 'p1' });
  });

  it('rejects a malformed email', async () => {
    setup();
    const { status } = await call({ actId: ACT, email: 'nope', role: 'member' });
    expect(status).toHaveBeenCalledWith(400);
  });
});
