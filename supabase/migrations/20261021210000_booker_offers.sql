-- 20261021210000_booker_offers.sql
-- Offers and deal memos for the Booking Agent workspace (build list item 4).
-- No e-sign: documents are generated as PDF and sent by email; the agent
-- records the buyer's answer.
--
--   booker_offer_templates  the agent's standard terms (e.g. "Club guarantee",
--                           "Festival"), one marked default
--   booker_offers           one offer or deal memo for a show: a snapshot of
--                           the terms as sent, its status, and the email that
--                           carried it
--
-- Guardrails (same as the rest of the workspace):
--   * Additive only: two new booker_ tables. No existing table, column, policy
--     or function changes.
--   * Every row belongs to one agent (booker_id); RLS limits reads and writes to
--     the owning agent. Child rows reference parents through composite
--     (id, booker_id) keys, so an offer can never point at another agent's show.
--   * Financial terms are never deleted: no DELETE grant; rows are archived
--     with deleted_at.
--   * The browser cannot set the "how it was sent" fields (sent_at, sent_to,
--     message_id): column-level grants leave them to the send route, which
--     writes them only after Gmail accepts the email. So the record can't claim
--     an offer went out that never did.
--   * Bands cannot read either table.
--
-- Apply manually after review. Never auto-run. Rollback:
--   supabase/migrations/rollback/20261021210000_booker_offers.down.sql

begin;

-- ── 1. Templates ─────────────────────────────────────────────────────────────
create table public.booker_offer_templates (
  id          uuid        primary key default gen_random_uuid(),
  booker_id   uuid        not null references public.booker_profiles(id) on delete cascade on update cascade,
  name        text        not null check (char_length(btrim(name)) between 1 and 80),
  -- Standard terms text. May use placeholders such as {{band}}, {{venue}},
  -- {{date}}, {{fee}}, {{deposit}}, {{deposit_due}}, {{set_time}}; the app fills them.
  terms       text        not null check (char_length(terms) <= 8000),
  hospitality text        check (hospitality is null or char_length(hospitality) <= 2000),
  is_default  boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint uq_booker_offer_templates_id_booker unique (id, booker_id)
);
-- At most one default template per agent.
create unique index uq_booker_offer_templates_default
  on public.booker_offer_templates (booker_id) where is_default and deleted_at is null;
create index idx_booker_offer_templates_booker on public.booker_offer_templates (booker_id) where deleted_at is null;

-- ── 2. Offers and deal memos ─────────────────────────────────────────────────
-- booker_messages needs (id, booker_id) unique for the composite key below.
-- id is already the primary key, so this cannot fail on existing rows.
alter table public.booker_messages
  add constraint uq_booker_messages_id_booker unique (id, booker_id);

create table public.booker_offers (
  id               uuid        primary key default gen_random_uuid(),
  booker_id        uuid        not null references public.booker_profiles(id) on delete cascade on update cascade,
  show_id          uuid        not null,
  template_id      uuid,
  -- 'offer' = proposed terms to the buyer; 'deal_memo' = the agreed terms, sent after acceptance.
  kind             text        not null default 'offer' check (kind in ('offer', 'deal_memo')),
  -- Per-agent running number shown on the document ("Offer #14"); set by trigger.
  doc_number       integer     not null default 0,
  status           text        not null default 'draft'
                     check (status in ('draft', 'sent', 'accepted', 'declined', 'withdrawn')),

  -- Snapshot of the terms as written on the document. Kept even if the show
  -- changes later, so the record shows exactly what was offered.
  band_name        text        not null check (char_length(btrim(band_name)) between 1 and 120),
  venue_name       text        not null check (char_length(btrim(venue_name)) between 1 and 160),
  venue_city       text        check (venue_city is null or char_length(venue_city) <= 100),
  venue_state      text        check (venue_state is null or char_length(venue_state) <= 100),
  show_date        date        not null,
  load_in_time     time,
  door_time        time,
  set_time         time,
  set_length_min   integer     check (set_length_min is null or set_length_min between 1 and 600),
  deal_type        text        check (deal_type is null or deal_type in ('guarantee', 'door', 'percentage', 'guarantee_plus', 'other')),
  fee              numeric(10,2) check (fee is null or fee >= 0),
  -- Door / percentage terms in words, e.g. "80% of door after $300 house costs".
  deal_terms       text        check (deal_terms is null or char_length(deal_terms) <= 1000),
  deposit_amount   numeric(10,2) check (deposit_amount is null or deposit_amount >= 0),
  deposit_due_on   date,
  hospitality      text        check (hospitality is null or char_length(hospitality) <= 2000),
  terms            text        check (terms is null or char_length(terms) <= 8000),
  -- Who it is addressed to (the talent buyer).
  buyer_name       text        check (buyer_name is null or char_length(buyer_name) <= 120),
  buyer_email      text        check (buyer_email is null or char_length(buyer_email) <= 254),
  -- The offer stands until this date.
  expires_on       date,

  -- How it was sent: written only by the send route (see column grants below).
  sent_at          timestamptz,
  sent_to          text        check (sent_to is null or char_length(sent_to) <= 254),
  message_id       uuid,

  -- The buyer's answer, recorded by the agent.
  responded_at     timestamptz,
  response_note    text        check (response_note is null or char_length(response_note) <= 1000),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,

  constraint uq_booker_offers_id_booker unique (id, booker_id),
  constraint booker_offers_show_fk
    foreign key (show_id, booker_id) references public.booker_shows (id, booker_id)
    on delete restrict on update cascade,
  constraint booker_offers_template_fk
    foreign key (template_id, booker_id) references public.booker_offer_templates (id, booker_id)
    on delete restrict on update cascade,
  constraint booker_offers_message_fk
    foreign key (message_id, booker_id) references public.booker_messages (id, booker_id)
    on delete restrict on update cascade,
  constraint booker_offers_answered_ck
    check (status not in ('accepted', 'declined') or responded_at is not null),
  -- "sent" only once the send route has recorded the send.
  constraint booker_offers_sent_ck
    check (status <> 'sent' or sent_at is not null)
);

