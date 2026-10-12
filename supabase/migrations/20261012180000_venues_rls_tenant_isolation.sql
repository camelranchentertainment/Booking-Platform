-- supabase/migrations/20261012180000_venues_rls_tenant_isolation.sql
--
-- Security fix: each band can only see and change its own venues.
--
-- Before this migration (verified on production 2026-10-12):
--   * venues_select was USING (auth.uid() IS NOT NULL): every signed-in user,
--     Members included, could read every band's venues.
--   * venues_insert / venues_update / venues_delete only checked that the caller
--     was a band_admin, not that the venue belonged to their band. Permissive
--     policies are OR'd, so they overrode the correctly scoped
--     "Band admin can manage their venues" policy. Any band admin could edit or
--     delete another band's venues (a delete cascades into tour_venues,
--     campaign_venues and followup_queue).
--
-- After:
--   * SELECT: superadmin, or any user whose profile belongs to the venue's band.
--   * INSERT / UPDATE / DELETE: superadmin, or the band's band_admin.
--     WITH CHECK also stops a venue being moved into another band.
--
-- Data fix (runs first, so nothing disappears from anyone's screen):
--   Some rows point at a venue owned by a DIFFERENT band (production at
--   authoring time: 1 booking, 0 tour_venues, 0 campaign_venues). Under the new
--   policies the owning band's users would lose sight of that venue. For each
--   (band, foreign venue) pair we copy the venue into that band and repoint the
--   band's rows at the copy. The original venue is untouched. Everything is
--   recorded in _fix_20261012_venue_split_* so the rollback is exact.
--
-- Rollback: supabase/migrations/rollback/20261012180000_venues_rls_tenant_isolation.down.sql

begin;

-- ─── 1. Helper functions ──────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can read profiles without going through
-- profiles' own RLS (which only exposes a user's own row anyway). STABLE and
-- wrapped in (SELECT ...) inside policies so Postgres evaluates them once per
-- statement instead of once per row.

create or replace function public.app_current_act_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select act_id from public.profiles where id = auth.uid()
$$;

create or replace function public.app_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.app_is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'superadmin' from public.profiles where id = auth.uid()), false)
$$;

revoke all on function public.app_current_act_id() from public, anon;
revoke all on function public.app_current_role()   from public, anon;
revoke all on function public.app_is_superadmin()  from public, anon;
grant execute on function public.app_current_act_id() to authenticated, service_role;
grant execute on function public.app_current_role()   to authenticated, service_role;
grant execute on function public.app_is_superadmin()  to authenticated, service_role;

-- ─── 2. Data fix: give each band its own copy of foreign venues it uses ───────

create table if not exists public._fix_20261012_venue_split_map (
  old_venue_id  uuid not null,
  target_act_id uuid not null,
  new_venue_id  uuid not null unique,
  created_at    timestamptz not null default now(),
  primary key (old_venue_id, target_act_id)
);
alter table public._fix_20261012_venue_split_map enable row level security;
-- No policies: service role only.

create table if not exists public._fix_20261012_venue_split_rows (
  table_name    text not null check (table_name in ('bookings','tour_venues','campaign_venues')),
  row_id        uuid not null,
  old_venue_id  uuid not null,
  new_venue_id  uuid not null,
  primary key (table_name, row_id)
);
alter table public._fix_20261012_venue_split_rows enable row level security;
-- No policies: service role only.

-- Every (band, venue) pair where the band's row points at another band's venue.
insert into public._fix_20261012_venue_split_map (old_venue_id, target_act_id, new_venue_id)
select pairs.venue_id, pairs.act_id, gen_random_uuid()
from (
  select distinct b.venue_id, b.act_id
  from public.bookings b
  join public.venues v on v.id = b.venue_id
  where b.act_id is not null and v.act_id is distinct from b.act_id
  union
  select distinct tv.venue_id, t.act_id
  from public.tour_venues tv
  join public.tours  t on t.id = tv.tour_id
  join public.venues v on v.id = tv.venue_id
  where t.act_id is not null and v.act_id is distinct from t.act_id
  union
  select distinct cv.venue_id, coalesce(cv.act_id, c.act_id)
  from public.campaign_venues cv
  join public.campaigns c on c.id = cv.campaign_id
  join public.venues    v on v.id = cv.venue_id
  where coalesce(cv.act_id, c.act_id) is not null
    and v.act_id is distinct from coalesce(cv.act_id, c.act_id)
) pairs
on conflict (old_venue_id, target_act_id) do nothing;

