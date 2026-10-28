-- 20261028180000_tours_admin_only_writes.sql
--
-- Security fix: band members (role 'member') could change and delete their
-- band's tours and tour targets through the API.
--
--   * tours.tours_member_select was FOR ALL, not FOR SELECT, so any profile
--     linked to the act could insert, update and delete its tours.
--   * tours.tours_creator_all let anyone insert a tour into ANY act as long as
--     created_by was themselves (no act check).
--   * tour_venues.tour_venues_access was FOR ALL for every profile linked to
--     the act, so members could edit or delete tour targets.
--
-- After this: members (and everyone linked to the act) can still READ tours
-- and targets; only the act owner, the act's band admins and superadmin can
-- write. Service-role routes are unaffected (they bypass RLS and check the
-- caller's role themselves). Read-only check before writing this: all 27
-- existing tours were created by the act owner or one of its admins, so no
-- one loses access to a tour they made.
--
-- Rollback: supabase/migrations/rollback/20261028180000_tours_admin_only_writes.down.sql

begin;

-- ── tours ───────────────────────────────────────────────────────────────────
drop policy if exists tours_member_select on public.tours;
drop policy if exists tours_creator_all  on public.tours;

create policy tours_member_select on public.tours
  for select
  using (act_id in (select p.act_id from public.profiles p where p.id = auth.uid()));

create policy tours_admin_write on public.tours
  for all
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.act_id = tours.act_id and p.role in ('band_admin', 'superadmin')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.act_id = tours.act_id and p.role in ('band_admin', 'superadmin')
  ));
-- tours_act_owner (act owner: all) is unchanged.

-- ── tour_venues ─────────────────────────────────────────────────────────────
drop policy if exists tour_venues_access on public.tour_venues;

create policy tour_venues_read on public.tour_venues
  for select
  using (
    tour_id in (
      select t.id from public.tours t join public.acts a on a.id = t.act_id
      where a.owner_id = auth.uid()
         or a.id in (select p.act_id from public.profiles p where p.id = auth.uid() and p.act_id is not null)
    )
    or (select p.role from public.profiles p where p.id = auth.uid()) = 'superadmin'
  );

create policy tour_venues_admin_write on public.tour_venues
  for all
  using (
    tour_id in (
      select t.id from public.tours t join public.acts a on a.id = t.act_id
      where a.owner_id = auth.uid()
         or a.id in (select p.act_id from public.profiles p
                     where p.id = auth.uid() and p.act_id is not null and p.role in ('band_admin', 'superadmin'))
    )
    or (select p.role from public.profiles p where p.id = auth.uid()) = 'superadmin'
  )
  with check (
    tour_id in (
      select t.id from public.tours t join public.acts a on a.id = t.act_id
      where a.owner_id = auth.uid()
         or a.id in (select p.act_id from public.profiles p
                     where p.id = auth.uid() and p.act_id is not null and p.role in ('band_admin', 'superadmin'))
    )
    or (select p.role from public.profiles p where p.id = auth.uid()) = 'superadmin'
  );

commit;
