-- Extend ai_staged_actions_action_type_check to include all action types
-- added to lib/aiAgentTools.ts since the table was created.
--
-- Original constraint (created with the table, Jul 2026) only allowed
-- 'booking_upsert'. Seven more types were introduced over subsequent
-- commits but no migration was written each time, causing CHECK violations
-- whenever the agent staged a tour, expense, payment, etc.
--
-- Safe to run on live data — DROP CONSTRAINT / ADD CONSTRAINT is DDL-only;
-- no existing rows are affected by broadening the allowed set.

ALTER TABLE ai_staged_actions
  DROP CONSTRAINT IF EXISTS ai_staged_actions_action_type_check;

ALTER TABLE ai_staged_actions
  ADD CONSTRAINT ai_staged_actions_action_type_check
  CHECK (action_type IN (
    'booking_upsert',
    'tour_insert',
    'tour_notes_update',
    'expense_insert',
    'venue_and_booking_upsert',
    'payment_settle',
    'calendar_settings_update',
    'personnel_upsert'
  ));
