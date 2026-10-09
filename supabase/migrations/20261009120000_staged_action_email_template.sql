-- supabase/migrations/20261009120000_staged_action_email_template.sql
--
-- Allow the booking agent to stage saving an email template
-- (action_type 'email_template_upsert'). Executed by
-- pages/api/help/actions/execute.ts after the user approves the card.
--
-- DDL only: broadening the allowed set does not touch existing rows.
-- Rollback: supabase/migrations/rollback/20261009120000_staged_action_email_template.down.sql

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
    'email_send',
    'email_template_upsert'
  ));

commit;
