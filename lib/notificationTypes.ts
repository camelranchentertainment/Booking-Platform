/**
 * The one list of notification types the platform writes.
 *
 * The database enforces the same list with `notifications_type_check`
 * (see supabase/migrations/20261027040000_notification_types.sql). Any
 * insert with a type outside the constraint is rejected by Postgres, and
 * because most callers fire-and-forget the insert, the user simply never sees
 * the notice. Before this list existed, bulk-outreach summaries, venue-reply
 * alerts, "email sent" notices, invite and billing notices were all being
 * dropped that way, as were the "show confirmed" notices sent to members.
 *
 * To add a type: add it here AND in a new migration that recreates the
 * constraint. `__tests__/lib/notificationTypes.test.ts` fails if the two
 * drift apart.
 */
export const NOTIFICATION_TYPES = [
  'advance_due',
  'thank_you_due',
  'follow_up_due',
  'post_show_review',
  'booking_confirmed',
  'bulk_send',
  'venue_replied',
  'email_sent',
  'invite_accepted',
  'subscription_active',
  'subscription_cancelled',
  'general',
  'system',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Narrows an unknown string (e.g. a row read back from the DB) to a known type. */
export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** Short label shown on the notification chip in the bell menu. */
export const NOTIFICATION_LABEL: Record<NotificationType, string> = {
  advance_due: 'Advance Due',
  thank_you_due: 'Thank You Due',
  follow_up_due: 'Follow Up',
  post_show_review: 'Post-Show',
  booking_confirmed: 'Confirmed',
  bulk_send: 'Bulk Send',
  venue_replied: 'Venue Reply',
  email_sent: 'Email Sent',
  invite_accepted: 'Invite',
  subscription_active: 'Billing',
  subscription_cancelled: 'Billing',
  general: 'Notice',
  system: 'Notice',
};

/** Chip colour per type; CSS variables so both themes stay legible. */
export const NOTIFICATION_COLOR: Record<NotificationType, string> = {
  advance_due: '#f97316',
  thank_you_due: '#a78bfa',
  follow_up_due: '#fbbf24',
  post_show_review: 'var(--orange)',
  booking_confirmed: '#34d399',
  bulk_send: '#34d399',
  venue_replied: '#38bdf8',
  email_sent: 'var(--text-muted)',
  invite_accepted: 'var(--accent)',
  subscription_active: '#34d399',
  subscription_cancelled: '#f87171',
  general: 'var(--accent)',
  system: 'var(--accent)',
};
