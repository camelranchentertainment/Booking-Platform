-- supabase/migrations/rollback/20261013180000_backfill_tour_venue_pitched_at.down.sql
--
-- Clears pitched_at only on the targets the backfill filled, and only where it
-- still holds the backfilled value (a later send never overwrites it, but a
-- manual edit might). Targets that already had pitched_at before the backfill
-- were never recorded and are left alone. Then drops the record table.

begin;

update public.tour_venues tv
   set pitched_at = null
  from public.tour_venue_pitched_backfill b
 where tv.id = b.tour_venue_id
   and tv.pitched_at = b.pitched_at;

drop table public.tour_venue_pitched_backfill;

commit;
