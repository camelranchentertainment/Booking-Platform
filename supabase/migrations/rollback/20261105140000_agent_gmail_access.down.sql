-- Rollback for 20261105140000_agent_gmail_access.sql
-- Removes the switch. Bands' Gmail connections are not affected.

begin;

alter table public.acts drop column if exists agent_gmail_access;

commit;
