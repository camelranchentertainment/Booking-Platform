-- rollback/20261106140000_notification_type_set_list.down.sql
--
-- Undoes 20261106140000_notification_type_set_list.sql. Set list notices
-- already sent are removed first, because the narrower constraint would
-- otherwise fail to validate against them.

begin;

delete from public.notifications where type = 'set_list_published';

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
