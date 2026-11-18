-- rollback/20261118040000_agent_conversations_pending_card.down.sql
-- Undoes 20261118040000_agent_conversations_pending_card.sql.
--
-- Revert the PR that reads pending_card before or with this rollback, or
-- /api/agent-conversation will fail to load chats. Any card waiting on screen
-- is lost; its staged rows stay pending and expire as usual.

begin;

alter table public.agent_conversations
  drop constraint if exists agent_conversations_pending_card_shape;

alter table public.agent_conversations
  drop column if exists pending_card;

commit;
