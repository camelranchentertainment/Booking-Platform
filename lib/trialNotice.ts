// lib/trialNotice.ts
//
// Who gets the "free period is ending" notice, and what it says. Only the person
// who pays sees it: band admins and agents. Members never subscribe.

/** A free year deserves more warning than the old 7 days. */
export const TRIAL_NOTICE_DAYS = 30;
const URGENT_DAYS = 3;

export interface TrialNotice {
  message: string;
  urgent: boolean;
}

/** Returns the notice to show, or null when none is due. */
export function trialNotice(
  account: { role?: string | null; subscription_status?: string | null; trial_ends_at?: string | null } | null | undefined,
  side: 'band' | 'agent',
  now: number = Date.now(),
): TrialNotice | null {
  if (!account || account.subscription_status !== 'trialing' || !account.trial_ends_at) return null;
  if (side === 'band' && account.role !== 'band_admin') return null;

  const end = new Date(account.trial_ends_at).getTime();
  if (Number.isNaN(end)) return null;
  const days = Math.ceil((end - now) / 86_400_000);
  if (days > TRIAL_NOTICE_DAYS) return null;

  const date = new Date(end).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  if (days <= 0) return { message: 'Your free period has ended. Subscribe to keep your account running.', urgent: true };
  if (days === 1) return { message: `Your free period ends tomorrow, ${date}.`, urgent: true };
  return { message: `Your free period ends ${date}, ${days} days from now.`, urgent: days <= URGENT_DAYS };
}
