// __tests__/api/email/gmailSync.test.ts
jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../../lib/gmailClient', () => ({ getGmailClient: jest.fn() }));
jest.mock('../../../lib/notifications', () => ({ notifyActMembers: jest.fn().mockResolvedValue(undefined) }));

import handler from '../../../pages/api/email/gmail-sync';
import { getServiceClient } from '../../../lib/supabase';
import { getGmailClient } from '../../../lib/gmailClient';
import { notifyActMembers } from '../../../lib/notifications';
import type { NextApiRequest, NextApiResponse } from 'next';

const ACT = 'act-1';
const USER = 'user-1';

function mockReq(method = 'POST', body: unknown = { trigger: 'auto' }, token: string | null = 'tok'): NextApiRequest {
  return {
    method,
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as NextApiRequest;
}

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as NextApiResponse, status, json };
}

/**
 * Fluent, awaitable query chain. Every builder method returns the chain;
 * awaiting it (or .single()/.maybeSingle()) resolves to `result`.
 */
function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'or', 'not', 'order', 'limit', 'update', 'insert']) {
    c[m] = jest.fn(() => c);
  }
  c.single = jest.fn(() => Promise.resolve(result));
  c.maybeSingle = jest.fn(() => Promise.resolve(result));
  c.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => Promise.resolve(result).then(f, r);
  return c as Record<string, jest.Mock> & { then: unknown };
}

interface Setup {
  role?: string;
  actId?: string | null;
  authOk?: boolean;
  claim?: 'won' | 'lost' | 'error';
  existingIds?: string[];
  /** Extra venues returned by the (act-scoped) venues query. */
  venues?: Array<{ id: string; name: string; email: string; secondary_emails: string[] }>;
  /** Sender for the m-stranger message. */
  strangerFrom?: string;
}

