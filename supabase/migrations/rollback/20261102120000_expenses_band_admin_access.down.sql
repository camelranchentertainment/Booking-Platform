-- Rollback for 20261102120000_expenses_band_admin_access.sql

begin;

drop policy if exists expenses_band_admin_select on public.expenses;
drop policy if exists expenses_band_admin_update on public.expenses;

commit;
