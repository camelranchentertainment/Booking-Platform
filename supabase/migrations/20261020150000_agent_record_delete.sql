-- supabase/migrations/20261020150000_agent_record_delete.sql
--
-- Lets the /band agent stage a delete proposal (action_type 'record_delete').
-- Applying it is safe on its own: it only widens what can be STAGED. Nothing
-- is removed until a band admin clicks Confirm, and the app re-checks every
-- item (past shows, money, logins, item limit) before deleting anything.
-- No existing row changes.
--
-- Rollback: supabase/migrations/rollback/20261020150000_agent_record_delete.down.sql

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
    -- Oct 2026: agent deletes (shows, tours, members, notes, media) with guardrails
    'record_delete'
  ));

commit;
