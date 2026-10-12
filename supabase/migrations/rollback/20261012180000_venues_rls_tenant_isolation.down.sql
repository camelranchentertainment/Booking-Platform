-- supabase/migrations/rollback/20261012180000_venues_rls_tenant_isolation.down.sql
--
-- Undoes 20261012180000_venues_rls_tenant_isolation.sql.
--
-- WARNING: this restores the old policies, which let every signed-in user read
-- every band's venues and let any band admin edit or delete any band's venues.
-- Only run it to recover from a broken deploy, and re-apply the fix promptly.
--
-- Order matters: repoint rows back to the original venues BEFORE deleting the
-- copies, otherwise bookings.venue_id would be nulled (ON DELETE SET NULL) and
-- tour_venues / campaign_venues rows deleted (ON DELETE CASCADE).

begin;

-- 1. Old policies (exact definitions as found on production 2026-10-12).
drop policy if exists venues_select on public.venues;
drop policy if exists venues_insert on public.venues;
drop policy if exists venues_update on public.venues;
drop policy if exists venues_delete on public.venues;

create policy "Band admin can manage their venues" on public.venues
  for all
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.act_id = venues.act_id
      and p.role = any (array['band_admin'::text, 'superadmin'::text])
  ));

create policy venues_select on public.venues
  for select
  using (auth.uid() is not null);

create policy venues_insert on public.venues
  for insert
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = any (array['band_admin'::text, 'superadmin'::text])
  ));

create policy venues_update on public.venues
  for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = any (array['band_admin'::text, 'superadmin'::text])
  ));

create policy venues_delete on public.venues
  for delete
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = any (array['band_admin'::text, 'superadmin'::text])
  ));

-- 2. Repoint rows to the original venues, then remove the copies.
update public.bookings b set venue_id = r.old_venue_id
from public._fix_20261012_venue_split_rows r
where r.table_name = 'bookings' and r.row_id = b.id and b.venue_id = r.new_venue_id;

update public.tour_venues tv set venue_id = r.old_venue_id
from public._fix_20261012_venue_split_rows r
where r.table_name = 'tour_venues' and r.row_id = tv.id and tv.venue_id = r.new_venue_id;

update public.campaign_venues cv set venue_id = r.old_venue_id
from public._fix_20261012_venue_split_rows r
where r.table_name = 'campaign_venues' and r.row_id = cv.id and cv.venue_id = r.new_venue_id;

-- Only delete copies nothing else has started using since the fix.
delete from public.venues v
using public._fix_20261012_venue_split_map m
where v.id = m.new_venue_id
  and not exists (select 1 from public.bookings        x where x.venue_id = v.id)
  and not exists (select 1 from public.tour_venues     x where x.venue_id = v.id)
  and not exists (select 1 from public.campaign_venues x where x.venue_id = v.id)
  and not exists (select 1 from public.contacts        x where x.venue_id = v.id)
  and not exists (select 1 from public.email_log       x where x.venue_id = v.id)
  and not exists (select 1 from public.followup_queue  x where x.venue_id = v.id);

drop table if exists public._fix_20261012_venue_split_rows;
drop table if exists public._fix_20261012_venue_split_map;

-- 3. Helper functions (nothing else depends on them yet).
drop function if exists public.app_is_superadmin();
drop function if exists public.app_current_role();
drop function if exists public.app_current_act_id();

commit;
