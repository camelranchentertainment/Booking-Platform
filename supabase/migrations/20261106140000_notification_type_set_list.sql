-- 20261106140000_notification_type_set_list.sql
-- Allow the 'set_list_published' notification type.
--
-- Written by pages/api/set-lists/[id]/publish.ts when a band admin pushes a
-- set list: one notice per member on that show's lineup. Without this the
-- inserts are rejected by notifications_type_check and the notice never shows.
--
-- lib/notificationTypes.ts holds the same list; __tests__/lib/notificationTypes.test.ts
-- fails if the two drift apart. Widening the list validates cleanly against
-- every existing row. No new table: grants and RLS on notifications are unchanged.
-- Rollback: rollback/20261106140000_notification_type_set_list.down.sql

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
    'set_list_published',
    'general',
    'system'
  ]::text[]));

commit;
