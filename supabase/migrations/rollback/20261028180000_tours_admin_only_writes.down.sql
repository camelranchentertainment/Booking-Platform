-- Rollback for 20261028180000_tours_admin_only_writes.sql
-- Restores the previous (too-broad) policies exactly as they were on Oct 28 2026.

begin;

drop policy if exists tours_member_select   on public.tours;
drop policy if exists tours_admin_write     on public.tours;
drop policy if exists tour_venues_read      on public.tour_venues;
drop policy if exists tour_venues_admin_write on public.tour_venues;

create policy tours_member_select on public.tours
  for all
  using (act_id in (select profiles.act_id from public.profiles where profiles.id = auth.uid()));

create policy tours_creator_all on public.tours
  for all
  using (created_by = auth.uid());

create policy tour_venues_access on public.tour_venues
  for all
  using (
    (tour_id in (
      select t.id from public.tours t join public.acts a on a.id = t.act_id
      where a.owner_id = auth.uid()
         or a.id in (select profiles.act_id from public.profiles where profiles.id = auth.uid() and profiles.act_id is not null)
    ))
    or ((select profiles.role from public.profiles where profiles.id = auth.uid()) = 'superadmin')
  );

commit;
