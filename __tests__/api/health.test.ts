import handler from '../../pages/api/health';
import type { NextApiRequest, NextApiResponse } from 'next';

jest.mock('../../lib/supabase', () => ({
  getServiceClient: jest.fn(),
}));

import { getServiceClient } from '../../lib/supabase';

function mockRes() {
  const inner = { json: jest.fn(), end: jest.fn() };
  const res = { status: jest.fn().mockReturnValue(inner) } as unknown as NextApiResponse;
  return { res, inner };
}

function req(query: Record<string, string> = {}, method = 'GET'): NextApiRequest {
  return { method, query } as unknown as NextApiRequest;
}

describe('GET /api/health (liveness)', () => {
  it('returns 200 with status ok', async () => {
    const { res, inner } = mockRes();
    await handler(req(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = inner.json.mock.calls[0][0];
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns 405 for non-GET', async () => {
    const { res, inner } = mockRes();
    await handler(req({}, 'POST'), res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(inner.end).toHaveBeenCalled();
  });
});

describe('GET /api/health?check=ready (readiness)', () => {
  it('returns 200 when db is up', async () => {
    (getServiceClient as jest.Mock).mockReturnValue({
      from: () => ({ select: () => Promise.resolve({ error: null }) }),
    });
    const { res, inner } = mockRes();
    await handler(req({ check: 'ready' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = inner.json.mock.calls[0][0];
    expect(body.status).toBe('ok');
    expect(body.services.db).toBe('up');
  });

  it('returns 503 when db is down', async () => {
    (getServiceClient as jest.Mock).mockReturnValue({
      from: () => ({ select: () => Promise.resolve({ error: new Error('conn failed') }) }),
    });
    const { res, inner } = mockRes();
    await handler(req({ check: 'ready' }), res);
    expect(res.status).toHaveBeenCalledWith(503);
    const body = inner.json.mock.calls[0][0];
    expect(body.status).toBe('degraded');
    expect(body.services.db).toBe('down');
  });

  it('returns 503 when db throws', async () => {
    (getServiceClient as jest.Mock).mockReturnValue({
      from: () => ({ select: () => Promise.reject(new Error('network error')) }),
    });
    const { res, inner } = mockRes();
    await handler(req({ check: 'ready' }), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(inner.json.mock.calls[0][0].services.db).toBe('down');
  });
});
