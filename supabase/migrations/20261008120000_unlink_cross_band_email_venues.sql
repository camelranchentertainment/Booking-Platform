-- supabase/migrations/20261008120000_unlink_cross_band_email_venues.sql
--
-- Data fix (no schema change).
--
-- The Gmail/IMAP inbox matcher used to compare senders against EVERY band's
-- venues and fell back to "same email domain". One band's venue with a
-- gmail.com address therefore claimed every gmail.com sender in other bands'
-- inboxes (all showing as "Maxine's Tap Room"). The code is fixed in
-- lib/server/venueEmailMatch.ts; this unlinks the rows it already mislabelled.
--
-- Scope: email_log rows that HAVE a band (act_id) but point at a venue owned by
-- a different band. The email itself is kept; it simply shows the sender's
-- address instead of the wrong venue. Rows with no act_id are left alone (their
-- owner can't be determined safely).
--
-- Rollback: supabase/migrations/rollback/20261008120000_unlink_cross_band_email_venues.down.sql
-- Expected on production at authoring time: 8 rows.

begin;

-- Keep a copy of exactly what changes so the rollback is exact.
create table if not exists public._fix_20261008_email_venue_backup (
  email_log_id  uuid primary key,
  venue_id      uuid,
  tour_venue_id uuid,
  backed_up_at  timestamptz not null default now()
);
alter table public._fix_20261008_email_venue_backup enable row level security;
-- No policies: service role only.

insert into public._fix_20261008_email_venue_backup (email_log_id, venue_id, tour_venue_id)
select e.id, e.venue_id, e.tour_venue_id
from public.email_log e
join public.venues v on v.id = e.venue_id
where e.act_id is not null
  and v.act_id is distinct from e.act_id
on conflict (email_log_id) do nothing;

update public.email_log e
set venue_id      = null,
    tour_venue_id = null
from public._fix_20261008_email_venue_backup b
where b.email_log_id = e.id;

commit;
