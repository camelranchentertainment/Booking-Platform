-- supabase/migrations/rollback/20261012220000_remove_tour_target_calendar_shows.down.sql
--
-- Puts back the "pitch" shows removed by 20261012220000_remove_tour_target_calendar_shows.sql,
-- exactly as they were (same ids). Only re-run if that cleanup must be undone:
-- the rows it restores are the calendar clutter it was meant to remove.
-- A row whose venue has since been deleted comes back with no venue.

begin;

insert into public.bookings
select (jsonb_populate_record(
          null::public.bookings,
          f.row_data || jsonb_build_object(
            'venue_id',
            case when exists (select 1 from public.venues v where v.id = (f.row_data->>'venue_id')::uuid)
                 then f.row_data->'venue_id' else 'null'::jsonb end
          )
       )).*
from public._fix_20261012_tour_target_shows f
where not exists (select 1 from public.bookings b where b.id = f.booking_id);

drop table if exists public._fix_20261012_tour_target_shows;

commit;
