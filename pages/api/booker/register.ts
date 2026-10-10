// pages/api/booker/register.ts
// Creates a Booking Agent account for someone with no Camel Ranch account yet.
//
// POST { email, password, displayName, agencyName, signupCode? }
//   200 { ok: true, codeApplied?: boolean }
//   400 { error } invalid input, unknown code, or email already registered
//   405 method not allowed
//   500 { error } account could not be created (nothing is left half-made)
//
// The account gets a normal profiles row (role band_admin, no band) so every
// existing role check keeps working unchanged: with no act_id it can reach no
// band data. Being an agent is the booker_profiles row created here. A signup
// code (e.g. an agent beta code) extends the free period exactly as it does for
// band sign-ups.
//
// Existing users don't use this route: they open /booker while signed in and
// set up the workspace there.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { BookerSignupSchema, firstIssue } from '../../../lib/booker/schemas';
import { isValidSignupCodeShape, normalizeSignupCode } from '../../../lib/domain/signupCode';
import { notifyCodeRedeemed, redeemSignupCode, signupCodeExists } from '../../../lib/server/signupCodes';

const TRIAL_DAYS = 14;

type Admin = ReturnType<typeof getServiceClient>;

/** Deletes the auth user (profiles and booker_profiles cascade). Logs, never throws. */
async function undoUser(admin: Admin, userId: string, step: string): Promise<void> {
  console.error(`[booker/register] ${step} failed; removing partial account`, { userId });
  try {
    await admin.auth.admin.deleteUser(userId);
  } catch (err) {
    console.error('[booker/register] cleanup failed', { userId, err });
  }
}

/**
 * Registers a Booking Agent.
 *
 * @param req POST body: email, password, displayName, agencyName, optional signupCode
 * @param res see header comment for responses
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = BookerSignupSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
  const { email, password, displayName, agencyName } = parsed.data;

  const admin = getServiceClient();

  // Check a code before creating anything, so a typo can be fixed without a half-made account.
  const code = normalizeSignupCode(req.body?.signupCode);
  if (code) {
    let known = false;
    try {
      known = isValidSignupCodeShape(code) && (await signupCodeExists(admin, code));
    } catch (err) {
      console.error('[booker/register] signup code lookup failed', err);
      return res.status(500).json({ error: 'Could not check the code. Please try again.' });
    }
    if (!known) {
      return res.status(400).json({ error: "That code isn't recognized. Check it, or leave it blank to start the standard free trial." });
    }
  }

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (authErr || !authData?.user) {
    const taken = /already|registered|exists/i.test(authErr?.message ?? '');
    return res.status(400).json({
      error: taken
        ? 'An account with this email already exists. Sign in, then open the Booking Agent workspace to set it up.'
        : 'Could not create the account. Check the details and try again.',
    });
  }
  const userId = authData.user.id;

  const { error: profileErr } = await admin.from('profiles').upsert(
    {
      id: userId,
      role: 'band_admin',
      email,
      display_name: displayName,
      subscription_status: 'trialing',
      trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(),
    },
    { onConflict: 'id' },
  );
  if (profileErr) {
    await undoUser(admin, userId, 'profile');
    return res.status(500).json({ error: 'Could not create the account. Please try again.' });
  }

  const { error: bookerErr } = await admin.from('booker_profiles').insert({
    user_id: userId,
    agency_name: agencyName,
    contact_name: displayName,
    contact_email: email,
  });
  if (bookerErr) {
    await undoUser(admin, userId, 'booker profile');
    return res.status(500).json({ error: 'Could not create the account. Please try again.' });
  }

  if (!code) return res.status(200).json({ ok: true });

  // A code that ran out after the check never fails sign-up: the account keeps the standard trial.
  try {
    const outcome = await redeemSignupCode(admin, code, userId);
    if (!outcome.ok) return res.status(200).json({ ok: true, codeApplied: false });
    await notifyCodeRedeemed(outcome.result, { email, displayName, actName: `${agencyName} (Booking Agent)` });
    return res.status(200).json({ ok: true, codeApplied: true });
  } catch (err) {
    console.error('[booker/register] applying signup code failed', { userId, err });
    return res.status(200).json({ ok: true, codeApplied: false });
  }
}
