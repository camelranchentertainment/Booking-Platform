-- Rollback for 20261020150000_agent_record_delete.sql
--
-- Removes 'record_delete' from the allowed staged action types. Any delete
-- PROPOSALS still waiting (or already handled) are removed first so the
-- constraint can be re-added; these are agent proposal rows only, not band data.

begin;

delete from public.ai_staged_actions where action_type = 'record_delete';

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
    'social_draft'
  ));

commit;
