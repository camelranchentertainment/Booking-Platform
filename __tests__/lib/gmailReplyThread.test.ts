// __tests__/lib/gmailReplyThread.test.ts
//
// Replies sent through Gmail join the venue's thread: In-Reply-To/References
// headers for the venue's mail app, threadId for the band's Gmail.

const mockGet = jest.fn();
const mockSend = jest.fn().mockResolvedValue({});
jest.mock('../../lib/gmailClient', () => ({
  getGmailClient: jest.fn(async () => ({ gmail: { users: { messages: { get: mockGet, send: mockSend } } }, gmailAddress: 'band@gmail.com' })),
}));

import { buildMimeMessage, replyThreadFromHeaders, sendViaGmail } from '../../lib/gmailSend';

const decodeRaw = (raw: string) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

beforeEach(() => jest.clearAllMocks());

describe('replyThreadFromHeaders', () => {
  it('replies to the Message-ID and extends the References chain', () => {
    expect(replyThreadFromHeaders('t-1', [
      { name: 'Message-ID', value: '<b@venue.com>' },
      { name: 'References', value: '<a@band.com>' },
    ])).toEqual({ threadId: 't-1', inReplyTo: '<b@venue.com>', references: '<a@band.com> <b@venue.com>' });
  });

  it('starts a References chain when there is none, and matches header names in any case', () => {
    expect(replyThreadFromHeaders(null, [{ name: 'message-id', value: '<b@venue.com>' }]))
      .toEqual({ inReplyTo: '<b@venue.com>', references: '<b@venue.com>' });
  });

  it('returns nothing usable without a Message-ID', () => {
    expect(replyThreadFromHeaders(undefined, [])).toEqual({});
  });
});

describe('buildMimeMessage threading headers', () => {
  it('adds In-Reply-To and References', () => {
    const msg = buildMimeMessage({ from: 'a@b.c', to: 'v@y.com', subject: 'Re: Dates', html: 'x', inReplyTo: '<b@venue.com>', references: '<a@x> <b@venue.com>' });
    expect(msg).toContain('In-Reply-To: <b@venue.com>\r\n');
    expect(msg).toContain('References: <a@x> <b@venue.com>\r\n');
  });

  it('cannot be used to inject headers', () => {
    const msg = buildMimeMessage({ from: 'a@b.c', to: 'v@y.com', subject: 'Hi', html: 'x', inReplyTo: '<b@v>\r\nBcc: spy@evil.com' });
    expect(msg).not.toMatch(/\r\nBcc:/);
  });

  it('leaves both out for a new email', () => {
    const msg = buildMimeMessage({ from: 'a@b.c', to: 'v@y.com', subject: 'Hi', html: 'x' });
    expect(msg).not.toContain('In-Reply-To');
    expect(msg).not.toContain('References');
  });
});

describe('sendViaGmail replies', () => {
  it('looks up the original and sends into its thread', async () => {
    mockGet.mockResolvedValue({ data: { threadId: 'thread-9', payload: { headers: [{ name: 'Message-ID', value: '<b@venue.com>' }] } } });
    await sendViaGmail('act-1', 'v@y.com', 'Re: Dates', '<p>Works for us</p>', [], 'gmail-msg-1');
    expect(mockGet).toHaveBeenCalledWith(expect.objectContaining({ userId: 'me', id: 'gmail-msg-1', format: 'metadata' }));
    const { requestBody } = mockSend.mock.calls[0][0];
    expect(requestBody.threadId).toBe('thread-9');
    expect(decodeRaw(requestBody.raw)).toContain('In-Reply-To: <b@venue.com>');
  });

  it('still sends, unthreaded, when the original can\'t be found', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockGet.mockRejectedValue(new Error('Requested entity was not found.'));
    await sendViaGmail('act-1', 'v@y.com', 'Re: Dates', '<p>x</p>', [], 'gone');
    const { requestBody } = mockSend.mock.calls[0][0];
    expect(requestBody.threadId).toBeUndefined();
    expect(decodeRaw(requestBody.raw)).not.toContain('In-Reply-To');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('makes no lookup for a new email', async () => {
    await sendViaGmail('act-1', 'v@y.com', 'Hi', '<p>x</p>');
    expect(mockGet).not.toHaveBeenCalled();
  });
});
