-- supabase/migrations/rollback/20261009120000_staged_action_email_template.down.sql
-- Restores the action_type check without 'email_template_upsert'.
-- Any staged template rows must be removed first or the constraint will fail:
--   delete from public.ai_staged_actions where action_type = 'email_template_upsert';

begin;

alter table public.ai_staged_actions
  drop constraint if exists ai_staged_actions_action_type_check;

alter table public.ai_staged_actions
  add constraint ai_staged_actions_action_type_check
  check (action_type in (
    'booking_upsert',
    'tour_insert',
    'tour_notes_update',
    'expense_insert',
    'venue_and_booking_upsert',
    'payment_settle',
    'calendar_settings_update',
    'personnel_upsert',
    'email_send'
  ));

commit;
