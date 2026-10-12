-- supabase/migrations/rollback/20261011120000_booker_messages.down.sql
-- Reverses 20261011120000_booker_messages.sql.
-- Dropping booker_messages loses every agent's email history and follow-up
-- dates. Export the table first if any agent has sent mail.

begin;

drop table if exists public.booker_messages;

alter table public.booker_contacts
  drop constraint if exists uq_booker_contacts_id_booker;

commit;
