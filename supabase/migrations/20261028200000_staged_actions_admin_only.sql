-- 20261028200000_staged_actions_admin_only.sql
--
-- Security fix: band members (role 'member') could read and change their
-- band's AI staged actions through the Data API.
--
-- ai_staged_actions holds what the booking assistant proposes before an
-- admin approves it: show deals and fees, payments received, expenses,
-- outgoing email drafts. The policies only checked that the row's act_id
-- matched the caller's band, not the caller's role, so a plain member could:
--   * SELECT the payloads (money members must never see);
--   * UPDATE a pending proposal's payload between an admin reading its
--     summary and clicking Approve, so the admin would execute the member's
--     version (approval runs as the admin, via the service role);
--   * INSERT proposals into the band's queue.
--
-- After this: only a band_admin or superadmin linked to the act can read,
-- add or change the band's staged actions directly. The app itself never
-- touches this table with a user session; /api/agent and
-- /api/help/actions/execute use the service role and already require an
-- admin, so nothing in the app changes.
--
-- Read-only check before writing this: all 110 existing rows were created
-- by band admins; none are pending.
--
-- Rollback: supabase/migrations/rollback/20261028200000_staged_actions_admin_only.down.sql

begin;

drop policy if exists ai_staged_actions_select_own_act on public.ai_staged_actions;
drop policy if exists ai_staged_actions_insert_own_act on public.ai_staged_actions;
drop policy if exists ai_staged_actions_update_own_act on public.ai_staged_actions;

create policy ai_staged_actions_select_own_act on public.ai_staged_actions
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.act_id = ai_staged_actions.act_id and p.role in ('band_admin', 'superadmin')
  ));

create policy ai_staged_actions_insert_own_act on public.ai_staged_actions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.act_id = ai_staged_actions.act_id and p.role in ('band_admin', 'superadmin')
    )
  );

create policy ai_staged_actions_update_own_act on public.ai_staged_actions
  for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.act_id = ai_staged_actions.act_id and p.role in ('band_admin', 'superadmin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.act_id = ai_staged_actions.act_id and p.role in ('band_admin', 'superadmin')
  ));

commit;
