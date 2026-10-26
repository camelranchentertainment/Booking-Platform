-- 20261026180000_venue_dayof_sound_contacts.sql
-- Venue profiles get the people the band deals with on show day, and every new
-- show at that venue starts with them filled in (still editable per show).
--
--   venues.day_of_contact_name / day_of_contact_phone   who meets the band on the night
--   venues.sound_engineer_name / sound_engineer_phone   the house sound engineer
--
--   bookings.venue_contact_name   (existing) the show's day-of contact name
--   bookings.day_of_contact_phone (new)
--   bookings.sound_engineer_name  (new)
--   bookings.sound_engineer_phone (new)
--
-- The venue's own Venue Contact (talent buyer: booking_contact, email, phone)
-- is unchanged and stays separate from these.
--
-- Copying is a BEFORE trigger, not app code: shows are created from the show
-- form, the calendar, tour confirm, CSV import, the assistant and the mobile
-- app, and the trigger covers every one of them. It only fills blanks, so a
-- value typed for the show always wins. It fires on insert, and on update only
-- when a show that had no venue gets one; moving a show to a different venue
-- never overwrites contacts already on it.
--
-- SECURITY INVOKER: the venue lookup runs under the caller's own RLS, so a show
-- can only pick up contacts from a venue the caller can already read.
--
-- Additive only. Existing table grants cover the new columns, existing RLS on
-- venues and bookings covers the rows. Members already read venue_contact_name
-- and venue phone on their day sheet; these are the same kind of show-day info,
-- not financial data.
--
-- Apply manually after review. Never auto-run. Rollback:
--   supabase/migrations/rollback/20261026180000_venue_dayof_sound_contacts.down.sql

begin;

alter table public.venues
  add column if not exists day_of_contact_name  text,
  add column if not exists day_of_contact_phone text,
  add column if not exists sound_engineer_name  text,
  add column if not exists sound_engineer_phone text;

alter table public.venues
  add constraint venues_day_of_contact_name_len  check (char_length(day_of_contact_name)  <= 120),
  add constraint venues_day_of_contact_phone_len check (char_length(day_of_contact_phone) <= 40),
  add constraint venues_sound_engineer_name_len  check (char_length(sound_engineer_name)  <= 120),
  add constraint venues_sound_engineer_phone_len check (char_length(sound_engineer_phone) <= 40);

alter table public.bookings
  add column if not exists day_of_contact_phone text,
  add column if not exists sound_engineer_name  text,
  add column if not exists sound_engineer_phone text;

alter table public.bookings
  add constraint bookings_day_of_contact_phone_len check (char_length(day_of_contact_phone) <= 40),
  add constraint bookings_sound_engineer_name_len  check (char_length(sound_engineer_name)  <= 120),
  add constraint bookings_sound_engineer_phone_len check (char_length(sound_engineer_phone) <= 40);

create or replace function public.bookings_fill_show_contacts()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v public.venues%rowtype;
begin
  if new.venue_id is null then
    return new;
  end if;
  -- On update, only when a venue is attached for the first time.
  if tg_op = 'UPDATE' and old.venue_id is not null then
    return new;
  end if;

  select * into v from public.venues where id = new.venue_id;
  if not found then
    return new;
  end if;

  new.venue_contact_name   := coalesce(nullif(btrim(new.venue_contact_name),   ''), v.day_of_contact_name);
  new.day_of_contact_phone := coalesce(nullif(btrim(new.day_of_contact_phone), ''), v.day_of_contact_phone);
  new.sound_engineer_name  := coalesce(nullif(btrim(new.sound_engineer_name),  ''), v.sound_engineer_name);
  new.sound_engineer_phone := coalesce(nullif(btrim(new.sound_engineer_phone), ''), v.sound_engineer_phone);
  return new;
end;
$$;

comment on function public.bookings_fill_show_contacts() is
  'Fills a new show''s blank day-of contact and sound engineer from its venue. Never overwrites a value set on the show.';

drop trigger if exists trg_bookings_fill_show_contacts on public.bookings;
create trigger trg_bookings_fill_show_contacts
  before insert or update of venue_id on public.bookings
  for each row execute function public.bookings_fill_show_contacts();

commit;
