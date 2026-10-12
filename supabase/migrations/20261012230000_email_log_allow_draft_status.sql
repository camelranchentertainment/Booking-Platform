-- supabase/migrations/20261012230000_email_log_allow_draft_status.sql
--
-- Fix: "Save draft" in the email composer always failed with
--   new row for relation "email_log" violates check constraint "email_log_status_check"
--
-- The draft code (lib/server/draftPayload.ts) saves drafts with status 'draft'
-- (plus is_draft = true), but email_log_status_check only allowed
-- sent / delivered / bounced / failed. No migration ever added 'draft'.
-- This adds it; every existing value stays allowed.
--
-- Rollback: supabase/migrations/rollback/20261012230000_email_log_allow_draft_status.down.sql

begin;

alter table public.email_log drop constraint if exists email_log_status_check;

alter table public.email_log
  add constraint email_log_status_check
  check (status = any (array['sent'::text, 'delivered'::text, 'bounced'::text, 'failed'::text, 'draft'::text]));

commit;
