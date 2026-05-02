import { AppError, withHandler } from '../../lib/apiError';
import type { NextApiRequest, NextApiResponse } from 'next';

function mockRes() {
  const inner = { json: jest.fn() };
  const res = { status: jest.fn().mockReturnValue(inner) } as unknown as NextApiResponse;
  return { res, inner };
}

function mockReq(method = 'GET'): NextApiRequest {
  return { method } as unknown as NextApiRequest;
}

describe('AppError', () => {
  it('stores statusCode and message', () => {
    const e = new AppError(404, 'Not found');
    expect(e.statusCode).toBe(404);
    expect(e.message).toBe('Not found');
    expect(e.isOperational).toBe(true);
  });

  it('instanceof check works after serialization boundary', () => {
    const e = new AppError(400, 'Bad request');
    expect(e instanceof AppError).toBe(true);
    expect(e instanceof Error).toBe(true);
  });

  it('accepts non-operational flag', () => {
    const e = new AppError(500, 'oops', false);
    expect(e.isOperational).toBe(false);
  });
});

describe('withHandler', () => {
  it('passes through successful handler', async () => {
    const { res, inner } = mockRes();
    const handler = withHandler(async (_req, r) => {
      r.status(200).json({ ok: true });
    });
    await handler(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(inner.json).toHaveBeenCalledWith({ ok: true });
  });

  it('returns AppError status and message for operational errors', async () => {
    const { res, inner } = mockRes();
    const handler = withHandler(async () => {
      throw new AppError(403, 'Forbidden');
    });
    await handler(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(inner.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('returns 500 for non-operational AppError', async () => {
    const { res, inner } = mockRes();
    const handler = withHandler(async () => {
      throw new AppError(500, 'internal detail', false);
    });
    await handler(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(inner.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('returns 500 for unknown errors', async () => {
    const { res, inner } = mockRes();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const handler = withHandler(async () => {
      throw new Error('something unexpected');
    });
    await handler(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(inner.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    spy.mockRestore();
  });
});
