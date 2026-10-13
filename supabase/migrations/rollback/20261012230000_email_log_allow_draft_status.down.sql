-- supabase/migrations/rollback/20261012230000_email_log_allow_draft_status.down.sql
--
-- Restores the original email_log_status_check (no 'draft').
-- NOT VALID so drafts saved since the fix don't block the rollback; new draft
-- saves will fail again, exactly as before the fix.

begin;

alter table public.email_log drop constraint if exists email_log_status_check;

alter table public.email_log
  add constraint email_log_status_check
  check (status = any (array['sent'::text, 'delivered'::text, 'bounced'::text, 'failed'::text]))
  not valid;

commit;