-- Copy each venue row (every column) into the target band under its new id.
-- jsonb_populate_record keeps this correct even if venues gains columns later.
insert into public.venues
select (jsonb_populate_record(
          null::public.venues,
          to_jsonb(v) || jsonb_build_object(
            'id',         m.new_venue_id,
            'act_id',     m.target_act_id,
            'source',     'tenant_split',
            'created_at', now(),
            'updated_at', now()
          )
       )).*
from public._fix_20261012_venue_split_map m
join public.venues v on v.id = m.old_venue_id
where not exists (select 1 from public.venues x where x.id = m.new_venue_id);

-- Record, then repoint, the rows that used the foreign venue.
insert into public._fix_20261012_venue_split_rows (table_name, row_id, old_venue_id, new_venue_id)
select 'bookings', b.id, b.venue_id, m.new_venue_id
from public.bookings b
join public._fix_20261012_venue_split_map m
  on m.old_venue_id = b.venue_id and m.target_act_id = b.act_id
on conflict do nothing;

insert into public._fix_20261012_venue_split_rows (table_name, row_id, old_venue_id, new_venue_id)
select 'tour_venues', tv.id, tv.venue_id, m.new_venue_id
from public.tour_venues tv
join public.tours t on t.id = tv.tour_id
join public._fix_20261012_venue_split_map m
  on m.old_venue_id = tv.venue_id and m.target_act_id = t.act_id
on conflict do nothing;

insert into public._fix_20261012_venue_split_rows (table_name, row_id, old_venue_id, new_venue_id)
select 'campaign_venues', cv.id, cv.venue_id, m.new_venue_id
from public.campaign_venues cv
join public.campaigns c on c.id = cv.campaign_id
join public._fix_20261012_venue_split_map m
  on m.old_venue_id = cv.venue_id and m.target_act_id = coalesce(cv.act_id, c.act_id)
on conflict do nothing;

update public.bookings b set venue_id = r.new_venue_id
from public._fix_20261012_venue_split_rows r
where r.table_name = 'bookings' and r.row_id = b.id;

update public.tour_venues tv set venue_id = r.new_venue_id
from public._fix_20261012_venue_split_rows r
where r.table_name = 'tour_venues' and r.row_id = tv.id;

update public.campaign_venues cv set venue_id = r.new_venue_id
from public._fix_20261012_venue_split_rows r
where r.table_name = 'campaign_venues' and r.row_id = cv.id;

-- Fail the whole migration if any cross-band reference survived.
do $$
declare
  leftover int;
begin
  select
      (select count(*) from public.bookings b join public.venues v on v.id = b.venue_id
        where b.act_id is not null and v.act_id is distinct from b.act_id)
    + (select count(*) from public.tour_venues tv join public.tours t on t.id = tv.tour_id
        join public.venues v on v.id = tv.venue_id
        where t.act_id is not null and v.act_id is distinct from t.act_id)
    + (select count(*) from public.campaign_venues cv join public.campaigns c on c.id = cv.campaign_id
        join public.venues v on v.id = cv.venue_id
        where coalesce(cv.act_id, c.act_id) is not null
          and v.act_id is distinct from coalesce(cv.act_id, c.act_id))
  into leftover;
  if leftover > 0 then
    raise exception 'venues tenant split incomplete: % cross-band references remain', leftover;
  end if;
end $$;

-- ─── 3. Replace the venue policies ────────────────────────────────────────────

drop policy if exists "Band admin can manage their venues" on public.venues;
drop policy if exists venues_select on public.venues;
drop policy if exists venues_insert on public.venues;
drop policy if exists venues_update on public.venues;
drop policy if exists venues_delete on public.venues;

-- Any user in the band can read its venues (Members need them for Tour Day View).
create policy venues_select on public.venues
  for select to authenticated
  using (
    (select public.app_is_superadmin())
    or act_id = (select public.app_current_act_id())
  );

create policy venues_insert on public.venues
  for insert to authenticated
  with check (
    (select public.app_is_superadmin())
    or ( act_id = (select public.app_current_act_id())
         and (select public.app_current_role()) = 'band_admin' )
  );

create policy venues_update on public.venues
  for update to authenticated
  using (
    (select public.app_is_superadmin())
    or ( act_id = (select public.app_current_act_id())
         and (select public.app_current_role()) = 'band_admin' )
  )
  with check (
    (select public.app_is_superadmin())
    or ( act_id = (select public.app_current_act_id())
         and (select public.app_current_role()) = 'band_admin' )
  );

create policy venues_delete on public.venues
  for delete to authenticated
  using (
    (select public.app_is_superadmin())
    or ( act_id = (select public.app_current_act_id())
         and (select public.app_current_role()) = 'band_admin' )
  );

commit;
