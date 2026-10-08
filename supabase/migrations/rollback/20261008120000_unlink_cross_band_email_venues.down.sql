-- supabase/migrations/rollback/20261008120000_unlink_cross_band_email_venues.down.sql
-- Restores the venue links removed by 20261008120000_unlink_cross_band_email_venues.sql.
-- Only re-run if that fix must be undone; the links it restores are wrong.

begin;

update public.email_log e
set venue_id      = b.venue_id,
    tour_venue_id = b.tour_venue_id
from public._fix_20261008_email_venue_backup b
where b.email_log_id = e.id;

drop table if exists public._fix_20261008_email_venue_backup;

commit;
