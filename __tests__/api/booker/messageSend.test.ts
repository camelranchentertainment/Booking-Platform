// __tests__/api/booker/messageSend.test.ts
// The send route runs with the service role, so it must scope everything to the
// caller's agent profile itself, rate-limit, and never forge history. Agents
// send only through their own connected Gmail; there is no platform sender.

jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../../lib/server/bookerGmail', () => ({ getBookerGmail: jest.fn(), sendViaBookerGmail: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../../pages/api/booker/messages/send';
import { getServiceClient } from '../../../lib/supabase';
import { getBookerGmail, sendViaBookerGmail } from '../../../lib/server/bookerGmail';
import { AppError } from '../../../lib/apiError';

const BOOKER = 'bk-1';
const VENUE = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
const CONTACT = '4a3b2c1d-1111-4e8a-9c21-7d4e5f6a8b91';
const SHOW = '5b4c3d2e-2222-4e8a-9c21-7d4e5f6a8b92';
const ROSTER = '6c5d4e3f-3333-4e8a-9c21-7d4e5f6a8b93';
const GMAIL = { booker_id: BOOKER, gmail_address: 'pat@gmail.com', google_refresh_token: 'rt', google_access_token: null, access_expires_at: null, connected_at: '2026-10-01T00:00:00Z' };

type Row = Record<string, unknown>;

interface World {
  booker?: Row | null;
  rows?: Record<string, Row[]>;
  recentCount?: number;
  insertError?: { code: string } | null;
}

/** Fake service client: filters are applied for real so cross-agent rows are invisible. */
function setup(world: World = {}) {
  const inserts: Row[] = [];
  const lookups: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const rows = world.rows ?? {};
  const client = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
    from: jest.fn((table: string) => {
      const filters: Record<string, unknown> = {};
      let head = false;
      let inserted: Row | null = null;
      const b: Record<string, unknown> = {};
      b.select = (_cols?: string, opts?: { head?: boolean }) => {
        head = Boolean(opts?.head);
        return b;
      };
      b.eq = (col: string, val: unknown) => {
        filters[col] = val;
        return b;
      };
      b.is = () => b;
      b.gte = () => b;
      b.insert = (row: Row) => {
        inserted = row;
        inserts.push({ table, ...row });
        return b;
      };
      b.maybeSingle = () => {
        lookups.push({ table, filters: { ...filters } });
        if (table === 'booker_profiles' && 'user_id' in filters) return Promise.resolve({ data: world.booker === undefined ? { id: BOOKER } : world.booker, error: null });
        if (table === 'booker_profiles') return Promise.resolve({ data: { agency_name: 'Lone "Star" Booking', contact_email: null }, error: null });
        if (table === 'profiles') return Promise.resolve({ data: { email: 'agent@hotmail.com' }, error: null });
        const match = (rows[table] ?? []).find(r => Object.entries(filters).every(([k, v]) => r[k] === v));
        return Promise.resolve({ data: match ?? null, error: null });
      };
      b.single = () => Promise.resolve(world.insertError ? { data: null, error: world.insertError } : { data: { id: 'msg-1', ...inserted }, error: null });
      b.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => {
        const result = head ? { count: world.recentCount ?? 0, error: null } : { data: null, error: null };
        return Promise.resolve(result).then(f, r);
      };
      return b;
    }),
  };
  (getServiceClient as jest.Mock).mockReturnValue(client);
  return { inserts, lookups };
}

function call(body: Record<string, unknown>) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const req = { method: 'POST', body, headers: { authorization: 'Bearer tok' } } as unknown as NextApiRequest;
  const res = { status, json, setHeader: jest.fn() } as unknown as NextApiResponse;
  return { run: () => handler(req, res), status, json };
}

const valid = { to_email: 'sarah@venue.com', to_name: 'Sarah', subject: 'Oct 24?', body: 'Hi <Sarah>\n\nAre you open?' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (getBookerGmail as jest.Mock).mockResolvedValue(GMAIL);
  (sendViaBookerGmail as jest.Mock).mockResolvedValue({ providerMessageId: 'g-123', fromAddress: 'pat@gmail.com' });
});

