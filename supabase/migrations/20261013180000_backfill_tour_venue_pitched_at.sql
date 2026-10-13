-- supabase/migrations/20261013180000_backfill_tour_venue_pitched_at.sql
--
-- Marks tour targets that were already emailed as pitched.
--
-- The tour card's "Pitched" count now includes open targets with pitched_at
-- set, and every send sets pitched_at on the first email to a target. Targets
-- emailed before that change (e.g. the 17 Lone Star pitches sent 2026-10-13)
-- have last_contacted_at but no pitched_at; this sets it to the time of their
-- first sent (non-draft, outbound) email.
--
-- Rows that already had pitched_at are not touched. The ids this migration
-- fills are recorded in tour_venue_pitched_backfill so the rollback undoes
-- exactly those and nothing else.
--
-- Data only; no schema change to existing tables. Apply manually after review.
-- Rollback: supabase/migrations/rollback/20261013180000_backfill_tour_venue_pitched_at.down.sql

begin;

create table public.tour_venue_pitched_backfill (
  tour_venue_id uuid        primary key references public.tour_venues(id) on delete cascade,
  pitched_at    timestamptz not null,
  backfilled_at timestamptz not null default now()
);
-- Service role only: no policies, so RLS denies every client role.
alter table public.tour_venue_pitched_backfill enable row level security;

with first_sent as (
  select e.tour_venue_id, min(e.sent_at) as pitched_at
  from public.email_log e
  where e.tour_venue_id is not null
    and coalesce(e.direction, 'sent') <> 'received'
    and coalesce(e.is_draft, false) = false
    and e.sent_at is not null
  group by e.tour_venue_id
),
updated as (
  update public.tour_venues tv
     set pitched_at = fs.pitched_at
    from first_sent fs
   where tv.id = fs.tour_venue_id
     and tv.pitched_at is null
  returning tv.id, tv.pitched_at
)
insert into public.tour_venue_pitched_backfill (tour_venue_id, pitched_at)
select id, pitched_at from updated;

commit;
