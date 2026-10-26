-- 20261026170000_agent_conversations_by_day.sql
-- The band assistant chat starts fresh each day, and past days stay readable
-- from History.
--
-- Before: one row per (user_id, act_id) that was overwritten forever.
-- After:  one row per (user_id, act_id, day). "day" is the caller's local
--         calendar day, sent by the browser (YYYY-MM-DD) so a chat at 9 PM
--         Central files under that evening, not under tomorrow's UTC date.
--
-- Existing rows (3 at time of writing) are filed under the Central-time day
-- of their last update. Every current user is in a US time zone, so this is
-- the day they would recognise.
--
-- RLS: the existing policy agent_conversations_own_row (user_id = auth.uid())
-- already covers every row of the new shape. The API uses the service role
-- and filters by the caller's own user_id and act_id from their profile.
--
-- Apply manually after review. Never auto-run. Rollback:
--   supabase/migrations/rollback/20261026170000_agent_conversations_by_day.down.sql

begin;

alter table public.agent_conversations
  add column if not exists day date;

update public.agent_conversations
   set day = (coalesce(updated_at, created_at) at time zone 'America/Chicago')::date
 where day is null;

-- No default on purpose: the API always supplies the caller's local day, and
-- a server-side default would be the UTC day, which is wrong every US evening.
alter table public.agent_conversations
  alter column day set not null;

alter table public.agent_conversations
  drop constraint if exists agent_conversations_user_id_act_id_key;

alter table public.agent_conversations
  add constraint agent_conversations_user_act_day_key unique (user_id, act_id, day);

-- The new unique index leads with (user_id, act_id), so the old plain index
-- is redundant. History lists newest day first.
drop index if exists public.idx_agent_conversations_user_act;
create index if not exists idx_agent_conversations_user_act_day_desc
  on public.agent_conversations (user_id, act_id, day desc);

comment on column public.agent_conversations.day is
  'Caller''s local calendar day for this chat. One chat per user, band and day; earlier days are read-only history.';

commit;
