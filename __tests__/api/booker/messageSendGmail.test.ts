// __tests__/api/booker/messageSendGmail.test.ts
// With the agent's Gmail connected, the send route must use it (not the
// platform sender) and record sent_via = 'gmail'.

jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../../lib/server/bookerMailer', () => ({ deliverViaPlatform: jest.fn(), platformFromAddress: jest.fn().mockResolvedValue('booking@camelranchbooking.com') }));
jest.mock('../../../lib/server/bookerGmail', () => ({ getBookerGmail: jest.fn(), sendViaBookerGmail: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../../pages/api/booker/messages/send';
import { getServiceClient } from '../../../lib/supabase';
import { deliverViaPlatform } from '../../../lib/server/bookerMailer';
import { getBookerGmail, sendViaBookerGmail } from '../../../lib/server/bookerGmail';

function setup() {
  const inserts: Array<Record<string, unknown>> = [];
  const client = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
    from: jest.fn((table: string) => {
      const f: Record<string, unknown> = {};
      let head = false;
      let row: Record<string, unknown> | null = null;
      const b: Record<string, unknown> = {};
      b.select = (_c?: string, o?: { head?: boolean }) => ((head = Boolean(o?.head)), b);
      b.eq = (k: string, v: unknown) => ((f[k] = v), b);
      b.is = () => b;
      b.gte = () => b;
      b.insert = (r: Record<string, unknown>) => ((row = r), inserts.push(r), b);
      b.maybeSingle = () => {
        if (table === 'booker_profiles' && 'user_id' in f) return Promise.resolve({ data: { id: 'bk-1' }, error: null });
        if (table === 'booker_profiles') return Promise.resolve({ data: { agency_name: 'Lone Star Booking', contact_email: null }, error: null });
        if (table === 'profiles') return Promise.resolve({ data: { email: 'agent@hotmail.com' }, error: null });
        return Promise.resolve({ data: null, error: null });
      };
      b.single = () => Promise.resolve({ data: { id: 'm-1', ...row }, error: null });
      b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(head ? { count: 0, error: null } : { data: null, error: null }).then(ok, bad);
      return b;
    }),
  };
  (getServiceClient as jest.Mock).mockReturnValue(client);
  return { inserts };
}

beforeEach(() => jest.clearAllMocks());

it('sends from the connected Gmail and records it', async () => {
  const { inserts } = setup();
  (getBookerGmail as jest.Mock).mockResolvedValue({ booker_id: 'bk-1', gmail_address: 'pat@gmail.com', google_refresh_token: 'rt' });
  (sendViaBookerGmail as jest.Mock).mockResolvedValue({ providerMessageId: 'g-1', fromAddress: 'pat@gmail.com' });
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  await handler(
    { method: 'POST', headers: { authorization: 'Bearer t' }, body: { to_email: 'sarah@venue.com', subject: 'Hi', body: 'Hello' } } as unknown as NextApiRequest,
    { status, json, setHeader: jest.fn() } as unknown as NextApiResponse,
  );
  expect(status).toHaveBeenCalledWith(200);
  expect(deliverViaPlatform).not.toHaveBeenCalled();
  expect((sendViaBookerGmail as jest.Mock).mock.calls[0][2]).toMatchObject({ displayName: 'Lone Star Booking', to: 'sarah@venue.com', subject: 'Hi' });
  expect(inserts[0]).toMatchObject({ booker_id: 'bk-1', sent_via: 'gmail', from_address: 'pat@gmail.com', reply_to: 'pat@gmail.com', provider_message_id: 'g-1', status: 'sent' });
});
