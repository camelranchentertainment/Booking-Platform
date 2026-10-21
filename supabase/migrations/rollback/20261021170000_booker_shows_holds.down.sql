-- Rollback for 20261021170000_booker_shows_holds.sql
-- Drops the hold fields. Any hold positions, expiry dates and challenge
-- deadlines entered since are lost; the shows themselves are untouched.
begin;
drop index if exists public.idx_booker_shows_holds;
alter table public.booker_shows
  drop column if exists challenge_note,
  drop column if exists answer_by,
  drop column if exists hold_expires_on,
  drop column if exists hold_rank;
commit;
