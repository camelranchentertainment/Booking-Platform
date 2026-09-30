jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));

import handler from '../../../pages/api/social/announcements';
import { getServiceClient } from '../../../lib/supabase';
import type { NextApiRequest, NextApiResponse } from 'next';

// ── Request / response helpers ───────────────────────────────────────────────

function mockReq(
  method: string,
  {
    body = {},
    query = {},
    token = 'valid-token' as string | null,
  }: { body?: Record<string, unknown>; query?: Record<string, string>; token?: string | null } = {},
): NextApiRequest {
  return {
    method,
    body,
    query,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as NextApiRequest;
}

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as NextApiResponse;
  return { res, status, json };
}

// ── Supabase chain factories ──────────────────────────────────────────────────

/** A fluent chain where all methods return `this`, and awaiting returns `resolveWith`. */
function makeChain(resolveWith: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'limit', 'order']) {
    (chain as Record<string, jest.Mock>)[m] = jest.fn().mockReturnValue(chain);
  }
  (chain as Record<string, jest.Mock>)['single'] = jest.fn().mockResolvedValue(resolveWith);
  // Makes `await chain` resolve (used when query is awaited without .single())
  (chain as { then: Function })['then'] = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(resolveWith).then(onFulfilled, onRejected);
  return chain as Record<string, jest.Mock> & { then: Function };
}

/** A chain returned by .update(); awaiting it resolves with `resolveWith`. */
function makeUpdateChain(resolveWith: unknown) {
  const then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(resolveWith).then(onFulfilled, onRejected);
  return { eq: jest.fn().mockReturnValue({ then }), then };
}

// ── Service mock builder ──────────────────────────────────────────────────────

interface ServiceConfig {
  authFails?: boolean;
  callerRole?: string;
  callerActId?: string | null;
  /** Ordered list of (table, result) pairs for each from() call after profiles */
  fromCalls?: Array<{ isUpdate?: boolean; result: unknown }>;
}

function buildService({
  authFails = false,
  callerRole = 'band_admin',
  callerActId = 'act-123',
  fromCalls = [],
}: ServiceConfig = {}) {
  const authResult = authFails
    ? { data: { user: null }, error: new Error('invalid') }
    : { data: { user: { id: 'user-abc' } }, error: null };

  const profileResult = { data: { role: callerRole, act_id: callerActId }, error: null };

  const fromMock = jest.fn();
  // First call is always profiles (requireBandAdmin)
  fromMock.mockReturnValueOnce(makeChain(profileResult));

  for (const call of fromCalls) {
    if (call.isUpdate) {
      fromMock.mockReturnValueOnce({ update: jest.fn().mockReturnValue(makeUpdateChain(call.result)) });
    } else {
      fromMock.mockReturnValueOnce(makeChain(call.result));
    }
  }

  return {
    auth: { getUser: jest.fn().mockResolvedValue(authResult) },
    from: fromMock,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => jest.clearAllMocks());

describe('405', () => {
  it('returns 405 for DELETE', async () => {
    const svc = buildService();
    (getServiceClient as jest.Mock).mockReturnValue(svc);
    const { res, status } = mockRes();
    await handler(mockReq('DELETE'), res);
    expect(status).toHaveBeenCalledWith(405);
  });
});

describe('401', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const svc = buildService({ authFails: false });
    (getServiceClient as jest.Mock).mockReturnValue(svc);
    const { res, status } = mockRes();
    await handler(mockReq('GET', { token: null }), res);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when token is invalid', async () => {
    const svc = buildService({ authFails: true });
    (getServiceClient as jest.Mock).mockReturnValue(svc);
    const { res, status } = mockRes();
    await handler(mockReq('GET', { token: 'bad-token' }), res);
    expect(status).toHaveBeenCalledWith(401);
  });
});

describe('403', () => {
  it('returns 403 for member role', async () => {
    const svc = buildService({ callerRole: 'member' });
    (getServiceClient as jest.Mock).mockReturnValue(svc);
    const { res, status } = mockRes();
    await handler(mockReq('GET'), res);
    expect(status).toHaveBeenCalledWith(403);
  });
});

describe('GET /api/social/announcements', () => {
  it('scopes query to caller act_id', async () => {
    const announcementChain = makeChain({ data: [], error: null });
    const fromMock = jest.fn()
      .mockReturnValueOnce(makeChain({ data: { role: 'band_admin', act_id: 'act-123' }, error: null }))
      .mockReturnValueOnce(announcementChain);
    const svc = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u' } }, error: null }) },
      from: fromMock,
    };
    (getServiceClient as jest.Mock).mockReturnValue(svc);

    const { res, status, json } = mockRes();
    await handler(mockReq('GET'), res);

    expect(announcementChain.eq).toHaveBeenCalledWith('act_id', 'act-123');
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ data: [] });
  });

  it('defaults to active (ready+drafting) filter', async () => {
    const announcementChain = makeChain({ data: [], error: null });
    const fromMock = jest.fn()
      .mockReturnValueOnce(makeChain({ data: { role: 'band_admin', act_id: 'act-123' }, error: null }))
      .mockReturnValueOnce(announcementChain);
    const svc = {
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u' } }, error: null }) },
      from: fromMock,
    };
    (getServiceClient as jest.Mock).mockReturnValue(svc);

    await handler(mockReq('GET'), mockRes().res);

    expect(announcementChain.in).toHaveBeenCalledWith('status', ['ready', 'drafting']);
  });
});

