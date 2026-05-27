-- Phase 2: Calendar & Pipeline Fixes
-- Run manually in Supabase SQL editor. Review before executing.
-- Dependencies: Phase 1 migration must be applied first.

-- ============================================================
-- 1. user_calendar_settings
-- ============================================================
create table if not exists user_calendar_settings (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  act_id             uuid references acts(id) on delete cascade,
  google_access_token  text,
  google_refresh_token text,
  google_token_expiry  timestamptz,
  selected_calendar_id text,
  sync_enabled       boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique(user_id)
);

alter table user_calendar_settings enable row level security;

create policy "Users manage own calendar settings"
  on user_calendar_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 2. google_event_id on bookings
-- ============================================================
alter table bookings add column if not exists google_event_id text;

-- ============================================================
-- 3. tour_venues status — add new values
-- ============================================================
-- If status column is an enum, add values; if text, no DDL needed.
-- Check current type first:
--   select data_type from information_schema.columns
--   where table_name = 'tour_venues' and column_name = 'status';
--
-- If it returns 'USER-DEFINED' (enum), run the alter type block.
-- If it returns 'text', skip the alter type block.

-- For enum-based status (run only if status is an enum):
-- do $$
-- begin
--   if not exists (
--     select 1 from pg_enum
--     where enumlabel = 'reached_out'
--       and enumtypid = (select oid from pg_type where typname = 'outreach_status')
--   ) then
--     alter type outreach_status add value 'reached_out' before 'negotiate';
--     alter type outreach_status add value 'responded'   after  'reached_out';
--     alter type outreach_status rename value 'negotiate' to 'negotiating';
--   end if;
-- end;
-- $$;

-- For text-based status — migrate existing data:
update tour_venues set status = 'reached_out' where status = 'pitched';
update tour_venues set status = 'negotiating'  where status = 'negotiate';

-- ============================================================
-- 4. updated_at trigger for user_calendar_settings
-- ============================================================
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_calendar_settings_updated_at
  before update on user_calendar_settings
  for each row execute function update_updated_at_column();
