-- rollback/20261026180000_venue_dayof_sound_contacts.down.sql
-- Undoes 20261026180000_venue_dayof_sound_contacts.sql.
--
-- Day-of contact phones and sound engineer names/phones entered since are
-- lost. bookings.venue_contact_name is an older column and is kept, including
-- any names the trigger copied into it.
--
-- Deploy the previous app version before or with this rollback: the new pages
-- read and write these columns.

begin;

drop trigger if exists trg_bookings_fill_show_contacts on public.bookings;
drop function if exists public.bookings_fill_show_contacts();

alter table public.bookings
  drop constraint if exists bookings_day_of_contact_phone_len,
  drop constraint if exists bookings_sound_engineer_name_len,
  drop constraint if exists bookings_sound_engineer_phone_len,
  drop column if exists day_of_contact_phone,
  drop column if exists sound_engineer_name,
  drop column if exists sound_engineer_phone;

alter table public.venues
  drop constraint if exists venues_day_of_contact_name_len,
  drop constraint if exists venues_day_of_contact_phone_len,
  drop constraint if exists venues_sound_engineer_name_len,
  drop constraint if exists venues_sound_engineer_phone_len,
  drop column if exists day_of_contact_name,
  drop column if exists day_of_contact_phone,
  drop column if exists sound_engineer_name,
  drop column if exists sound_engineer_phone;

commit;
