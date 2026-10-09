-- supabase/migrations/rollback/20261009150000_agent_admin_actions.down.sql
-- Restores the action_type check to the pre-PR-A set and drops expenses.archived_at.
-- WARNING: dropping archived_at un-archives every archived expense (they come
-- back into totals). Staged rows of the new types must be removed first:
--   delete from public.ai_staged_actions where action_type not in (
--     'booking_upsert','tour_insert','tour_notes_update','expense_insert',
--     'venue_and_booking_upsert','payment_settle','calendar_settings_update',
--     'personnel_upsert','email_send','email_template_upsert');

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

drop index if exists public.idx_expenses_act_active;
alter table public.expenses drop column if exists archived_at;

commit;
