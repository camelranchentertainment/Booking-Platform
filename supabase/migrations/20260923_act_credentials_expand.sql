-- Expand: move OAuth credentials off acts into act_credentials.
-- acts.google_access_token / google_refresh_token / calendar_api_key remain on acts
-- during the transition (dropped in PR C after code deploys). A trigger keeps
-- act_credentials in sync while old code paths still write to acts.

create table public.act_credentials (
  act_id               uuid primary key references public.acts(id) on delete cascade,
  google_access_token  text,
  google_refresh_token text,
  calendar_api_key     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.act_credentials enable row level security;
-- Intentionally NO policies: service role only.
revoke all on public.act_credentials from anon, authenticated;

create trigger trg_act_credentials_updated
  before update on public.act_credentials
  for each row execute function touch_updated_at();

-- Backfill from acts for any acts that already have credentials.
insert into public.act_credentials (act_id, google_access_token, google_refresh_token, calendar_api_key)
select id, google_access_token, google_refresh_token, calendar_api_key
from public.acts
where google_access_token is not null
   or google_refresh_token is not null
   or calendar_api_key is not null
on conflict (act_id) do nothing;

-- Transition sync: while the old code paths (callback, disconnect) still write to
-- acts, mirror those writes into act_credentials automatically. Removed in PR C.
create or replace function public.sync_act_credentials_transition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.act_credentials (act_id, google_access_token, google_refresh_token, calendar_api_key)
  values (new.id, new.google_access_token, new.google_refresh_token, new.calendar_api_key)
  on conflict (act_id) do update set
    google_access_token  = excluded.google_access_token,
    google_refresh_token = excluded.google_refresh_token,
    calendar_api_key     = excluded.calendar_api_key;
  return new;
end $$;

revoke all on function public.sync_act_credentials_transition() from public, anon, authenticated;

create trigger trg_acts_sync_credentials
  after update of google_access_token, google_refresh_token, calendar_api_key on public.acts
  for each row
  when (
    row(old.google_access_token, old.google_refresh_token, old.calendar_api_key)
    is distinct from
    row(new.google_access_token, new.google_refresh_token, new.calendar_api_key)
  )
  execute function public.sync_act_credentials_transition();
