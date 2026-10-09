-- supabase/migrations/20261009150000_agent_admin_actions.sql
--
-- One migration for the agent's full admin toolset (PRs A–D). Applying it
-- early is safe: it only widens what can be staged and adds a nullable
-- column; no existing row changes.
--
-- 1. ai_staged_actions_action_type_check — every action the agent can stage.
--    Superset of 20261009120000_staged_action_email_template.sql.
-- 2. expenses.archived_at — financial data is archived, never deleted. An
--    archived expense is hidden from totals but kept for the record.
--
-- Rollback: supabase/migrations/rollback/20261009150000_agent_admin_actions.down.sql

begin;

alter table public.ai_staged_actions
  drop constraint if exists ai_staged_actions_action_type_check;

alter table public.ai_staged_actions
  add constraint ai_staged_actions_action_type_check
  check (action_type in (
    -- existing
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
    -- PR A
    'tour_update',
    -- PR B
    'venue_upsert',
    'contact_upsert',
    -- PR C
    'booking_wrapup',
    'expense_update',
    'expense_archive',
    -- PR D
    'email_archive',
    'email_draft',
    'member_invite',
    'note_upsert',
    'social_draft'
  ));

alter table public.expenses
  add column if not exists archived_at timestamptz;

comment on column public.expenses.archived_at is
  'Set when an expense is archived (removed from totals). Financial rows are never deleted.';

-- Totals filter on (act_id, archived_at is null).
create index if not exists idx_expenses_act_active
  on public.expenses (act_id)
  where archived_at is null;

commit;
