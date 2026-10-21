// lib/server/accountDeletion.ts
//
// Pre-flight checks for self-service account deletion (/api/account/delete).
//
// Deleting a row in auth.users fires the foreign keys pointing at it. In the
// live schema (checked 2026-10-21) that means:
//   - CASCADE on bookings.created_by, tours.created_by and expenses.user_id:
//     deleting the user would silently delete band shows, tours and expenses.
//     Financial data is archived, never deleted, so these must block.
//   - NO ACTION on several audit columns (venues.created_by,
//     bookings.confirmed_by, email_log.sent_by, ...): Postgres would reject the
//     delete with a foreign-key error, which surfaced as an opaque 500.
//   - SET NULL on acts.owner_id: deleting an owner would orphan the band.
// Every one of those cases is reported here as a blocker with a clear reason,
// so the route can refuse cleanly instead of destroying data or crashing.
import type { SupabaseClient } from '@supabase/supabase-js';

export type DeletionBlockCode =
  | 'SUPERADMIN'
  | 'BAND_ADMIN_HANDOFF_REQUIRED'
  | 'SUBSCRIPTION_ACTIVE'
  | 'ACCOUNT_HAS_BAND_RECORDS';

export interface DeletionBlock {
  code: DeletionBlockCode;
  /** HTTP status the route should return for this block. */
  status: 403 | 409;
  /** Human-readable reason, shown to the user as-is (web and mobile). */
  message: string;
}

/** A column that references the user and would destroy or block on delete. */
interface UserReference {
  table: string;
  column: string;
}

/**
 * Columns referencing auth.users whose ON DELETE behaviour is CASCADE onto band
 * data or NO ACTION. Any row here means the account cannot be deleted safely.
 * Exported for tests; keep in sync with the schema when FKs change.
 */
export const BLOCKING_USER_REFERENCES: readonly UserReference[] = [
  // CASCADE: would delete band data
  { table: 'bookings', column: 'created_by' },
  { table: 'tours', column: 'created_by' },
  { table: 'expenses', column: 'user_id' },
  // NO ACTION: Postgres would reject the delete
  { table: 'venues', column: 'created_by' },
  { table: 'bookings', column: 'confirmed_by' },
  { table: 'bookings', column: 'settled_by' },
  { table: 'email_log', column: 'sent_by' },
  { table: 'act_members', column: 'invited_by' },
  { table: 'act_invitations', column: 'invited_by' },
  { table: 'email_templates', column: 'user_id' },
  { table: 'search_regions', column: 'user_id' },
  { table: 'ai_staged_actions', column: 'executed_by' },
] as const;

const MESSAGES: Record<DeletionBlockCode, string> = {
  SUPERADMIN: 'Superadmin accounts cannot be deleted through this endpoint.',
  BAND_ADMIN_HANDOFF_REQUIRED:
    "You're the band admin, so deleting your account here would remove your band's shows and history. " +
    "Contact us through camelranchbooking.com and we'll hand the band to another admin or close it, then delete your account.",
  SUBSCRIPTION_ACTIVE:
    'Your account still has an active subscription. Cancel it in Settings on camelranchbooking.com, then delete your account.',
  ACCOUNT_HAS_BAND_RECORDS:
    "Your account is linked to band records (shows, venues or emails you created), so it can't be deleted automatically. " +
    "Contact us through camelranchbooking.com and we'll remove it for you.",
};

function block(code: DeletionBlockCode): DeletionBlock {
  return { code, status: code === 'SUPERADMIN' ? 403 : 409, message: MESSAGES[code] };
}

/**
 * Decides whether a user may delete their own account.
 *
 * Checks run in order of how the user should fix them: role first, then
 * billing, then data references. Returns the first blocker, or null when the
 * delete is safe. Fails closed: any lookup error throws.
 *
 * @param service service-role Supabase client (bypasses RLS; caller identity
 *                must already be verified from the Bearer token)
 * @param userId  the verified caller's auth user id
 * @returns the blocker, or null when deletion is safe
 * @throws Error when any lookup fails
 */
export async function findDeletionBlocker(
  service: SupabaseClient,
  userId: string,
): Promise<DeletionBlock | null> {
  const { data: profile, error: profileErr } = await service
    .from('profiles')
    .select('role, stripe_subscription_id')
    .eq('id', userId)
    .maybeSingle();
  if (profileErr) throw new Error(`profile lookup failed: ${profileErr.message}`);

  // A missing profile is allowed through: an orphaned auth user should still be
  // deletable. Ownership and reference checks below still apply.
  if (profile?.role === 'superadmin') return block('SUPERADMIN');
  if (profile?.role === 'band_admin') return block('BAND_ADMIN_HANDOFF_REQUIRED');

  const { count: ownedActs, error: actsErr } = await service
    .from('acts')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId);
  if (actsErr) throw new Error(`act ownership lookup failed: ${actsErr.message}`);
  if ((ownedActs ?? 0) > 0) return block('BAND_ADMIN_HANDOFF_REQUIRED');

  // Only a stored Stripe subscription id means Stripe can still bill this
  // person: the webhook sets it on checkout and clears it on cancellation.
  // subscription_status is NOT a billing signal — registration sets every new
  // account to 'trialing' (a free trial, no Stripe), and comped accounts are
  // 'active' with no subscription — so gating on it blocked every member.
  if (profile?.stripe_subscription_id) return block('SUBSCRIPTION_ACTIVE');

  const counts = await Promise.all(
    BLOCKING_USER_REFERENCES.map(async ({ table, column }) => {
      const { count, error } = await service
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(column, userId);
      if (error) throw new Error(`reference check ${table}.${column} failed: ${error.message}`);
      return count ?? 0;
    }),
  );
  if (counts.some((n) => n > 0)) return block('ACCOUNT_HAS_BAND_RECORDS');

  return null;
}
