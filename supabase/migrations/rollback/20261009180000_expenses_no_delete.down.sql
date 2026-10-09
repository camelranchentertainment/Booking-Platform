-- supabase/migrations/rollback/20261009180000_expenses_no_delete.down.sql
-- Restores the two policies exactly as they were before 20261009180000.

begin;

create policy expenses_delete on public.expenses
  for delete using (auth.uid() = user_id);

create policy expenses_owner_all on public.expenses
  for all using (user_id = auth.uid());

commit;