create index idx_booker_offers_booker_created on public.booker_offers (booker_id, created_at desc) where deleted_at is null;
create index idx_booker_offers_show           on public.booker_offers (show_id, booker_id);
create index idx_booker_offers_open           on public.booker_offers (booker_id, expires_on) where deleted_at is null and status = 'sent';

-- ── 3. Running document number per agent ─────────────────────────────────────
create or replace function public.booker_offers_set_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Serialise per agent so two offers created at once can't share a number.
  perform pg_advisory_xact_lock(hashtextextended('booker_offers:' || new.booker_id::text, 0));
  select coalesce(max(o.doc_number), 0) + 1 into new.doc_number
    from public.booker_offers o where o.booker_id = new.booker_id;
  return new;
end;
$$;
revoke all on function public.booker_offers_set_number() from public, anon, authenticated;

create trigger trg_booker_offers_number before insert on public.booker_offers
  for each row execute function public.booker_offers_set_number();

create trigger trg_booker_offer_templates_updated before update on public.booker_offer_templates for each row execute function public.touch_updated_at();
create trigger trg_booker_offers_updated          before update on public.booker_offers          for each row execute function public.touch_updated_at();

-- ── 4. Privileges: read own rows; write own rows except the "sent" fields; never delete
revoke all on public.booker_offer_templates, public.booker_offers from anon, authenticated;

grant select, insert, update on public.booker_offer_templates to authenticated;

grant select on public.booker_offers to authenticated;
grant insert (booker_id, show_id, template_id, kind, status, band_name, venue_name, venue_city, venue_state,
              show_date, load_in_time, door_time, set_time, set_length_min, deal_type, fee, deal_terms,
              deposit_amount, deposit_due_on, hospitality, terms, buyer_name, buyer_email, expires_on,
              responded_at, response_note)
  on public.booker_offers to authenticated;
grant update (template_id, kind, status, band_name, venue_name, venue_city, venue_state,
              show_date, load_in_time, door_time, set_time, set_length_min, deal_type, fee, deal_terms,
              deposit_amount, deposit_due_on, hospitality, terms, buyer_name, buyer_email, expires_on,
              responded_at, response_note, deleted_at)
  on public.booker_offers to authenticated;

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
alter table public.booker_offer_templates enable row level security;
alter table public.booker_offers          enable row level security;

create policy booker_offer_templates_select_own on public.booker_offer_templates
  for select to authenticated using (booker_id = (select public.booker_current_id()));
create policy booker_offer_templates_insert_own on public.booker_offer_templates
  for insert to authenticated with check (booker_id = (select public.booker_current_id()));
create policy booker_offer_templates_update_own on public.booker_offer_templates
  for update to authenticated
  using (booker_id = (select public.booker_current_id()))
  with check (booker_id = (select public.booker_current_id()));

create policy booker_offers_select_own on public.booker_offers
  for select to authenticated using (booker_id = (select public.booker_current_id()));
-- "sent" can't be faked from the browser: it needs sent_at, which only the send route can write.
create policy booker_offers_insert_own on public.booker_offers
  for insert to authenticated
  with check (booker_id = (select public.booker_current_id()));
create policy booker_offers_update_own on public.booker_offers
  for update to authenticated
  using (booker_id = (select public.booker_current_id()))
  with check (booker_id = (select public.booker_current_id()));

commit;
