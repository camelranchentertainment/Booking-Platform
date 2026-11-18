-- 20261118040000_agent_conversations_pending_card.sql
-- Keeps the agent's open approval card with the day's chat.
--
-- Before: an approval card (staged saves, an outreach email to review) lived
-- only in the browser tab. Popping the agent out, docking it back or
-- reloading the page dropped it, so the Pop out button was disabled while a
-- card was waiting.
-- After:  the card, plus any edits to the email draft and venue selection, is
--         saved next to that day's messages and restored wherever the chat
--         opens next.
--
-- Nothing on the card is trusted later: approving still goes through
-- /api/help/actions/execute (staged rows must be pending and belong to the
-- caller's band) and /api/agent-bulk-send (band from the caller's profile).
--
-- RLS: unchanged. The existing policy agent_conversations_own_row
-- (user_id = auth.uid()) covers the new column; the API uses the service role
-- and filters by the caller's own user_id and act_id. Existing table, so no
-- new grants are needed.
--
-- Apply manually after review, BEFORE merging the PR that reads this column.
-- Rollback: supabase/migrations/rollback/20261118040000_agent_conversations_pending_card.down.sql

begin;

alter table public.agent_conversations
  add column if not exists pending_card jsonb;

-- A card is a single JSON object (or nothing). Size is capped in the API too;
-- the constraint is the backstop.
alter table public.agent_conversations
  drop constraint if exists agent_conversations_pending_card_shape;
alter table public.agent_conversations
  add constraint agent_conversations_pending_card_shape
  check (
    pending_card is null
    or (jsonb_typeof(pending_card) = 'object' and pg_column_size(pending_card) <= 131072)
  );

comment on column public.agent_conversations.pending_card is
  'The approval card waiting on screen for this chat (action + draft edits + selected venues), or null. Restored when the chat moves between the dashboard and the pop-out window.';

commit;
