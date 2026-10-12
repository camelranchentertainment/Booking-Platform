// lib/server/bookerGmail.ts
// An agent's own Gmail connection for the Booking Agent workspace. Server-only.
//
// Kept apart from the band-side Gmail integration (lib/gmailClient.ts,
// act_credentials): an agent's mailbox is never attached to a band, and a
// band's mailbox is never used for an agent's mail.
//
// OAuth:
//   * Reuses the platform's registered redirect URI
//     (/api/auth/google/gmail-callback). Agent requests are told apart by a
//     "bk." state prefix, so no new URI has to be added in Google Cloud.
//   * The state is HMAC-signed, expires after 10 minutes, and carries a nonce
//     that must match an HttpOnly cookie set on the agent's own browser when
//     the flow started. A forged or replayed callback cannot attach someone's
//     Gmail to another agent's workspace.
//   * Scope is gmail.compose only, the same Gmail scope the platform already
//     uses, so the consent screen and app verification are unchanged.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../apiError';
import { buildMimeMessage } from '../gmailSend';
import { fromHeader } from '../booker/emailFormat';

export const BOOKER_STATE_PREFIX = 'bk.';
export const OAUTH_NONCE_COOKIE = 'crb_bk_gmail_nonce';
const STATE_TTL_MS = 10 * 60 * 1000;
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.camelranchbooking.com').replace(/\/+$/, '');
}

export const redirectUri = () => `${siteUrl()}/api/auth/google/gmail-callback`;

function oauthConfig(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new AppError(501, 'Gmail connection is not set up on this site yet.');
  return { clientId, clientSecret };
}

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export interface OAuthStatePayload {
  /** auth user id */
  u: string;
  /** booker_profiles.id */
  b: string;
  /** nonce, also stored in the HttpOnly cookie */
  n: string;
  /** expiry, ms since epoch */
  e: number;
}

/** Signs a state value: "bk." + base64url(json) + "." + base64url(hmac). */
export function signOAuthState(payload: OAuthStatePayload, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = b64url(createHmac('sha256', secret).update(body).digest());
  return `${BOOKER_STATE_PREFIX}${body}.${sig}`;
}

/**
 * Verifies signature, expiry and shape.
 *
 * @returns the payload, or null when the state is forged, altered, expired or malformed
 */
export function verifyOAuthState(state: string, secret: string, now: number = Date.now()): OAuthStatePayload | null {
  if (!state.startsWith(BOOKER_STATE_PREFIX)) return null;
  const [body, sig, extra] = state.slice(BOOKER_STATE_PREFIX.length).split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = fromB64url(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(fromB64url(body).toString('utf8')) as Partial<OAuthStatePayload>;
    if (typeof p.u !== 'string' || typeof p.b !== 'string' || typeof p.n !== 'string' || typeof p.e !== 'number') return null;
    if (p.e < now) return null;
    return p as OAuthStatePayload;
  } catch {
    return null;
  }
}

/** Starts the flow: a fresh nonce, the signed state and Google's consent URL. */
export function beginOAuth(userId: string, bookerId: string, now: number = Date.now()): { url: string; nonce: string } {
  const { clientId, clientSecret } = oauthConfig();
  const nonce = b64url(randomBytes(18));
  const state = signOAuthState({ u: userId, b: bookerId, n: nonce, e: now + STATE_TTL_MS }, clientSecret);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, nonce };
}

