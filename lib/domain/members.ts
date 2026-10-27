// lib/domain/members.ts
// Pure helpers for the Members page (pages/band/members.tsx): roster counts,
// the two-admin limit, initials and pay labels. Unit-tested; no React, no I/O.

/** Most band admins a band may have, counting pending admin invites. */
export const MAX_BAND_ADMINS = 2;

export interface RosterPerson {
  id: string;
  name: string;
  instrument_role: string | null;
  default_pay_amount: number | null;
  phone: string | null;
  email: string | null;
  linked_user_id: string | null;
  is_active: boolean;
}

export interface BandAccount {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  created_at: string;
  personnel_id: string | null;
}

/** Up to two letters from a name (first + last word) or the email's local part. */
export function initialsOf(name?: string | null, email?: string | null): string {
  const n = (name ?? '').trim();
  if (n) {
    const words = n.split(/\s+/).filter(Boolean);
    const first = words[0]?.[0] ?? '';
    const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : (words[0]?.[1] ?? '');
    return (first + last).toUpperCase() || '?';
  }
  const local = (email ?? '').split('@')[0] ?? '';
  return local.slice(0, 2).toUpperCase() || '?';
}

/** Admin seats used: current admins plus pending admin invites. */
export function adminSeatsUsed(accounts: readonly BandAccount[], invites: readonly PendingInvite[]): number {
  return accounts.filter(a => a.role === 'band_admin').length + invites.filter(i => i.role === 'band_admin').length;
}

export interface MembersSummary {
  roster: number;
  withLogin: number;
  needInvite: number;
  admins: number;
  pending: number;
}

/** Counts for the metric trackers and the hero line. */
export function summarizeMembers(
  roster: readonly RosterPerson[],
  accounts: readonly BandAccount[],
  invites: readonly PendingInvite[],
): MembersSummary {
  const invitedPersonnel = new Set(invites.map(i => i.personnel_id).filter(Boolean));
  return {
    roster: roster.length,
    withLogin: roster.filter(p => p.linked_user_id).length,
    needInvite: roster.filter(p => !p.linked_user_id && p.email && !invitedPersonnel.has(p.id)).length,
    admins: adminSeatsUsed(accounts, invites),
    pending: invites.length,
  };
}

/** One-line status under the page title. */
export function membersHeroLine(s: MembersSummary): string {
  if (s.roster === 0) return 'No one on the roster yet — add your band and crew.';
  const parts = [`${s.roster} on the roster`, `${s.withLogin} can log in`];
  if (s.pending) parts.push(`${s.pending} invite${s.pending === 1 ? '' : 's'} waiting`);
  return parts.join(' · ');
}

/** "$150 / show" or "No default pay". */
export function payLabel(amount: number | null): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return 'No default pay';
  const n = Number(amount);
  const formatted = n % 1 === 0 ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `$${formatted} / show`;
}

/** Plain email check for the invite form; the server validates again. */
export function isInviteEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Readable "how long ago" for a pending invite. */
export function sentAgo(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days) || days <= 0) return 'sent today';
  if (days === 1) return 'sent yesterday';
  return `sent ${days} days ago`;
}
