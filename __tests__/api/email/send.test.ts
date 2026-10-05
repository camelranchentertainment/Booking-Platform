// __tests__/api/email/send.test.ts
jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../../lib/emailSend', () => ({
  sendActEmail: jest.fn().mockResolvedValue({ email_log_id: 'log-1' }),
  stripHtml: (s: string) => s,
}));
jest.mock('../../../lib/server/emailAttachments', () => ({
  resolveAttachments: jest.fn().mockResolvedValue([{ filename: 'rider.pdf', contentType: 'application/pdf', content: Buffer.from('x') }]),
}));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import handler from '../../../pages/api/email/send';
import { getServiceClient } from '../../../lib/supabase';
import { sendActEmail } from '../../../lib/emailSend';
import { resolveAttachments } from '../../../lib/server/emailAttachments';
import type { NextApiRequest, NextApiResponse } from 'next';

const ACT = 'act-1';

function setup(role = 'band_admin') {
  const profile: any = { select: () => profile, eq: () => profile, single: () => Promise.resolve({ data: { act_id: ACT, role } }) };
  (getServiceClient as jest.Mock).mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } } }) },
    from: () => profile,
  });
}
function call(body: Record<string, unknown>) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const req = { method: 'POST', body, headers: { authorization: 'Bearer t' } } as unknown as NextApiRequest;
  return { req, r: { status, json } as unknown as NextApiResponse, status };
}

const base = { to: 'v@y.com', subject: 'Hi', html: '<p>x</p>' };

beforeEach(() => jest.clearAllMocks());

describe('/api/email/send', () => {
  it('refuses Members', async () => {
    setup('member');
    const { req, r, status } = call(base);
    await handler(req, r);
    expect(status).toHaveBeenCalledWith(403);
    expect(sendActEmail).not.toHaveBeenCalled();
  });

  it('rejects malformed attachments before sending anything', async () => {
    setup();
    const { req, r, status } = call({ ...base, attachments: [{ source: 'url', url: 'http://evil' }] });
    await handler(req, r);
    expect(status).toHaveBeenCalledWith(400);
    expect(resolveAttachments).not.toHaveBeenCalled();
  });

  it('resolves attachments for the caller\'s act and passes them to the sender', async () => {
    setup();
    const refs = [{ source: 'upload', path: `${ACT}/email-attachments/a-rider.pdf`, name: 'rider.pdf' }];
    const { req, r, status } = call({ ...base, actId: ACT, attachments: refs });
    await handler(req, r);
    expect(status).toHaveBeenCalledWith(200);
    expect((resolveAttachments as jest.Mock).mock.calls[0][1]).toBe(ACT);
    expect((sendActEmail as jest.Mock).mock.calls[0][0]).toMatchObject({
      actId: ACT,
      attachmentRefs: refs,
      attachments: [expect.objectContaining({ filename: 'rider.pdf' })],
    });
  });

  it('refuses an actId for a different band', async () => {
    setup();
    const { req, r, status } = call({ ...base, actId: 'other-act' });
    await handler(req, r);
    expect(status).toHaveBeenCalledWith(403);
  });
});
