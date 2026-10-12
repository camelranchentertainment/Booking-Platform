-- supabase/migrations/20261012120000_booker_ai_events.sql
-- Booking Agent workspace: a usage log for AI features, so AI drafting (and the
-- agent's assistant, next) can be rate-limited per agent across every server
-- instance. One row per AI request; no prompt or output text is stored.
--
-- Guardrails (additive only):
--   * New table only. No existing table is changed.
--   * Service role only: browser roles get no privileges at all. The API
--     routes write a row before each AI call and count recent rows to decide
--     whether to allow the next one.
--
-- Apply manually after review. Never auto-run. Rollback:
--   supabase/migrations/rollback/20261012120000_booker_ai_events.down.sql

begin;

create table public.booker_ai_events (
  id         uuid        primary key default gen_random_uuid(),
  booker_id  uuid        not null references public.booker_profiles(id) on delete cascade on update cascade,
  kind       text        not null check (kind in ('email_draft', 'assistant')),
  created_at timestamptz not null default now()
);

create index idx_booker_ai_events_booker_kind_created
  on public.booker_ai_events (booker_id, kind, created_at desc);

revoke all on public.booker_ai_events from anon, authenticated;
alter table public.booker_ai_events enable row level security;
-- No policies: with RLS on and no grants, only the service role can read or write.

commit;
