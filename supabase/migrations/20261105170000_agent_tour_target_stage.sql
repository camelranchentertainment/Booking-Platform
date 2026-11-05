-- supabase/migrations/20261105170000_agent_tour_target_stage.sql
--
-- Lets the /band agent stage "move this venue to another outreach stage"
-- (action_type 'tour_target_stage'). Applying it is safe on its own: it only
-- widens what can be STAGED. Nothing moves until a band admin clicks Confirm,
-- and the app re-checks the venue against the band. No existing row changes.
--
-- Rollback: supabase/migrations/rollback/20261105170000_agent_tour_target_stage.down.sql

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
    'tour_target_add',
    -- Nov 2026: agent moves a venue between outreach stages
    'tour_target_stage'
  ));

commit;