/** The HttpOnly cookie carrying the nonce (Lax so it survives Google's top-level redirect back). */
export function nonceCookie(nonce: string, maxAgeSeconds = STATE_TTL_MS / 1000): string {
  const secure = siteUrl().startsWith('https://') ? '; Secure' : '';
  return `${OAUTH_NONCE_COOKIE}=${nonce}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export const clearNonceCookie = () => nonceCookie('', 0);

export function verifyStateWithSecret(state: string, now?: number): OAuthStatePayload | null {
  const { clientSecret } = oauthConfig();
  return verifyOAuthState(state, clientSecret, now);
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  return (await res.json().catch(() => ({}))) as TokenResponse;
}

/** Exchanges the callback code and returns tokens plus the Gmail address. */
export async function exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null; gmailAddress: string }> {
  const { clientId, clientSecret } = oauthConfig();
  const t = await tokenRequest({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri(), grant_type: 'authorization_code' });
  if (!t.access_token) {
    console.error('[bookerGmail] token exchange failed', { error: t.error ?? 'no access_token' });
    throw new AppError(502, 'token_exchange_failed');
  }
  const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${t.access_token}` } });
  const profile = (await profileRes.json().catch(() => ({}))) as { emailAddress?: string };
  if (!profile.emailAddress) throw new AppError(502, 'profile_failed');
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null,
    gmailAddress: profile.emailAddress,
  };
}

export interface BookerGmailRow {
  booker_id: string;
  gmail_address: string;
  google_refresh_token: string;
  google_access_token: string | null;
  access_expires_at: string | null;
  connected_at: string;
}

export async function getBookerGmail(service: SupabaseClient, bookerId: string): Promise<BookerGmailRow | null> {
  const { data, error } = await service.from('booker_credentials').select('*').eq('booker_id', bookerId).maybeSingle();
  if (error) throw new AppError(500, 'Could not check your Gmail connection', false);
  return (data as BookerGmailRow | null) ?? null;
}

/** Best-effort token revocation at Google; never throws. */
export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) });
  } catch {
    console.error('[bookerGmail] token revoke failed');
  }
}

/** A valid access token, refreshing (and saving) it when it is about to expire. */
async function accessToken(service: SupabaseClient, row: BookerGmailRow): Promise<string> {
  const fresh = row.google_access_token && row.access_expires_at && new Date(row.access_expires_at).getTime() - Date.now() > 60_000;
  if (fresh) return row.google_access_token!;
  const { clientId, clientSecret } = oauthConfig();
  const t = await tokenRequest({ refresh_token: row.google_refresh_token, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' });
  if (!t.access_token) {
    if (t.error === 'invalid_grant') {
      // Revoked or expired at Google: forget it so Settings shows "not connected" and the agent reconnects.
      await service.from('booker_credentials').delete().eq('booker_id', row.booker_id);
      throw new AppError(409, 'Your Gmail connection has expired. Reconnect Gmail in Settings to send.');
    }
    console.error('[bookerGmail] token refresh failed', { error: t.error ?? 'no access_token' });
    throw new AppError(502, 'Gmail is not responding right now. Try again in a minute.');
  }
  const expiresAt = t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null;
  await service.from('booker_credentials').update({ google_access_token: t.access_token, access_expires_at: expiresAt }).eq('booker_id', row.booker_id);
  return t.access_token;
}

/**
 * Sends from the agent's own Gmail. It lands in their Sent folder, so no
 * self-copy is needed.
 *
 * @throws AppError 409 when the connection has expired (it is removed), 502 when Gmail rejects the send
 */
export async function sendViaBookerGmail(
  service: SupabaseClient,
  row: BookerGmailRow,
  email: { displayName: string; to: string; subject: string; html: string },
): Promise<{ providerMessageId: string | null; fromAddress: string }> {
  const token = await accessToken(service, row);
  const mime = buildMimeMessage({ from: fromHeader(email.displayName, row.gmail_address), to: email.to, subject: email.subject, html: email.html });
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: b64url(Buffer.from(mime, 'utf8')) }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { status?: string } };
  if (!res.ok) {
    console.error('[bookerGmail] send failed', { status: res.status, reason: body.error?.status });
    throw new AppError(502, 'Gmail would not send this email. Check the address and try again.');
  }
  return { providerMessageId: body.id ?? null, fromAddress: row.gmail_address };
}
