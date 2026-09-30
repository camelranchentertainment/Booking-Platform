-- Re-adds the columns empty. Tokens are NOT restored; reconnect Gmail if rolled back.
begin;
alter table public.acts
  add column if not exists google_access_token  text,
  add column if not exists google_refresh_token text,
  add column if not exists calendar_api_key     text;
commit;
