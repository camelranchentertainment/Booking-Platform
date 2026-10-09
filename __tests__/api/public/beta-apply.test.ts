// __tests__/api/public/beta-apply.test.ts
jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../../lib/platformSettings', () => ({ getSetting: jest.fn().mockResolvedValue(null) }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import handler from '../../../pages/api/public/beta-apply';
import { getServiceClient } from '../../../lib/supabase';
import { BETA_CAP } from '../../../lib/domain/betaProgram';
import type { NextApiRequest, NextApiResponse } from 'next';

const VALID = {
  applicantName: 'Jane Doe',
  email: 'Jane@Example.com',
  actName: 'The Example Band',
  genre: 'Rock',
  homeBase: 'Tulsa, OK',
  showsPerYear: 'under_25',
  bookingMethod: 'Email and texts',
  websiteUrl: '',
  agentName: '',
  feedbackAgreed: true,
  companySite: '',
};

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status: jest.fn(function (this: any, c: number) { this.statusCode = c; return this; }),
    json: jest.fn(function (this: any, b: unknown) { this.body = b; return this; }),
    setHeader: jest.fn(),
  };
  return res as unknown as NextApiResponse & { statusCode: number; body: any };
}

const req = (method: string, body: unknown = {}) => ({ method, body, headers: {} } as unknown as NextApiRequest);

/** Service mock: `approved` drives the count; `insertError` drives the insert result. */
function service({ approved = 0, insertError = null as null | { code: string } } = {}) {
  const insert = jest.fn().mockResolvedValue({ error: insertError });
  const countChain = { select: () => countChain, eq: () => Promise.resolve({ count: approved, error: null }) };
  const from = jest.fn().mockImplementation(() => ({ ...countChain, insert }));
  (getServiceClient as jest.Mock).mockReturnValue({ from });
  return { from, insert };
}

describe('POST /api/public/beta-apply', () => {
  afterEach(() => jest.clearAllMocks());

  it('rejects non-POST with 405', async () => {
    const res = mockRes();
    await handler(req('GET'), res);
    expect(res.statusCode).toBe(405);
  });

  it('silently accepts honeypot submissions without saving them', async () => {
    const { insert } = service();
    const res = mockRes();
    await handler(req('POST', { ...VALID, companySite: 'spam.example' }), res);
    expect(res.statusCode).toBe(201);
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns 400 with per-field errors for invalid input', async () => {
    const { insert } = service();
    const res = mockRes();
    await handler(req('POST', { ...VALID, actName: '', feedbackAgreed: false }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.fields.actName).toBeDefined();
    expect(res.body.fields.feedbackAgreed).toBeDefined();
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses new applications once the beta is full', async () => {
    const { insert } = service({ approved: BETA_CAP });
    const res = mockRes();
    await handler(req('POST', VALID), res);
    expect(res.statusCode).toBe(409);
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns 409 when a live application already exists for the email', async () => {
    service({ insertError: { code: '23505' } });
    const res = mockRes();
    await handler(req('POST', VALID), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/already have an application/i);
  });

  it('saves a valid application with normalised fields and returns 201', async () => {
    const { insert } = service({ approved: 3 });
    const res = mockRes();
    await handler(req('POST', VALID), res);
    expect(res.statusCode).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      email: 'jane@example.com',
      act_name: 'The Example Band',
      shows_per_year: 'under_25',
      website_url: null,
      agent_name: null,
      feedback_agreed: true,
    }));
  });

  it('never lets the client set review or grant fields', async () => {
    const { insert } = service();
    const res = mockRes();
    await handler(req('POST', { ...VALID, status: 'approved', granted_at: '2026-01-01' }), res);
    const row = insert.mock.calls[0][0];
    expect(row).not.toHaveProperty('status');
    expect(row).not.toHaveProperty('granted_at');
  });
});
