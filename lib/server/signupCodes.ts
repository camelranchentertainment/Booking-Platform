// lib/server/signupCodes.ts
// Database + notification side of signup codes. Service-role client only:
// the signup_code tables have no RLS policies.

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../apiError';
import { getSetting } from '../platformSettings';
import { parseRedeemError, type RedeemErrorCode } from '../domain/signupCode';

export interface RedeemResult {
  code_id: string;
  label: string;
  uses: number;
  max_uses: number;
  trial_ends_at: string;
}

export type RedeemOutcome =
  | { ok: true; result: RedeemResult }
  | { ok: false; reason: RedeemErrorCode };

/** True when a code with this (already normalised) value exists, whether or not it is still usable. */
export async function signupCodeExists(service: SupabaseClient, code: string): Promise<boolean> {
  const { data, error } = await service
    .from('signup_codes')
    .select('id')
    .eq('code', code)
    .maybeSingle();
  if (error) throw new AppError(500, 'Could not check the code', false);
  return !!data;
}

/**
 * Redeems a code for a profile through the atomic SQL function.
 * Expected business failures come back as { ok: false, reason }; anything
 * unexpected throws a non-operational AppError (500).
 */
export async function redeemSignupCode(
  service: SupabaseClient,
  code: string,
  profileId: string,
): Promise<RedeemOutcome> {
  const { data, error } = await service.rpc('redeem_signup_code', { p_code: code, p_profile_id: profileId });
  if (error) {
    const reason = parseRedeemError(error.message);
    if (reason) return { ok: false, reason };
    console.error('[signup-code] redeem failed', { profileId, error });
    throw new AppError(500, 'Could not apply the code', false);
  }
  return { ok: true, result: data as RedeemResult };
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Emails the platform owner (the configured from-address, same pattern as booking
 * inquiries) when a code is redeemed. Never throws: a failed notification must
 * not break sign-up. Returns whether the email was accepted by Resend.
 */
export async function notifyCodeRedeemed(
  result: RedeemResult,
  who: { email: string; displayName: string; actName: string | null },
): Promise<boolean> {
  try {
    const apiKey = await getSetting('resend_api_key');
    const fromAddr = await getSetting('resend_from_email');
    if (!apiKey || !fromAddr) return false;

    const ends = new Date(result.trial_ends_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const row = (k: string, v: string) =>
      `<tr><td style="padding:6px 12px 6px 0;color:#888;white-space:nowrap">${k}</td><td>${esc(v)}</td></tr>`;
    const html = `
      <h2 style="font-family:sans-serif;color:#E07820">Signup code used — ${esc(result.label)}</h2>
      <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        ${row('Band', who.actName || '—')}
        ${row('Name', who.displayName)}
        ${row('Email', who.email)}
        ${row('Free until', ends)}
        ${row('Uses', `${result.uses} of ${result.max_uses}`)}
      </table>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromAddr,
        to: [fromAddr],
        subject: `${result.label}: ${who.actName || who.email} signed up (${result.uses} of ${result.max_uses})`,
        html,
      }),
    });
    if (!res.ok) {
      console.error('[signup-code] notification rejected', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[signup-code] notification failed', err);
    return false;
  }
}