describe('PATCH /api/social/announcements', () => {
  it('returns 400 for a missing action field', async () => {
    const svc = buildService();
    (getServiceClient as jest.Mock).mockReturnValue(svc);
    const { res, status } = mockRes();
    await handler(mockReq('PATCH', { body: { id: '00000000-0000-4000-8000-000000000001' } }), res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for a non-UUID id', async () => {
    const svc = buildService();
    (getServiceClient as jest.Mock).mockReturnValue(svc);
    const { res, status } = mockRes();
    await handler(mockReq('PATCH', { body: { id: 'not-a-uuid', action: 'dismiss' } }), res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when the announcement belongs to another act', async () => {
    const svc = buildService({
      fromCalls: [
        // select returns no row (act_id guard)
        { result: { data: null, error: { message: 'no rows' } } },
      ],
    });
    (getServiceClient as jest.Mock).mockReturnValue(svc);
    const { res, status } = mockRes();
    await handler(
      mockReq('PATCH', { body: { id: '00000000-0000-4000-8000-000000000002', action: 'dismiss' } }),
      res,
    );
    expect(status).toHaveBeenCalledWith(404);
  });

  it('dismiss: returns 200 and updates status to dismissed', async () => {
    const svc = buildService({
      fromCalls: [
        // select returns a ready row
        { result: { data: { id: 'ann-1', status: 'ready', dismissed_reason: null, booking_id: 'bk-1' }, error: null } },
        // update succeeds
        { isUpdate: true, result: { data: null, error: null } },
      ],
    });
    (getServiceClient as jest.Mock).mockReturnValue(svc);
    const { res, status, json } = mockRes();
    await handler(
      mockReq('PATCH', { body: { id: '00000000-0000-4000-8000-000000000003', action: 'dismiss' } }),
      res,
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ ok: true });
  });

  it('dismiss: returns 409 when announcement is already posted', async () => {
    const svc = buildService({
      fromCalls: [
        { result: { data: { id: 'ann-1', status: 'posted', dismissed_reason: null, booking_id: 'bk-1' }, error: null } },
      ],
    });
    (getServiceClient as jest.Mock).mockReturnValue(svc);
    const { res, status } = mockRes();
    await handler(
      mockReq('PATCH', { body: { id: '00000000-0000-4000-8000-000000000004', action: 'dismiss' } }),
      res,
    );
    expect(status).toHaveBeenCalledWith(409);
  });

  it('restore: returns 200 when booking is confirmed', async () => {
    const svc = buildService({
      fromCalls: [
        // select returns a user-dismissed row
        {
          result: {
            data: { id: 'ann-1', status: 'dismissed', dismissed_reason: 'user', booking_id: 'bk-1' },
            error: null,
          },
        },
        // booking is confirmed
        { result: { data: { status: 'confirmed' }, error: null } },
        // update succeeds
        { isUpdate: true, result: { data: null, error: null } },
      ],
    });
    (getServiceClient as jest.Mock).mockReturnValue(svc);
    const { res, status, json } = mockRes();
    await handler(
      mockReq('PATCH', { body: { id: '00000000-0000-4000-8000-000000000005', action: 'restore' } }),
      res,
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ ok: true });
  });

  it('restore: returns 409 when booking is no longer confirmed', async () => {
    const svc = buildService({
      fromCalls: [
        {
          result: {
            data: { id: 'ann-1', status: 'dismissed', dismissed_reason: 'user', booking_id: 'bk-1' },
            error: null,
          },
        },
        // booking is cancelled
        { result: { data: { status: 'cancelled' }, error: null } },
      ],
    });
    (getServiceClient as jest.Mock).mockReturnValue(svc);
    const { res, status } = mockRes();
    await handler(
      mockReq('PATCH', { body: { id: '00000000-0000-4000-8000-000000000006', action: 'restore' } }),
      res,
    );
    expect(status).toHaveBeenCalledWith(409);
  });

  it('restore: returns 409 when dismissed_reason is booking_cancelled (not user)', async () => {
    const svc = buildService({
      fromCalls: [
        {
          result: {
            data: {
              id: 'ann-1',
              status: 'dismissed',
              dismissed_reason: 'booking_cancelled',
              booking_id: 'bk-1',
            },
            error: null,
          },
        },
      ],
    });
    (getServiceClient as jest.Mock).mockReturnValue(svc);
    const { res, status } = mockRes();
    await handler(
      mockReq('PATCH', { body: { id: '00000000-0000-4000-8000-000000000007', action: 'restore' } }),
      res,
    );
    expect(status).toHaveBeenCalledWith(409);
  });
});
