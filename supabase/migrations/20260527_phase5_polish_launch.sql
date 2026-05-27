-- Phase 5: Polish & Launch
-- Run manually in Supabase SQL editor. Review before executing.
-- Dependencies: Phases 1-4 must be applied first.

-- ============================================================
-- 1. notifications table (fields match AppShell NotifBell)
-- ============================================================
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  act_id     uuid references acts(id) on delete cascade,
  type       text not null,
  message    text not null,
  action_url text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

drop policy if exists "Users see own notifications" on notifications;
create policy "Users see own notifications"
  on notifications for all
  using (auth.uid() = user_id);

create index if not exists notifications_user_unread
  on notifications(user_id, read) where read = false;

-- ============================================================
-- 2. onboarding_completed on user_profiles
-- ============================================================
alter table user_profiles
  add column if not exists onboarding_completed boolean not null default false;

-- ============================================================
-- 3. notification_preferences on user_profiles
-- ============================================================
alter table user_profiles
  add column if not exists notification_preferences jsonb not null
    default '{"venue_reply_email": true, "followup_reminder_email": true}'::jsonb;

-- ============================================================
-- 4. act_invitations unique constraint (if missing) for upsert
-- ============================================================
-- Only run if constraint doesn't already exist:
-- alter table act_invitations add constraint act_invitations_act_id_email_key unique (act_id, email);
-- Check first: SELECT constraint_name FROM information_schema.table_constraints
--              WHERE table_name = 'act_invitations' AND constraint_type = 'UNIQUE';
