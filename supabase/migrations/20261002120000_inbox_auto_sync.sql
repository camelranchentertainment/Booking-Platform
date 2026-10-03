-- supabase/migrations/20261002120000_inbox_auto_sync.sql
-- Supports automatic Gmail inbox checks (every ~2.5 min while an admin is logged in).
--
-- 1. act_credentials.gmail_last_sync_at
--    Server-side throttle for /api/email/gmail-sync. Lives on act_credentials
--    (RLS on, no policies => service-role only) so Members can't read or write it
--    and frequent writes don't churn acts.updated_at.
--
-- 2. email_log (act_id, message_id) index
--    The sync de-duplicates every Gmail message against email_log on each run.
--    With auto-sync that lookup now runs every few minutes, so it needs an index.
--
-- Additive only. Safe to apply before the PR merges (old code ignores both).
-- Applied by Claude.ai after Scott approves the Supabase prompt. Claude Code never runs this.

alter table public.act_credentials
  add column if not exists gmail_last_sync_at timestamptz;

comment on column public.act_credentials.gmail_last_sync_at is
  'Start time of the most recent Gmail inbox sync for this act. Used to throttle /api/email/gmail-sync.';

create index if not exists idx_email_log_act_message_id
  on public.email_log (act_id, message_id)
  where message_id is not null;
