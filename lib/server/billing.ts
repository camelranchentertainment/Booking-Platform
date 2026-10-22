// lib/server/billing.ts
//
// Which plan a signed-in account pays for, decided on the server from the
// account itself — never from the request body.
//
//   - Booking Agent: an active booker_profiles row and no band (lib/accountSide
//     isAgentShape). Billed on the "stripe_agent_price_id" price.
//   - Band Admin: everyone else who can pay (band admins). Billed on
//     "stripe_band_price_id".
//   - Members and superadmin never pay.
import type { SupabaseClient } from '@supabase/supabase-js';

export type BillingPlan = 'band_admin' | 'agent';

export interface BillingAccount {
  plan: BillingPlan;
  email: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

/** Platform setting that holds the Stripe price for each plan. */
export const PRICE_SETTING: Record<BillingPlan, 'stripe_band_price_id' | 'stripe_agent_price_id'> = {
  band_admin: 'stripe_band_price_id',
  agent: 'stripe_agent_price_id',
};

/** Where Stripe sends people back to, per plan (paths on the site). */
export const RETURN_PATHS: Record<BillingPlan, { success: string; cancel: string; portal: string }> = {
  band_admin: { success: '/band?subscribed=1', cancel: '/pricing?cancelled=1', portal: '/settings' },
  agent: { success: '/agent/settings?subscribed=1', cancel: '/agent/settings?cancelled=1', portal: '/agent/settings' },
};

export class BillingError extends Error {
  constructor(public readonly status: 403 | 404, message: string) {
    super(message);
    this.name = 'BillingError';
  }
}

/**
 * Loads the caller's billing account and works out their plan.
 *
 * @param service service-role client (caller already verified from the token)
 * @param userId  verified auth user id
 * @throws BillingError 404 when the profile is missing, 403 for members/superadmin
 * @throws Error when a lookup fails
 */
export async function getBillingAccount(service: SupabaseClient, userId: string): Promise<BillingAccount> {
  const { data: profile, error } = await service
    .from('profiles')
    .select('role, act_id, email, stripe_customer_id, stripe_subscription_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`billing profile lookup failed: ${error.message}`);
  if (!profile) throw new BillingError(404, 'Profile not found');
  if (profile.role !== 'band_admin') {
    throw new BillingError(403, 'This account does not have a paid plan.');
  }

  let plan: BillingPlan = 'band_admin';
  if (!profile.act_id) {
    const { data: booker, error: bookerErr } = await service
      .from('booker_profiles')
      .select('id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (bookerErr) throw new Error(`agent workspace lookup failed: ${bookerErr.message}`);
    if (booker) plan = 'agent';
  }

  return {
    plan,
    email: profile.email ?? null,
    stripeCustomerId: profile.stripe_customer_id ?? null,
    stripeSubscriptionId: profile.stripe_subscription_id ?? null,
  };
}
