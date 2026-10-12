-- supabase/migrations/20261012150000_booker_credentials.sql
-- Booking Agent workspace: an agent's own Gmail connection, so email sent from
-- the workspace goes out from the agent's address and lands in their Sent folder.
--
-- Guardrails (additive only):
--   * New table only. Nothing on the band side (acts, act_credentials) changes:
--     an agent's mailbox and a band's mailbox are separate connections.
--   * OAuth tokens live only here, and this table is service role only: RLS on,
--     no grants to anon or authenticated. The browser learns the connection
--     status through /api/booker/gmail/status and never sees a token.
--   * One connection per agent (booker_id is the primary key). Disconnecting
--     revokes the token at Google and deletes the row (no financial data here).
--
-- Apply manually after review. Never auto-run. Rollback:
--   supabase/migrations/rollback/20261012150000_booker_credentials.down.sql

begin;

create table public.booker_credentials (
  booker_id            uuid        primary key references public.booker_profiles(id) on delete cascade on update cascade,
  gmail_address        text        not null check (char_length(gmail_address) between 3 and 254),
  google_refresh_token text        not null check (char_length(google_refresh_token) between 1 and 2048),
  google_access_token  text        check (google_access_token is null or char_length(google_access_token) <= 4096),
  access_expires_at    timestamptz,
  connected_at         timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger trg_booker_credentials_updated before update on public.booker_credentials
  for each row execute function public.touch_updated_at();

revoke all on public.booker_credentials from anon, authenticated;
alter table public.booker_credentials enable row level security;
-- No policies: with RLS on and no grants, only the service role can read or write.

commit;
