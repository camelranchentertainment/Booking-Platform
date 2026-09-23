-- Add a random token column to acts that serves as the secret key for the
-- subscribe feed URL. Acts created before this migration get a token on the
-- spot; new acts get one by default.
--
-- The old /api/calendar/{actId}.ics route is removed in the same deploy.
-- The new URL is /api/calendar/feed/{ical_feed_token}.ics — the UUID is no
-- longer the key, so knowing an act ID is not enough to read its feed.

alter table public.acts
  add column ical_feed_token text;

update public.acts
  set ical_feed_token = encode(extensions.gen_random_bytes(32), 'hex')
  where ical_feed_token is null;

alter table public.acts
  alter column ical_feed_token set not null,
  alter column ical_feed_token set default encode(extensions.gen_random_bytes(32), 'hex');

create unique index acts_ical_feed_token_key on public.acts (ical_feed_token);
