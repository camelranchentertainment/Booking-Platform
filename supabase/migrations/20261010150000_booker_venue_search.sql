-- supabase/migrations/20261010150000_booker_venue_search.sql
-- Booking Agent workspace: venue search and venue-centred contacts.
--
-- Also decided Oct 10: there is no separate Contacts page. Festivals, fairs,
-- promoters and private-event buyers are entries in the venue book with a
-- `kind`, so every booking contact lives on one profile. Band contacts stay on
-- the band's roster entry.
--
-- Decided Oct 10, 2026: contacts live on the venue's profile, and each contact
-- has a "Show to my bands" checkbox that is OFF by default. Contacts found by a
-- venue search arrive private. (Bands cannot read booker_* tables at all yet;
-- the flag is what the read-only doorway will honour once linking ships.)
--
-- Additive only: new nullable/defaulted columns on booker_ tables. No existing
-- data changes meaning; no other table is touched.
--
-- Apply manually after review. Never auto-run. Rollback:
--   supabase/migrations/rollback/20261010150000_booker_venue_search.down.sql

begin;

-- Venues found through Google Places keep the place id so a search can mark
-- "already in your book" and a venue is never added twice.
alter table public.booker_venues
  add column place_id        text        check (place_id is null or char_length(place_id) <= 300),
  add column email           text        check (email is null or char_length(email) <= 254),
  add column phone           text        check (phone is null or char_length(phone) <= 40),
  add column last_scanned_at timestamptz,
  add column kind            text        not null default 'venue'
    check (kind in ('venue', 'festival', 'fair', 'promoter', 'private_event'));

create unique index uq_booker_venues_place
  on public.booker_venues (booker_id, place_id)
  where place_id is not null and deleted_at is null;

-- Contacts: who may see them, and where they came from.
alter table public.booker_contacts
  add column share_with_bands boolean not null default false,
  add column source           text    not null default 'manual'
    check (source in ('manual', 'website'));

commit;
