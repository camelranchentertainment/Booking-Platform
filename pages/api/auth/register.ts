import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { validateRegistration } from '../../../lib/domain/registration';
import { isValidSignupCodeShape, normalizeSignupCode } from '../../../lib/domain/signupCode';
import { notifyCodeRedeemed, redeemSignupCode, signupCodeExists } from '../../../lib/server/signupCodes';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password, role, displayName, actName, planTier, signupCode } = req.body;

  const validation = validateRegistration({ email, password, role, displayName, planTier });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const admin = getServiceClient();

  // Check the code BEFORE creating anything, so a typo can be fixed without a half-made account.
  // Recognised-but-used-up codes are handled after sign-up (the account still gets the standard trial).
  const code = normalizeSignupCode(signupCode);
  if (code) {
    let known = false;
    try {
      known = isValidSignupCodeShape(code) && (await signupCodeExists(admin, code));
    } catch (err) {
      console.error('[register] signup code lookup failed', err);
      return res.status(500).json({ error: 'Could not check the code. Please try again.' });
    }
    if (!known) {
      return res.status(400).json({
        error: "That code isn't recognized. Check it and try again, or leave it blank to start the standard 14-day trial.",
      });
    }
  }

  // Create auth user server-side — email_confirm skips the confirmation email entirely,
  // avoiding Supabase's email rate limit on the free tier.
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr) return res.status(400).json({ error: authErr.message });

  const userId = authData.user.id;

  // Set a 14-day trial for paid tiers so new users can access the app immediately.
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const profileData: Record<string, unknown> = {
    id: userId,
    role,
    email,
    display_name: displayName,
    subscription_status: 'trialing',
    subscription_tier: 'band_admin',
    trial_ends_at: trialEndsAt,
  };

  // upsert so the on_auth_user_created trigger row (if present) gets overwritten with correct data
  const { error: profileErr } = await admin.from('profiles').upsert(profileData, { onConflict: 'id' });
  if (profileErr) {
    await admin.auth.admin.deleteUser(userId);
    return res.status(500).json({ error: profileErr.message });
  }

  if (role === 'band_admin' && actName) {
    const { data: actData, error: actErr } = await admin
      .from('acts')
      .insert({ owner_id: userId, act_name: actName })
      .select('id')
      .single();

    if (actErr || !actData) {
      await admin.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: actErr?.message || 'Failed to create act' });
    }

    // Link the new act back to the user's profile
    const { error: linkErr } = await admin
      .from('profiles')
      .update({ act_id: actData.id })
      .eq('id', userId);

    if (linkErr) {
      await admin.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: linkErr.message });
    }
  }

  if (code) {
    const outcome = await applySignupCode(admin, code, userId, { email, displayName, actName: actName || null });
    return res.status(200).json({ ok: true, ...outcome });
  }

  return res.status(200).json({ ok: true });
}

type CodeOutcome = { codeApplied: true; trialEndsAt: string } | { codeApplied: false };

/**
 * Applies the code after the account exists. Never throws and never fails sign-up:
 * if the code ran out (or anything else goes wrong) the account simply keeps the
 * standard 14-day trial, and codeApplied tells the page what to say.
 */
async function applySignupCode(
  admin: ReturnType<typeof getServiceClient>,
  code: string,
  userId: string,
  who: { email: string; displayName: string; actName: string | null },
): Promise<CodeOutcome> {
  try {
    const outcome = await redeemSignupCode(admin, code, userId);
    if (!outcome.ok) return { codeApplied: false };
    await notifyCodeRedeemed(outcome.result, who);
    return { codeApplied: true, trialEndsAt: outcome.result.trial_ends_at };
  } catch (err) {
    console.error('[register] applying signup code failed', { userId, err });
    return { codeApplied: false };
  }
}
