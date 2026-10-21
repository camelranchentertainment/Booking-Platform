-- Rollback for 20261021150000_booker_profiles_signup_only.sql
-- Restores the original policy letting a signed-in user insert their own
-- agent profile (as in 20261010120000_booker_workspace_foundation.sql).
begin;
drop policy if exists booker_profiles_insert_own on public.booker_profiles;
create policy booker_profiles_insert_own on public.booker_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));
commit;
