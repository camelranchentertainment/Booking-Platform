-- 20261027040000_notification_types.sql
-- Widen notifications_type_check to every type the app actually writes.
--
-- The old constraint allowed only advance_due, thank_you_due, follow_up_due
-- and system. These inserts were all being rejected by Postgres, and since
-- the callers don't surface the error, the notices silently never appeared:
--   booking_confirmed       pages/api/bookings/move-status.ts (show confirmed, to every member)
--   bulk_send               pages/api/agent-bulk-send.ts   (assistant bulk outreach summary)
--   venue_replied           pages/api/email/inbound.ts     (a venue replied to outreach)
--   email_sent              lib/emailSend.ts               (an email went out)
--   invite_accepted         pages/api/accept-invite.ts
--   subscription_active     pages/api/stripe/webhook.ts
--   subscription_cancelled  pages/api/stripe/webhook.ts
--   general                 pages/api/invites/send.ts
--   post_show_review        styled in the bell menu, reserved
--
-- lib/notificationTypes.ts holds the same list; a unit test fails if the two
-- drift apart. Existing rows only use thank_you_due / follow_up_due, so the
-- new constraint validates cleanly against current data.
--
-- No new table: existing grants and RLS on notifications are unchanged.

begin;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array[
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
    'system'
  ]::text[]));

commit;
