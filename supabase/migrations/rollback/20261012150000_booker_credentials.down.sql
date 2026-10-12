-- supabase/migrations/rollback/20261012150000_booker_credentials.down.sql
-- Reverses 20261012150000_booker_credentials.sql. Agents' Gmail connections are
-- lost (they reconnect); tokens should be revoked at Google first if possible.

begin;
drop table if exists public.booker_credentials;
commit;
