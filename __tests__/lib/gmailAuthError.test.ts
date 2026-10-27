// __tests__/lib/gmailAuthError.test.ts
import { GMAIL_RECONNECT_MESSAGE, GmailReconnectError, isGmailAuthError } from '../../lib/gmailAuthError';

describe('isGmailAuthError', () => {
  it('recognises expired / revoked Google connections', () => {
    expect(isGmailAuthError(new Error('invalid_grant'))).toBe(true);
    expect(isGmailAuthError(new Error('Token has been expired or revoked.'))).toBe(true);
    expect(isGmailAuthError(new Error('Invalid Credentials'))).toBe(true);
    expect(isGmailAuthError({ message: 'Bad Request', response: { data: { error: 'invalid_grant' } } })).toBe(true);
  });

  it('ignores ordinary send failures', () => {
    expect(isGmailAuthError(new Error('Recipient address rejected'))).toBe(false);
    expect(isGmailAuthError(null)).toBe(false);
  });
});

describe('GmailReconnectError', () => {
  it('carries a plain-language message and a stable code', () => {
    const e = new GmailReconnectError(new Error('invalid_grant'));
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(GmailReconnectError);
    expect(e.message).toBe(GMAIL_RECONNECT_MESSAGE);
    expect(e.code).toBe('GMAIL_RECONNECT');
  });
});
