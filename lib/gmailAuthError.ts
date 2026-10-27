// lib/gmailAuthError.ts
//
// When Google revokes or expires a band's Gmail connection (for example: the
// OAuth app is in Testing mode, where Google drops every connection after 7
// days), each send fails with `invalid_grant`. Retrying can't help until the
// band reconnects, so callers stop and tell the user exactly that.

/** True for Google OAuth errors that only a reconnect can fix. */
export function isGmailAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const code = (err as { response?: { data?: { error?: unknown } } } | null)?.response?.data?.error;
  return (
    /invalid_grant|invalid_client|unauthorized_client|Invalid Credentials|Token has been expired or revoked/i.test(msg) ||
    code === 'invalid_grant'
  );
}

export const GMAIL_RECONNECT_MESSAGE =
  'Your Gmail connection has expired, so nothing was sent. Go to Settings, disconnect Gmail and connect it again, then try once more.';

/** A send that failed because the Gmail connection must be reconnected. */
export class GmailReconnectError extends Error {
  readonly code = 'GMAIL_RECONNECT';
  constructor(readonly cause?: unknown) {
    super(GMAIL_RECONNECT_MESSAGE);
    this.name = 'GmailReconnectError';
    Object.setPrototypeOf(this, GmailReconnectError.prototype);
  }
}
