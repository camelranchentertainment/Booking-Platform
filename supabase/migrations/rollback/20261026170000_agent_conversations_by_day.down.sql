-- rollback/20261026170000_agent_conversations_by_day.down.sql
-- Undoes 20261026170000_agent_conversations_by_day.sql.
--
-- The old shape allows one chat per user and band, so only the most recent
-- day survives; every earlier day of history is deleted. Export
-- agent_conversations first if past days matter.
--
-- Deploy the previous version of pages/api/agent-conversation.ts before or
-- with this rollback: the new code writes the "day" column.

begin;

delete from public.agent_conversations c
 using public.agent_conversations newer
 where newer.user_id = c.user_id
   and newer.act_id  = c.act_id
   and (newer.day > c.day or (newer.day = c.day and newer.id > c.id));

drop index if exists public.idx_agent_conversations_user_act_day_desc;

alter table public.agent_conversations
  drop constraint if exists agent_conversations_user_act_day_key;

alter table public.agent_conversations
  add constraint agent_conversations_user_id_act_id_key unique (user_id, act_id);

create index if not exists idx_agent_conversations_user_act
  on public.agent_conversations (user_id, act_id);

alter table public.agent_conversations
  drop column if exists day;

commit;
