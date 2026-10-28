-- 20261028050000_backfill_tour_target_last_contact.sql
--
-- One-time data fix. The outreach list's "days since last contact" reads
-- tour_venues.last_contacted_at, which sendActEmail only updated when the
-- caller passed a tour target id. Replies from the inbox and emails the agent
-- sends carry only the venue, so those sends never moved the counter
-- (Oct 27 2026: Rustic Pine Tavern showed 8d and Dan's SilverLeaf 13d after
-- both were emailed that night). The code fix (lib/emailSend.ts) now touches
-- every live tour target for the venue; this backfills rows sent before it.
--
-- For each tour target on a non-cancelled tour, raise last_contacted_at to the
-- latest email the band actually sent to that venue, never lowering it.
-- Dry run on Oct 28 2026: 5 rows, all Jake Stringer & Better Than Nothin'.
-- Old values are kept in a backup table so the rollback can restore them.

begin;

-- grants: service_role only _fix_20261028_tour_target_last_contact
create table if not exists public._fix_20261028_tour_target_last_contact (
  tour_venue_id         uuid        primary key,
  old_last_contacted_at timestamptz,
  new_last_contacted_at timestamptz not null,
  fixed_at              timestamptz not null default now()
);
-- Backup only: no client access. RLS on with no policies; service role only.
alter table public._fix_20261028_tour_target_last_contact enable row level security;
revoke all on public._fix_20261028_tour_target_last_contact from anon, authenticated;
grant all on public._fix_20261028_tour_target_last_contact to service_role;

with last_sent as (
  select l.act_id, l.venue_id, max(l.sent_at) as sent_at
  from public.email_log l
  where l.direction = 'sent'
    and l.status = 'sent'
    and coalesce(l.is_draft, false) = false
    and l.venue_id is not null
    and l.sent_at is not null
  group by l.act_id, l.venue_id
),
targets as (
  select tv.id, tv.last_contacted_at as old_value, ls.sent_at as new_value
  from public.tour_venues tv
  join public.tours t on t.id = tv.tour_id and t.status <> 'cancelled'
  join last_sent ls on ls.venue_id = tv.venue_id and ls.act_id = t.act_id
  where ls.sent_at > coalesce(tv.last_contacted_at, '-infinity'::timestamptz)
),
backup as (
  insert into public._fix_20261028_tour_target_last_contact (tour_venue_id, old_last_contacted_at, new_last_contacted_at)
  select id, old_value, new_value from targets
  on conflict (tour_venue_id) do nothing
  returning tour_venue_id, new_last_contacted_at
)
update public.tour_venues tv
set last_contacted_at = b.new_last_contacted_at,
    updated_at = now()
from backup b
where tv.id = b.tour_venue_id;

commit;
