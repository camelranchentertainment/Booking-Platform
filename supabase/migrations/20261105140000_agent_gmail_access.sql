-- supabase/migrations/20261105140000_agent_gmail_access.sql
--
-- Per-band switch for the booking agent's Gmail search. Off for everyone until a
-- band admin turns it on in Settings. Existing acts RLS already limits updates
-- to the band's admins. No new table, so no new grants.
--
-- Rollback: supabase/migrations/rollback/20261105140000_agent_gmail_access.down.sql

begin;

alter table public.acts
  add column if not exists agent_gmail_access boolean not null default false;

commit;
