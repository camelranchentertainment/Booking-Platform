// lib/server/bookerGmailCallback.ts
// Handles Google's redirect back for an agent's Gmail connection. Called from
// /api/auth/google/gmail-callback when the state carries the "bk." prefix (the
// band-side flow is untouched). Always ends in a redirect to the agent's
// Settings page with a plain status code; tokens never reach the browser.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../supabase';
import { AppError } from '../apiError';
import { OAUTH_NONCE_COOKIE, clearNonceCookie, exchangeCode, getBookerGmail, verifyStateWithSecret } from './bookerGmail';

const back = (res: NextApiResponse, query: string) => {
  res.setHeader('Set-Cookie', clearNonceCookie());
  res.redirect(`/agent/settings?${query}`);
};

/** Reads one cookie value from the request. */
export function readCookie(req: NextApiRequest, name: string): string | null {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || null;
  }
  return null;
}

export async function handleBookerGmailCallback(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const { code, state, error } = req.query;
  if (error) return back(res, `gmail_error=${error === 'access_denied' ? 'denied' : 'google'}`);
  if (typeof code !== 'string' || typeof state !== 'string') return back(res, 'gmail_error=missing');

  let payload;
  try {
    payload = verifyStateWithSecret(state);
  } catch {
    return back(res, 'gmail_error=not_configured');
  }
  if (!payload) return back(res, 'gmail_error=expired');

  // The nonce cookie proves this browser started the flow (stops login CSRF).
  const cookieNonce = readCookie(req, OAUTH_NONCE_COOKIE);
  if (!cookieNonce || cookieNonce !== payload.n) return back(res, 'gmail_error=session');

  try {
    const service = getServiceClient();
    // Re-check that the agent profile still belongs to the user who started.
    const { data: booker } = await service.from('booker_profiles').select('id').eq('id', payload.b).eq('user_id', payload.u).is('deleted_at', null).maybeSingle();
    if (!booker) return back(res, 'gmail_error=forbidden');

    const t = await exchangeCode(code);
    const existing = await getBookerGmail(service, payload.b);
    const refreshToken = t.refreshToken ?? existing?.google_refresh_token ?? null;
    if (!refreshToken) return back(res, 'gmail_error=no_offline_access');

    const { error: upsertErr } = await service.from('booker_credentials').upsert(
      {
        booker_id: payload.b,
        gmail_address: t.gmailAddress,
        google_refresh_token: refreshToken,
        google_access_token: t.accessToken,
        access_expires_at: t.expiresAt,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'booker_id' },
    );
    if (upsertErr) {
      console.error('[bookerGmailCallback] save failed', { code: upsertErr.code });
      return back(res, 'gmail_error=save');
    }
    return back(res, 'gmail=connected');
  } catch (err) {
    if (!(err instanceof AppError)) console.error('[bookerGmailCallback] unexpected error', { name: err instanceof Error ? err.name : 'unknown' });
    return back(res, 'gmail_error=google');
  }
}