describe('POST /api/booker/messages/send', () => {
  it('rejects other methods', async () => {
    setup();
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    await handler({ method: 'GET', headers: {} } as unknown as NextApiRequest, { status, json, setHeader: jest.fn() } as unknown as NextApiResponse);
    expect(status).toHaveBeenCalledWith(405);
  });

  it('refuses a caller with no agent workspace and sends nothing', async () => {
    setup({ booker: null });
    const { run, status } = call(valid);
    await run();
    expect(status).toHaveBeenCalledWith(403);
    expect(sendViaBookerGmail).not.toHaveBeenCalled();
  });

  it('validates the body', async () => {
    setup();
    const { run, status, json } = call({ ...valid, to_email: 'not-an-email' });
    await run();
    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].error).toMatch(/valid email/);
    expect(sendViaBookerGmail).not.toHaveBeenCalled();
  });

  it('refuses to send (409) and logs nothing when Gmail is not connected', async () => {
    const { inserts } = setup();
    (getBookerGmail as jest.Mock).mockResolvedValue(null);
    const { run, status, json } = call(valid);
    await run();
    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0][0].error).toMatch(/Connect your Gmail/);
    expect(getBookerGmail).toHaveBeenCalledWith(expect.anything(), BOOKER);
    expect(sendViaBookerGmail).not.toHaveBeenCalled();
    expect(inserts.filter(i => i.table === 'booker_messages')).toHaveLength(0);
  });

  it("refuses to file an email under another agent's venue", async () => {
    // The venue exists, but under a different booker_id: the scoped lookup cannot see it.
    const { lookups } = setup({ rows: { booker_venues: [{ id: VENUE, booker_id: 'someone-else' }] } });
    const { run, status } = call({ ...valid, venue_id: VENUE });
    await run();
    expect(status).toHaveBeenCalledWith(400);
    expect(lookups.find(l => l.table === 'booker_venues')?.filters).toMatchObject({ id: VENUE, booker_id: BOOKER });
    expect(sendViaBookerGmail).not.toHaveBeenCalled();
  });

  it('enforces the hourly send limit', async () => {
    setup({ recentCount: 40 });
    const { run, status, json } = call(valid);
    await run();
    expect(status).toHaveBeenCalledWith(429);
    expect(json.mock.calls[0][0].error).toMatch(/last hour/);
    expect(sendViaBookerGmail).not.toHaveBeenCalled();
  });

  it("sends from the agent's Gmail with escaped HTML, and logs it with the links filled in", async () => {
    const { inserts } = setup({
      rows: {
        booker_contacts: [{ id: CONTACT, booker_id: BOOKER, venue_id: VENUE }],
        booker_venues: [{ id: VENUE, booker_id: BOOKER }],
        booker_shows: [{ id: SHOW, booker_id: BOOKER, roster_id: ROSTER, venue_id: VENUE }],
        booker_roster: [{ id: ROSTER, booker_id: BOOKER }],
      },
    });
    const { run, status, json } = call({ ...valid, contact_id: CONTACT, show_id: SHOW, followup_on: '2026-10-18', booker_id: 'spoofed', copy_to_self: true });
    await run();
    expect(status).toHaveBeenCalledWith(200);
    const [, gmailRow, email] = (sendViaBookerGmail as jest.Mock).mock.calls[0];
    expect(gmailRow).toBe(GMAIL);
    expect(email).toMatchObject({ displayName: 'Lone "Star" Booking', to: 'sarah@venue.com', subject: 'Oct 24?' });
    expect(email.html).toContain('Hi &lt;Sarah&gt;');
    const row = inserts.find(i => i.table === 'booker_messages')!;
    expect(row).toMatchObject({
      booker_id: BOOKER,
      contact_id: CONTACT,
      venue_id: VENUE,
      show_id: SHOW,
      roster_id: ROSTER,
      status: 'sent',
      sent_via: 'gmail',
      from_address: 'pat@gmail.com',
      reply_to: 'pat@gmail.com',
      provider_message_id: 'g-123',
      followup_on: '2026-10-18',
      // Gmail's Sent folder is the copy; the request's copy_to_self is not honoured as a second send.
      copy_to_self: false,
    });
    expect(json.mock.calls[0][0].message).toMatchObject({ id: 'msg-1' });
  });

  it('logs a failed attempt (without a follow-up) and reports the provider failure', async () => {
    const { inserts } = setup();
    (sendViaBookerGmail as jest.Mock).mockRejectedValue(new AppError(502, 'Gmail would not send this email. Check the address and try again.'));
    const { run, status } = call({ ...valid, followup_on: '2026-10-18' });
    await run();
    expect(status).toHaveBeenCalledWith(502);
    expect(inserts.find(i => i.table === 'booker_messages')).toMatchObject({ status: 'failed', followup_on: null, booker_id: BOOKER, sent_via: 'gmail', from_address: 'pat@gmail.com', error: expect.stringMatching(/Gmail would not send/) });
  });

  it('passes an expired Gmail connection through as 409 so the agent reconnects', async () => {
    setup();
    (sendViaBookerGmail as jest.Mock).mockRejectedValue(new AppError(409, 'Your Gmail connection has expired. Reconnect Gmail in Settings to send.'));
    const { run, status, json } = call(valid);
    await run();
    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0][0].error).toMatch(/Reconnect Gmail/);
  });

  it('says the email went out when only the history save fails, so the agent does not resend', async () => {
    setup({ insertError: { code: '57014' } });
    const { run, status, json } = call(valid);
    await run();
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toMatchObject({ message: null, warning: expect.stringMatching(/was sent/) });
  });

  it('rejects a show that belongs to a different band than the one chosen', async () => {
    setup({ rows: { booker_shows: [{ id: SHOW, booker_id: BOOKER, roster_id: 'other-band', venue_id: null }] } });
    const { run, status } = call({ ...valid, show_id: SHOW, roster_id: ROSTER });
    await run();
    expect(status).toHaveBeenCalledWith(400);
  });
});
