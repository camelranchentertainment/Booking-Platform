-- Rollback for 20261020190000_push_tokens.sql
-- Removes app push tokens. Devices simply stop getting reminders; they
-- re-register automatically if the feature is re-applied.
begin;
drop function if exists public.register_push_token(text, text);
drop table if exists public.push_tokens;
commit;
