-- supabase/migrations/rollback/20261010150000_booker_venue_search.down.sql
-- Reverses 20261010150000_booker_venue_search.sql.
-- Dropping these columns loses saved venue emails/phones, Google place ids and
-- each contact's "Show to my bands" choice. Export first if any agent has used them.

begin;

alter table public.booker_contacts
  drop column if exists source,
  drop column if exists share_with_bands;

drop index if exists public.uq_booker_venues_place;

alter table public.booker_venues
  drop column if exists kind,
  drop column if exists last_scanned_at,
  drop column if exists phone,
  drop column if exists email,
  drop column if exists place_id;

commit;
