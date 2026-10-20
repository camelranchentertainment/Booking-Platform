-- supabase/migrations/20261020190000_push_tokens.sql
--
-- Device push tokens for the Camel Ranch Booking iPhone/Android app.
-- The app registers its Expo push token after sign-in; the server sends
-- show-day reminders to those tokens through Expo's push service.
--
-- Security: a user can only see, add, refresh or remove their OWN tokens.
-- The cron sender uses the service role and reads across users.
-- A token is not a secret credential (it only lets Expo deliver to that
-- device), but it is still personal, so RLS keeps it private.
--
-- Rollback: supabase/migrations/rollback/20261020190000_push_tokens.down.sql

begin;

create table if not exists public.push_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade on update cascade,
  token         text not null,
  platform      text not null check (platform in ('ios', 'android')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  constraint push_tokens_token_key unique (token),
  constraint push_tokens_token_format check (token ~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$')
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using (user_id = auth.uid());

create policy push_tokens_insert_own on public.push_tokens
  for insert to authenticated with check (user_id = auth.uid());

create policy push_tokens_update_own on public.push_tokens
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());

-- A phone handed to a new bandmate keeps its token: re-registering moves the
-- row to the new user. RLS blocks updating another user's row, so this runs
-- as a narrowly scoped SECURITY DEFINER function the app calls instead of a
-- raw upsert.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'invalid platform' using errcode = '22023';
  end if;
  insert into public.push_tokens (user_id, token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = now(),
        last_seen_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

commit;
