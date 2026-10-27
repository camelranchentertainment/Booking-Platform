-- Rollback for 20261027040000_notification_types.sql
-- Restores the original four-type constraint. Rows written with the new types
-- are archived to 'system' first so the old constraint can validate; their
-- message text is untouched.

begin;

update public.notifications
   set type = 'system'
 where type not in ('advance_due', 'thank_you_due', 'follow_up_due', 'system');

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type = any (array['advance_due', 'thank_you_due', 'follow_up_due', 'system']::text[]));

commit;