function setup({
  role = 'band_admin', actId = ACT, authOk = true, claim = 'won', existingIds = [],
  venues = [], strangerFrom = 'Fan <fan@elsewhere.org>',
}: Setup = {}) {
  const inserts: unknown[] = [];
  const emailLogInQueries: string[][] = [];
  const venueFilters: Array<[string, unknown]> = [];

  const from = jest.fn((table: string) => {
    switch (table) {
      case 'profiles':
        return chain({ data: { act_id: actId, role }, error: null });
      case 'act_credentials': {
        const c = chain({ data: null, error: null });
        c.update = jest.fn(() => {
          const u = chain(
            claim === 'won'
              ? { data: { gmail_last_sync_at: 'now' }, error: null }
              : claim === 'error'
                ? { data: null, error: { message: 'column missing' } }
                : { data: null, error: null },
          );
          return u;
        });
        c.maybeSingle = jest.fn(() => Promise.resolve({ data: { gmail_last_sync_at: '2026-10-02T12:00:00.000Z' }, error: null }));
        return c;
      }
      case 'venues': {
        const c = chain({
          data: [{ id: 'v1', name: 'The Venue', email: 'booker@venue.com', secondary_emails: [] }, ...venues],
          error: null,
        });
        c.eq = jest.fn((col: string, val: unknown) => { venueFilters.push([col, val]); return c; });
        return c;
      }
      case 'contacts':
        return chain({ data: [], error: null });
      case 'tour_venues':
        return chain({ data: [], error: null });
      case 'email_log': {
        const c = chain({ data: existingIds.map(id => ({ message_id: id })), error: null });
        c.in = jest.fn((_col: string, ids: string[]) => { emailLogInQueries.push(ids); return c; });
        c.insert = jest.fn((row: unknown) => { inserts.push(row); return chain({ error: null }); });
        return c;
      }
      default:
        return chain({ data: null, error: null });
    }
  });

  (getServiceClient as jest.Mock).mockReturnValue({
    from,
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: authOk ? { id: USER } : null } }) },
  });

  const list = jest.fn().mockResolvedValue({ data: { messages: [{ id: 'm-old' }, { id: 'm-new' }, { id: 'm-stranger' }] } });
  const get = jest.fn(({ id }: { id: string }) => Promise.resolve({
    data: {
      internalDate: '1759406400000',
      payload: {
        headers: [
          { name: 'From', value: id === 'm-stranger' ? strangerFrom : 'Booker <booker@venue.com>' },
          { name: 'Subject', value: `Re: ${id}` },
        ],
        body: { data: Buffer.from('hello').toString('base64') },
      },
    },
  }));
  (getGmailClient as jest.Mock).mockResolvedValue({
    gmail: { users: { messages: { list, get } } },
    gmailAddress: 'band@example.com',
  });

  return { from, list, get, inserts, emailLogInQueries, venueFilters };
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/email/gmail-sync', () => {
  it('rejects non-POST with a structured error', async () => {
    setup();
    const { res, status, json } = mockRes();
    await handler(mockReq('GET'), res);
    expect(status).toHaveBeenCalledWith(405);
    expect(json).toHaveBeenCalledWith({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
  });

  it('rejects a missing token', async () => {
    setup();
    const { res, status } = mockRes();
    await handler(mockReq('POST', {}, null), res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('forbids Members', async () => {
    setup({ role: 'member' });
    const { res, status, json } = mockRes();
    await handler(mockReq(), res);
    expect(status).toHaveBeenCalledWith(403);
    expect(json.mock.calls[0][0].error.code).toBe('FORBIDDEN');
  });

  it('returns GMAIL_NOT_CONNECTED (409) when the act has no Gmail tokens', async () => {
    setup();
    (getGmailClient as jest.Mock).mockRejectedValueOnce(new Error('Gmail not connected for this act'));
    const { res, status, json } = mockRes();
    await handler(mockReq(), res);
    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0][0].error.code).toBe('GMAIL_NOT_CONNECTED');
  });

  it('returns throttled without touching Gmail when another sync just ran', async () => {
    const { list } = setup({ claim: 'lost' });
    const { res, status, json } = mockRes();
    await handler(mockReq(), res);
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      ok: true, status: 'throttled', imported: 0, last_synced_at: '2026-10-02T12:00:00.000Z',
    }));
    expect(list).not.toHaveBeenCalled();
  });

  it('fails open (still syncs) if the throttle column is missing', async () => {
    const { list } = setup({ claim: 'error' });
    const { res, status } = mockRes();
    await handler(mockReq(), res);
    expect(list).toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(200);
  });

  it('de-dupes in one query, imports only new venue mail, counts strangers as unmatched', async () => {
    const { get, inserts, emailLogInQueries } = setup({ existingIds: ['m-old'] });
    const { res, json } = mockRes();
    await handler(mockReq('POST', { trigger: 'manual' }), res);

    expect(emailLogInQueries).toEqual([['m-old', 'm-new', 'm-stranger']]);
    expect(get).toHaveBeenCalledTimes(2); // m-old never fetched
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual(expect.objectContaining({ message_id: 'm-new', act_id: ACT, direction: 'received' }));
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      ok: true, status: 'synced', imported: 1, skipped: 1, unmatched: 1, scanned: 3,
    }));
    expect(notifyActMembers).toHaveBeenCalledTimes(1);
  });

  it('matches only against the caller\'s band\'s venues', async () => {
    const { venueFilters } = setup();
    const { res } = mockRes();
    await handler(mockReq(), res);
    expect(venueFilters).toContainEqual(['act_id', ACT]);
  });

  it('does not tag an unknown gmail.com sender as the venue that happens to use gmail', async () => {
    const { inserts } = setup({
      venues: [{ id: 'v-max', name: "Maxine's Tap Room", email: 'maxinesonblock@gmail.com', secondary_emails: [] }],
      strangerFrom: 'Cindy <cindyawill3@gmail.com>',
    });
    const { res, json } = mockRes();
    await handler(mockReq(), res);
    expect(inserts.map(r => (r as { venue_id: string }).venue_id)).not.toContain('v-max');
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ unmatched: 1 }));
  });

  it('maps Google credential failures to GMAIL_AUTH_FAILED', async () => {
    const { list } = setup();
    list.mockRejectedValueOnce(new Error('invalid_grant'));
    const { res, status, json } = mockRes();
    await handler(mockReq(), res);
    expect(status).toHaveBeenCalledWith(502);
    expect(json.mock.calls[0][0].error.code).toBe('GMAIL_AUTH_FAILED');
  });
});
