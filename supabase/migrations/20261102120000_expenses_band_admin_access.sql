-- 20261102120000_expenses_band_admin_access.sql
--
-- Fix: expenses RLS is per user, so a band with two admins cannot see or edit
-- the band-pay lines the other admin entered on a show page.
--
-- After this: a band admin can read and update every expense of their own act.
-- Members gain nothing. Inserts are unchanged (user_id must be the caller), and
-- there is still no DELETE policy: financial data is archived, never deleted.
-- The existing per-user select/update policies stay; policies add up.
-- Service-role routes are unaffected.
--
-- Rollback: supabase/migrations/rollback/20261102120000_expenses_band_admin_access.down.sql

begin;

create policy expenses_band_admin_select on public.expenses
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'band_admin' and p.act_id = expenses.act_id
  ));

create policy expenses_band_admin_update on public.expenses
  for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'band_admin' and p.act_id = expenses.act_id
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'band_admin' and p.act_id = expenses.act_id
  ));

commit;
