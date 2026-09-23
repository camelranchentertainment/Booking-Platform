-- Replace FOR ALL sharing policies with role-correct, read-only SELECT policies.
-- Authors keep full control of their own notes via the existing per-command
-- owner policies (daily_notes_select/insert/update/delete), which are unchanged.

drop policy if exists "daily_notes_band_admin_read" on public.daily_notes;
drop policy if exists "daily_notes_member_read"     on public.daily_notes;
-- Redundant with the four per-command owner policies:
drop policy if exists "daily_notes_owner_all"       on public.daily_notes;

create policy daily_notes_admin_select on public.daily_notes
  for select to authenticated
  using (
    visibility in ('band_admin', 'all_members')
    and (
      exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.act_id = daily_notes.act_id
          and p.role in ('band_admin', 'superadmin')
      )
      or exists (
        select 1 from public.acts a
        where a.id = daily_notes.act_id
          and a.owner_id = (select auth.uid())
      )
    )
  );

create policy daily_notes_member_select on public.daily_notes
  for select to authenticated
  using (
    visibility = 'all_members'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.act_id = daily_notes.act_id
    )
  );
