-- supabase/migrations/20260930150000_drop_acts_token_columns.sql
-- Contract step for 20260923_act_credentials_expand.sql.
-- act_credentials (service-role only) is now the sole store for Google OAuth tokens.
-- Apply manually after review. Never auto-run.

begin;

-- Guard: refuse if any act still has tokens that act_credentials doesn't cover.
do $$
begin
  if exists (
    select 1 from public.acts a
    where (a.google_refresh_token is not null
           or a.google_access_token is not null
           or a.calendar_api_key   is not null)
      and not exists (select 1 from public.act_credentials c where c.act_id = a.id)
  ) then
    raise exception 'acts has credentials with no act_credentials row; aborting drop';
  end if;
end $$;

-- Remove the transition mirror (acts -> act_credentials); nothing writes to acts tokens anymore.
drop trigger  if exists trg_acts_sync_credentials on public.acts;
drop function if exists public.sync_act_credentials_transition();

alter table public.acts
  drop column if exists google_access_token,
  drop column if exists google_refresh_token,
  drop column if exists calendar_api_key;

commit;
