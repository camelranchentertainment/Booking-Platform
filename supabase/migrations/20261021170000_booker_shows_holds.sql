-- 20261021170000_booker_shows_holds.sql
-- Real holds for the Booking Agent workspace (build list item 2).
--
-- Adds three optional fields to booker_shows. Nothing existing changes: every
-- column is nullable, so current rows and the current app keep working, and
-- RLS on booker_shows already scopes them to the owning agent.
--
--   hold_rank          1 = first hold, 2 = second hold, … (only meaningful on
--                      hold / pending shows; cleared by the app on confirm)
--   hold_expires_on    the date the venue said the hold lasts until
--   answer_by          a venue has challenged the hold: confirm or release
--                      by this date
--   challenge_note     who challenged and why, in a line
begin;

alter table public.booker_shows
  add column if not exists hold_rank        smallint check (hold_rank is null or hold_rank between 1 and 9),
  add column if not exists hold_expires_on  date,
  add column if not exists answer_by        date,
  add column if not exists challenge_note   text check (challenge_note is null or char_length(challenge_note) <= 300);

comment on column public.booker_shows.hold_rank is 'Hold position at the venue: 1 = first hold, 2 = second, ...';
comment on column public.booker_shows.hold_expires_on is 'Date the venue said this hold lasts until';
comment on column public.booker_shows.answer_by is 'Venue challenged the hold: confirm or release by this date';
comment on column public.booker_shows.challenge_note is 'Who challenged the hold and why, one line';

-- Urgency lookups (Needs attention, Holds tab) read live holds by agent and date.
create index if not exists idx_booker_shows_holds
  on public.booker_shows (booker_id, answer_by, hold_expires_on)
  where deleted_at is null and status in ('hold', 'pending');

commit;
