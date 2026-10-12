// __tests__/api/parseFile.test.ts
jest.mock('../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../lib/server/pdfText', () => {
  const { AppError } = jest.requireActual('../../lib/apiError');
  return {
    extractPdfText: jest.fn(async (buf: Buffer) => {
      if (buf.toString().includes('scan')) throw new AppError(422, "That PDF has no text to read. It's probably a scanned image.");
      return 'Gruene Hall Oct 24';
    }),
  };
});
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/parse-file';
import { getServiceClient } from '../../lib/supabase';

function call(body: unknown, auth = 'Bearer t', user: unknown = { id: 'u1' }) {
  (getServiceClient as jest.Mock).mockReturnValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) } });
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const req = { method: 'POST', body, headers: auth ? { authorization: auth } : {} } as unknown as NextApiRequest;
  return { run: () => handler(req, { status, json, setHeader: jest.fn() } as unknown as NextApiResponse), status, json };
}

const b64 = (s: string) => Buffer.from(s).toString('base64');

describe('POST /api/parse-file', () => {
  it('returns the text of an attached PDF', async () => {
    const { run, status, json } = call({ base64: b64('%PDF-1.4 ok'), mimeType: 'application/pdf' });
    await run();
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ text: 'Gruene Hall Oct 24' });
  });
  it('requires sign-in', async () => {
    const { run, status } = call({ base64: b64('x'), mimeType: 'application/pdf' }, '');
    await run();
    expect(status).toHaveBeenCalledWith(401);
    const second = call({ base64: b64('x'), mimeType: 'application/pdf' }, 'Bearer bad', null);
    await second.run();
    expect(second.status).toHaveBeenCalledWith(401);
  });
  it('only reads PDFs and needs a file', async () => {
    const a = call({ base64: b64('x'), mimeType: 'text/plain' });
    await a.run();
    expect(a.status).toHaveBeenCalledWith(400);
    const b = call({ mimeType: 'application/pdf' });
    await b.run();
    expect(b.status).toHaveBeenCalledWith(400);
  });
  it('passes the readable reason through (scanned PDF)', async () => {
    const { run, status, json } = call({ base64: b64('%PDF scan'), mimeType: 'application/pdf' });
    await run();
    expect(status).toHaveBeenCalledWith(422);
    expect(json.mock.calls[0][0].error).toMatch(/scanned image/);
  });
});
