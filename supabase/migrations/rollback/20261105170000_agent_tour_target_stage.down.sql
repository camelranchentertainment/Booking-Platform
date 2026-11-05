-- Rollback for 20261105170000_agent_tour_target_stage.sql
--
-- Removes 'tour_target_stage' from the allowed staged action types. Those
-- proposal rows are removed first so the constraint can be re-added; they are
-- agent proposal rows only. Venues keep the stages they were moved to.

begin;

delete from public.ai_staged_actions where action_type = 'tour_target_stage';

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
    'email_template_upsert',
    'tour_update',
    'venue_upsert',
    'contact_upsert',
    'booking_wrapup',
    'expense_update',
    'expense_archive',
    'email_archive',
    'email_draft',
    'member_invite',
    'note_upsert',
    'social_draft',
    'record_delete',
    'tour_target_add'
  ));

commit;
