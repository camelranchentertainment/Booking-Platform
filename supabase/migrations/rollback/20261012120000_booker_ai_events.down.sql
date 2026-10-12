-- supabase/migrations/rollback/20261012120000_booker_ai_events.down.sql
-- Reverses 20261012120000_booker_ai_events.sql. Only usage counts are lost.

begin;
drop table if exists public.booker_ai_events;
commit;
