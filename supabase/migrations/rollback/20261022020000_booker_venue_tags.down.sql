-- rollback/20261022020000_booker_venue_tags.down.sql
-- Undoes 20261022020000_booker_venue_tags.sql. Tags entered since are lost:
-- export booker_venues (id, tags) first if they matter.
begin;
alter table public.booker_venues
  drop constraint if exists booker_venues_tags_ck,
  drop column if exists tags;
drop function if exists public.booker_tags_ok(text[]);
commit;
