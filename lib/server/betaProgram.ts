// lib/server/betaProgram.ts
// Database side of the founding beta program. All calls use the service-role
// client because beta_applications has no RLS policies (service-role only).

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../apiError';
import { betaTrialEndsAt, canGrantBetaYear } from '../domain/betaProgram';

/** Number of approved applications — the figure the public counter is based on. */
export async function countApprovedBetaApplications(service: SupabaseClient): Promise<number> {
  const { count, error } = await service
    .from('beta_applications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved');
  if (error) throw new AppError(500, 'Could not read beta applications', false);
  return count ?? 0;
}

export type BetaGrantOutcome =
  | { granted: true; profileId: string; trialEndsAt: string }
  | { granted: false; reason: 'no_account' | 'already_granted' | 'not_eligible' };

/**
 * Applies the free year to the account registered under the application's
 * email, if one exists and is eligible, and records the grant on the
 * application. Safe to call more than once: an application that already has
 * granted_at is left alone.
 *
 * @param applicationId an APPROVED application
 */
export async function grantBetaYear(service: SupabaseClient, applicationId: string): Promise<BetaGrantOutcome> {
  const { data: app, error: appErr } = await service
    .from('beta_applications')
    .select('id, email, status, granted_at')
    .eq('id', applicationId)
    .maybeSingle();
  if (appErr) throw new AppError(500, 'Could not read the application', false);
  if (!app || app.status !== 'approved') throw new AppError(409, 'Application is not approved');
  if (app.granted_at) return { granted: false, reason: 'already_granted' };

  // profiles.email is stored as entered at sign-up, so match case-insensitively.
  // ilike treats _ and % as wildcards; escape them so only the exact address matches.
  // (PostgREST also maps * to %, which is why betaApplicationSchema rejects * in emails.)
  const pattern = String(app.email).replace(/[\\%_]/g, c => `\\${c}`);
  const { data: profile, error: profErr } = await service
    .from('profiles')
    .select('id, role, subscription_status, trial_ends_at')
    .ilike('email', pattern)
    .maybeSingle();
  if (profErr) throw new AppError(500, 'Could not look up the account', false);
  if (!profile) return { granted: false, reason: 'no_account' };
  if (!canGrantBetaYear(profile)) return { granted: false, reason: 'not_eligible' };

  return applyGrant(service, app.id, profile.id, profile.trial_ends_at);
}

/**
 * Called right after a new band admin registers: if an approved, not-yet-granted
 * application exists for their email, the free year is applied now.
 * Never throws — a failure here must not break sign-up; it is logged and the
 * grant can still be made from the admin panel.
 */
export async function grantBetaYearOnRegistration(
  service: SupabaseClient,
  profileId: string,
  email: string,
): Promise<boolean> {
  try {
    // Application emails are stored lowercased by betaApplicationSchema, so an exact match suffices.
    const { data: app } = await service
      .from('beta_applications')
      .select('id')
      .eq('status', 'approved')
      .is('granted_at', null)
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();
    if (!app) return false;

    const { data: profile } = await service
      .from('profiles')
      .select('role, subscription_status, trial_ends_at')
      .eq('id', profileId)
      .maybeSingle();
    if (!profile || !canGrantBetaYear(profile)) return false;

    // Registration has just set the standard 14-day trial; the beta year replaces
    // it (counted from today) rather than stacking on top of it.
    await applyGrant(service, app.id, profileId, null);
    return true;
  } catch (err) {
    console.error('[beta] grant on registration failed', { profileId, err });
    return false;
  }
}

async function applyGrant(
  service: SupabaseClient,
  applicationId: string,
  profileId: string,
  currentTrialEndsAt: string | null,
): Promise<BetaGrantOutcome> {
  const trialEndsAt = betaTrialEndsAt(currentTrialEndsAt);

  const { error: profErr } = await service
    .from('profiles')
    .update({ trial_ends_at: trialEndsAt, subscription_status: 'trialing' })
    .eq('id', profileId);
  if (profErr) throw new AppError(500, 'Could not apply the free year to the account', false);

  // Guarded on granted_at so a concurrent second grant cannot overwrite the first record.
  const { error: appErr } = await service
    .from('beta_applications')
    .update({ granted_profile_id: profileId, granted_at: new Date().toISOString() })
    .eq('id', applicationId)
    .is('granted_at', null);
  if (appErr) throw new AppError(500, 'Free year applied, but the application record was not updated', false);

  return { granted: true, profileId, trialEndsAt };
}
