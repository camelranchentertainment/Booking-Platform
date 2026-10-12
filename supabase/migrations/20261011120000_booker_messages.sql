-- supabase/migrations/20261011120000_booker_messages.sql
-- Booking Agent workspace: email sent from the workspace, and its history.
--
-- Decided Oct 11, 2026: agents email venues, contacts and their bands from the
-- workspace. Every message is logged against the venue, contact, band and show
-- it concerns, so each profile shows its own history, and a message can carry a
-- follow-up date that surfaces on the agent's Home page.
--
-- Guardrails (additive only):
--   * One new table, booker_messages. The only change to an existing table is a
--     new UNIQUE (id, booker_id) on booker_contacts so messages can reference a
--     contact through the same composite-key pattern as every other booker_ FK
--     (id is already the primary key, so this cannot fail on existing rows).
--   * The browser can READ its own messages and update only the follow-up
--     fields and deleted_at (column-level grant). It cannot INSERT: rows are
--     written by /api/booker/messages/send with the service role after the send,
--     so the history cannot be forged to show mail that was never sent.
--   * Rows are never hard-deleted (no DELETE grant); "remove" sets deleted_at.
--   * Bands cannot read this table.
--
-- Apply manually after review. Never auto-run. Rollback:
--   supabase/migrations/rollback/20261011120000_booker_messages.down.sql

begin;

alter table public.booker_contacts
  add constraint uq_booker_contacts_id_booker unique (id, booker_id);

create table public.booker_messages (
  id                  uuid        primary key default gen_random_uuid(),
  booker_id           uuid        not null references public.booker_profiles(id) on delete cascade on update cascade,
  -- What the message is about. All optional; each must belong to the same agent.
  roster_id           uuid,
  venue_id            uuid,
  contact_id          uuid,
  show_id             uuid,
  direction           text        not null default 'outbound' check (direction in ('outbound', 'inbound')),
  to_email            text        not null check (char_length(to_email) between 3 and 254),
  to_name             text        check (to_name is null or char_length(to_name) <= 120),
  -- The agent was copied on the send.
  copy_to_self        boolean     not null default false,
  subject             text        not null check (char_length(btrim(subject)) between 1 and 200),
  body                text        not null check (char_length(btrim(body)) between 1 and 20000),
  from_address        text        check (from_address is null or char_length(from_address) <= 254),
  reply_to            text        check (reply_to is null or char_length(reply_to) <= 254),
  sent_via            text        not null check (sent_via in ('platform', 'gmail')),
  provider_message_id text        check (provider_message_id is null or char_length(provider_message_id) <= 300),
  status              text        not null check (status in ('sent', 'failed')),
  -- Plain-language failure reason (never raw provider output).
  error               text        check (error is null or char_length(error) <= 500),
  -- Set by later phases: which starter template was used, and whether AI drafted it.
  template_key        text        check (template_key is null or char_length(template_key) <= 60),
  ai_assisted         boolean     not null default false,
  sent_at             timestamptz,
  followup_on         date,
  followup_done_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint booker_messages_roster_fk
    foreign key (roster_id, booker_id) references public.booker_roster (id, booker_id)
    on delete restrict on update cascade,
  constraint booker_messages_venue_fk
    foreign key (venue_id, booker_id) references public.booker_venues (id, booker_id)
    on delete restrict on update cascade,
  constraint booker_messages_contact_fk
    foreign key (contact_id, booker_id) references public.booker_contacts (id, booker_id)
    on delete restrict on update cascade,
  constraint booker_messages_show_fk
    foreign key (show_id, booker_id) references public.booker_shows (id, booker_id)
    on delete restrict on update cascade,
  constraint booker_messages_sent_ck
    check (status <> 'sent' or sent_at is not null)
);

create index idx_booker_messages_booker_created on public.booker_messages (booker_id, created_at desc) where deleted_at is null;
create index idx_booker_messages_roster  on public.booker_messages (roster_id, booker_id)  where roster_id  is not null;
create index idx_booker_messages_venue   on public.booker_messages (venue_id, booker_id)   where venue_id   is not null;
create index idx_booker_messages_contact on public.booker_messages (contact_id, booker_id) where contact_id is not null;
create index idx_booker_messages_show    on public.booker_messages (show_id, booker_id)    where show_id    is not null;
-- Home page "follow up" list and the send rate limit.
create index idx_booker_messages_followup on public.booker_messages (booker_id, followup_on)
  where followup_on is not null and followup_done_at is null and deleted_at is null;

create trigger trg_booker_messages_updated before update on public.booker_messages
  for each row execute function public.touch_updated_at();

revoke all on public.booker_messages from anon, authenticated;
grant select on public.booker_messages to authenticated;
grant update (followup_on, followup_done_at, deleted_at) on public.booker_messages to authenticated;

alter table public.booker_messages enable row level security;

create policy booker_messages_select_own on public.booker_messages
  for select to authenticated using (booker_id = (select public.booker_current_id()));
create policy booker_messages_update_own on public.booker_messages
  for update to authenticated
  using (booker_id = (select public.booker_current_id()))
  with check (booker_id = (select public.booker_current_id()));

commit;
