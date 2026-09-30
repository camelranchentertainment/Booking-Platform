-- Reverses 20260930120000_social_announcements.sql (does not restore social_media_posts; it had 0 rows).
begin;
drop trigger  if exists trg_bookings_cue_social on public.bookings;
drop function if exists public.cue_social_announcement();
drop table    if exists public.social_posts;
drop table    if exists public.social_announcements;
commit;
