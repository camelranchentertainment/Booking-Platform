-- supabase/migrations/20261105120000_agent_tour_target_add.sql
--
-- Lets the /band agent stage "add this venue to a tour's outreach list"
-- (action_type 'tour_target_add'). Applying it is safe on its own: it only
-- widens what can be STAGED. Nothing is added until a band admin clicks
-- Confirm, and the app re-checks the tour and venue against the band.
-- No existing row changes.
--
-- Rollback: supabase/migrations/rollback/20261105120000_agent_tour_target_add.down.sql

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
    -- Nov 2026: agent adds venues to a tour's outreach list
    'tour_target_add'
  ));

commit;
