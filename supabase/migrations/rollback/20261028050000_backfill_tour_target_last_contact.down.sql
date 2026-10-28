-- Rollback for 20261028050000_backfill_tour_target_last_contact.sql
-- Restores last_contacted_at for the rows the backfill changed, but only where
-- nothing has touched the row since (a newer email should win), then drops the
-- backup table.

begin;

update public.tour_venues tv
set last_contacted_at = f.old_last_contacted_at,
    updated_at = now()
from public._fix_20261028_tour_target_last_contact f
where tv.id = f.tour_venue_id
  and tv.last_contacted_at = f.new_last_contacted_at;

drop table if exists public._fix_20261028_tour_target_last_contact;

commit;
