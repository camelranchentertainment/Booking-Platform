// lib/hooks/useShellAccess.ts
//
// The page-access rules every signed-in page enforces: no session → /login,
// lapsed subscription → /pricing, wrong role → that role's home, and a Booking
// Agent account on a band page → its own workspace (/agent).
//
// AppShell and PopoutShell both call this, so a page opened without the
// sidebar chrome (the booking agent pop-out window) is gated exactly like
// every other page instead of by a second, drifting copy of the rules.

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import { fetchHasAgentWorkspace, isAgentShape } from '../accountSide';
import type { UserProfile } from '../types';

export type ShellRole = 'band_admin' | 'member' | 'superadmin';
export type RequireRole = ShellRole | ShellRole[] | null;

/** Whole days left in a trial (0 once it has ended or when there is no end date). */
export function daysLeft(trialEndsAt: string | null | undefined): number {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000));
}

/** True when a band admin's billing state should send them to /pricing. */
export function needsSubscription(profile: UserProfile): boolean {
  if (profile.role === 'superadmin' || profile.role === 'member') return false;
  const status = profile.subscription_status;
  if (!status) return false;  // no billing record yet — let them in
  if (status === 'active') return false;
  if (status === 'trialing' && daysLeft(profile.trial_ends_at) > 0) return false;
  return true;
}

/**
 * Runs the redirects for a page that requires `requireRole` and returns the
 * auth state. Superadmin passes every role check (support work).
 */
export function useShellAccess(requireRole: RequireRole) {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();

  // Redirect to login when auth resolves with no session
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Role-based and subscription redirects — re-run on every route change
  useEffect(() => {
    if (authLoading || !user || !profile) return;

    if (needsSubscription(profile) && router.pathname !== '/pricing') {
      router.replace('/pricing?trial=expired');
      return;
    }

    const allowedRoles = Array.isArray(requireRole) ? requireRole : requireRole ? [requireRole] : null;
    if (profile.role !== 'superadmin' && allowedRoles && !allowedRoles.includes(profile.role as ShellRole)) {
      if (profile.role === 'band_admin') router.replace('/band');
      else router.replace('/member/calendar');
    }
  }, [authLoading, user, profile, requireRole, router.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each login belongs to one side (lib/accountSide.ts). An agent account that
  // reaches a band page is sent to its own workspace. Only band-less non-member
  // profiles are checked, so band accounts never pay for this lookup.
  useEffect(() => {
    if (authLoading || !user || !profile) return;
    if (!isAgentShape(profile.role, profile.act_id)) return;
    let cancelled = false;
    void fetchHasAgentWorkspace(user.id).then(isAgent => {
      if (!cancelled && isAgent) router.replace('/agent');
    });
    return () => { cancelled = true; };
  }, [authLoading, user, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  return { user, profile, authLoading };
}
