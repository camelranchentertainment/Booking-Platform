-- supabase/migrations/20261009180000_expenses_no_delete.sql
--
-- Financial data is archived, never deleted (CLAUDE.md). The app now archives
-- (expenses.archived_at) instead of deleting; this removes the database
-- permission that let a signed-in user hard-delete their expense rows directly.
--
-- Before: expenses_delete (DELETE) and expenses_owner_all (ALL, which includes
-- DELETE) both allowed it. expenses_select / _insert / _update already exist
-- with the same owner rule, so dropping these two changes nothing else.
-- No rows change. The service role (server code) is unaffected by RLS; no
-- server code deletes expenses.
--
-- Rollback: supabase/migrations/rollback/20261009180000_expenses_no_delete.down.sql

begin;

drop policy if exists expenses_delete on public.expenses;
drop policy if exists expenses_owner_all on public.expenses;

commit;
