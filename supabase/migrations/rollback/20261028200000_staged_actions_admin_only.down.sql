-- Rollback for 20261028200000_staged_actions_admin_only.sql
-- Restores the previous (role-blind) policies exactly as they were on Oct 28 2026.

begin;

drop policy if exists ai_staged_actions_select_own_act on public.ai_staged_actions;
drop policy if exists ai_staged_actions_insert_own_act on public.ai_staged_actions;
drop policy if exists ai_staged_actions_update_own_act on public.ai_staged_actions;

create policy ai_staged_actions_select_own_act on public.ai_staged_actions
  for select
  using (act_id = (select profiles.act_id from public.profiles where profiles.id = auth.uid()));

create policy ai_staged_actions_insert_own_act on public.ai_staged_actions
  for insert
  with check (
    act_id = (select profiles.act_id from public.profiles where profiles.id = auth.uid())
    and created_by = auth.uid()
  );

create policy ai_staged_actions_update_own_act on public.ai_staged_actions
  for update
  using (act_id = (select profiles.act_id from public.profiles where profiles.id = auth.uid()))
  with check (act_id = (select profiles.act_id from public.profiles where profiles.id = auth.uid()));

commit;
