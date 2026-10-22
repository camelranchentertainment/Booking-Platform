-- Rollback for 20261022030000_profiles_past_due_status.sql.
-- Any 'past_due' rows must be moved first or the old constraint will not apply.
update public.profiles set subscription_status = 'inactive' where subscription_status = 'past_due';
alter table public.profiles drop constraint if exists profiles_subscription_status_check;
alter table public.profiles add constraint profiles_subscription_status_check
  check (subscription_status = any (array['active', 'inactive', 'trialing', 'cancelled']));
