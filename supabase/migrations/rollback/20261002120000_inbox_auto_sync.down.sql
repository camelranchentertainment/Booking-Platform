-- supabase/migrations/rollback/20261002120000_inbox_auto_sync.down.sql
-- Only run AFTER the inbox auto-sync code has been reverted; the new
-- /api/email/gmail-sync reads and writes act_credentials.gmail_last_sync_at.
drop index if exists public.idx_email_log_act_message_id;
alter table public.act_credentials drop column if exists gmail_last_sync_at;
