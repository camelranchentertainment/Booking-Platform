-- supabase/migrations/20261012220000_remove_tour_target_calendar_shows.sql
--
-- Data fix (no schema change).
--
-- Adding a target venue to a tour used to create a "pitch" show for it, dated on
-- the tour's last day (lib/statusSync.ts#syncBooking). Every target therefore
-- landed on the calendar on one date: LONE STAR (Jan 7–9 2027) showed 34
-- entries on Jan 9 for 17 targets (17 more lost their venue when venues were
-- deleted afterwards). The code no longer does this; this removes the rows it
-- already made. The targets themselves (tour_venues) are untouched.
--
-- Removed only when ALL of these hold:
--   source = 'tour', status = 'pitch', tied to a tour  (auto-created by that code)
--   not on Google Calendar
--   nothing attached: no email_log, email_drafts, posters, social announcements,
--   band personnel or expenses
-- Production at authoring time: 51 rows, all eligible.
--
-- Every removed row is copied in full to _fix_20261012_tour_target_shows first.
-- Rollback: supabase/migrations/rollback/20261012220000_remove_tour_target_calendar_shows.down.sql

begin;

create table if not exists public._fix_20261012_tour_target_shows (
  booking_id  uuid primary key,
  row_data    jsonb not null,
  removed_at  timestamptz not null default now()
);
alter table public._fix_20261012_tour_target_shows enable row level security;
-- No policies: service role only.

insert into public._fix_20261012_tour_target_shows (booking_id, row_data)
select b.id, to_jsonb(b)
from public.bookings b
where b.source = 'tour'
  and b.status = 'pitch'
  and b.tour_id is not null
  and b.google_event_id is null
  and not exists (select 1 from public.email_log            x where x.booking_id = b.id)
  and not exists (select 1 from public.email_drafts         x where x.booking_id = b.id)
  and not exists (select 1 from public.generated_posters    x where x.booking_id = b.id)
  and not exists (select 1 from public.social_announcements x where x.booking_id = b.id)
  and not exists (select 1 from public.booking_personnel    x where x.booking_id = b.id)
  and not exists (select 1 from public.expenses             x where x.booking_id = b.id)
on conflict (booking_id) do nothing;

delete from public.bookings b
using public._fix_20261012_tour_target_shows f
where f.booking_id = b.id;

-- Report what is left of this kind (rows kept because something is attached).
do $$
declare
  kept int;
  removed int;
begin
  select count(*) into removed from public._fix_20261012_tour_target_shows;
  select count(*) into kept from public.bookings
   where source = 'tour' and status = 'pitch' and tour_id is not null;
  raise notice 'tour target shows removed: %, kept (have attachments): %', removed, kept;
end $$;

commit;
