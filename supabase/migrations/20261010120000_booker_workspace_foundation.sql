-- supabase/migrations/20261010120000_booker_workspace_foundation.sql
-- Booking Agent workspace, phase 1: the agent's own data.
--
-- Spec: "Booking Agent Workspace — Spec" (Claude Docs). "Booker" is the code name
-- for the Booking Agent role; "agent" already means the AI assistant.
--
-- Guardrails (additive only):
--   * New tables only, all prefixed booker_. No existing table, column, policy,
--     function or trigger is changed.
--   * profiles.role and profiles.act_id are untouched. Being a Booking Agent is a
--     booker_profiles row keyed to the user, so one person can be both a Band
--     Admin and a Booking Agent.
--   * Every row belongs to exactly one agent (booker_id). RLS limits every table
--     to the owning agent. Bands cannot read any of it in this phase.
--   * Child rows reference parents through composite (id, booker_id) foreign keys,
--     so a show can never point at another agent's band or venue.
--   * Nothing is hard-deleted from the browser: authenticated gets no DELETE.
--     Rows are archived with deleted_at (financial history is never deleted).
--
-- Linking to band accounts, the read-only doorway and proposals come in later
-- migrations (spec phases 3-5).
--
-- Apply manually after review. Never auto-run. Rollback:
--   supabase/migrations/rollback/20261010120000_booker_workspace_foundation.down.sql

begin;

-- ── 1. Agent identity ────────────────────────────────────────────────────────
create table public.booker_profiles (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles(id) on delete cascade on update cascade,
  agency_name   text        not null check (char_length(btrim(agency_name)) between 1 and 120),
  contact_name  text        check (contact_name is null or char_length(contact_name) <= 120),
  contact_email text        check (contact_email is null or char_length(contact_email) <= 254),
  contact_phone text        check (contact_phone is null or char_length(contact_phone) <= 40),
  -- Default commission for newly added bands (percent, 0-100).
  default_commission_pct numeric(5,2) check (default_commission_pct is null or default_commission_pct between 0 and 100),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint uq_booker_profiles_user unique (user_id)
);

-- Returns the caller's booker_profiles.id, or null. SECURITY DEFINER so policies
-- can use it without recursive RLS evaluation. Takes no input; reads auth.uid().
create or replace function public.booker_current_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select bp.id
    from public.booker_profiles bp
   where bp.user_id = auth.uid()
     and bp.deleted_at is null
$$;

revoke all on function public.booker_current_id() from public, anon;
grant execute on function public.booker_current_id() to authenticated, service_role;

-- ── 2. Roster: one row per band the agent carries ───────────────────────────
-- Bands here may or may not have their own Camel Ranch account.
create table public.booker_roster (
  id             uuid        primary key default gen_random_uuid(),
  booker_id      uuid        not null references public.booker_profiles(id) on delete cascade on update cascade,
  band_name      text        not null check (char_length(btrim(band_name)) between 1 and 120),
  genre          text        check (genre is null or char_length(genre) <= 80),
  home_city      text        check (home_city is null or char_length(home_city) <= 100),
  home_state     text        check (home_state is null or char_length(home_state) <= 100),
  contact_name   text        check (contact_name is null or char_length(contact_name) <= 120),
  contact_email  text        check (contact_email is null or char_length(contact_email) <= 254),
  contact_phone  text        check (contact_phone is null or char_length(contact_phone) <= 40),
  commission_pct numeric(5,2) check (commission_pct is null or commission_pct between 0 and 100),
  color          text        check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  notes          text        check (notes is null or char_length(notes) <= 5000),
  status         text        not null default 'active' check (status in ('active', 'inactive')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint uq_booker_roster_id_booker unique (id, booker_id)
);
create index idx_booker_roster_booker on public.booker_roster (booker_id) where deleted_at is null;

-- ── 3. The agent's own venue book (shared across all their bands) ──────────
create table public.booker_venues (
  id          uuid        primary key default gen_random_uuid(),
  booker_id   uuid        not null references public.booker_profiles(id) on delete cascade on update cascade,
  name        text        not null check (char_length(btrim(name)) between 1 and 160),
  address     text        check (address is null or char_length(address) <= 200),
  city        text        check (city is null or char_length(city) <= 100),
  state       text        check (state is null or char_length(state) <= 100),
  postal_code text        check (postal_code is null or char_length(postal_code) <= 20),
  capacity    integer     check (capacity is null or capacity between 0 and 200000),
  website     text        check (website is null or char_length(website) <= 300),
  notes       text        check (notes is null or char_length(notes) <= 5000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint uq_booker_venues_id_booker unique (id, booker_id)
);
create index idx_booker_venues_booker on public.booker_venues (booker_id) where deleted_at is null;

-- ── 4. Venue contacts. Never visible to bands ────────────────────────────────
create table public.booker_contacts (
  id         uuid        primary key default gen_random_uuid(),
  booker_id  uuid        not null references public.booker_profiles(id) on delete cascade on update cascade,
  venue_id   uuid,
  name       text        not null check (char_length(btrim(name)) between 1 and 120),
  title      text        check (title is null or char_length(title) <= 80),
  email      text        check (email is null or char_length(email) <= 254),
  phone      text        check (phone is null or char_length(phone) <= 40),
  notes      text        check (notes is null or char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint booker_contacts_venue_fk
    foreign key (venue_id, booker_id) references public.booker_venues (id, booker_id)
    on delete cascade on update cascade
);
create index idx_booker_contacts_booker on public.booker_contacts (booker_id) where deleted_at is null;
create index idx_booker_contacts_venue  on public.booker_contacts (venue_id, booker_id);

-- ── 5. Shows the agent books ─────────────────────────────────────────────────
create table public.booker_shows (
  id                      uuid        primary key default gen_random_uuid(),
  booker_id               uuid        not null references public.booker_profiles(id) on delete cascade on update cascade,
  roster_id               uuid        not null,
  venue_id                uuid,
  -- Free-text venue when the agent has not saved the venue to their venue book.
  venue_name              text        check (venue_name is null or char_length(venue_name) <= 160),
  venue_city              text        check (venue_city is null or char_length(venue_city) <= 100),
  show_date               date        not null,
  load_in_time            time,
  door_time               time,
  set_time                time,
  set_length_min          integer     check (set_length_min is null or set_length_min between 1 and 600),
  status                  text        not null default 'hold'
                            check (status in ('hold', 'pending', 'confirmed', 'played', 'cancelled')),
  deal_type               text        check (deal_type is null or deal_type in ('guarantee', 'door', 'percentage', 'guarantee_plus', 'other')),
  fee                     numeric(10,2) check (fee is null or fee >= 0),
  actual_amount           numeric(10,2) check (actual_amount is null or actual_amount >= 0),
  commission_pct_override numeric(5,2) check (commission_pct_override is null or commission_pct_override between 0 and 100),
  deal_notes              text        check (deal_notes is null or char_length(deal_notes) <= 5000),
  internal_notes          text        check (internal_notes is null or char_length(internal_notes) <= 5000),
  followup_on             date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz,
  constraint uq_booker_shows_id_booker unique (id, booker_id),
  constraint booker_shows_roster_fk
    foreign key (roster_id, booker_id) references public.booker_roster (id, booker_id)
    on delete restrict on update cascade,
  constraint booker_shows_venue_fk
    foreign key (venue_id, booker_id) references public.booker_venues (id, booker_id)
    on delete restrict on update cascade,
  constraint booker_shows_venue_ck
    check (venue_id is not null or nullif(btrim(coalesce(venue_name, '')), '') is not null)
);
create index idx_booker_shows_booker_date on public.booker_shows (booker_id, show_date) where deleted_at is null;
create index idx_booker_shows_roster      on public.booker_shows (roster_id, booker_id);
create index idx_booker_shows_venue       on public.booker_shows (venue_id, booker_id);

-- ── 6. Commission payments received from bands ──────────────────────────────
create table public.booker_commission_payments (
  id         uuid        primary key default gen_random_uuid(),
  booker_id  uuid        not null references public.booker_profiles(id) on delete cascade on update cascade,
  show_id    uuid        not null,
  amount     numeric(10,2) not null check (amount > 0),
  method     text        not null check (method in ('cash_app', 'venmo', 'paypal', 'zelle', 'check', 'cash', 'other')),
  paid_on    date        not null,
  notes      text        check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint booker_commission_payments_show_fk
    foreign key (show_id, booker_id) references public.booker_shows (id, booker_id)
    on delete restrict on update cascade
);
create index idx_booker_commission_payments_booker on public.booker_commission_payments (booker_id, paid_on desc) where deleted_at is null;
create index idx_booker_commission_payments_show   on public.booker_commission_payments (show_id, booker_id);

-- ── 7. updated_at triggers ───────────────────────────────────────────────────
create trigger trg_booker_profiles_updated            before update on public.booker_profiles            for each row execute function public.touch_updated_at();
create trigger trg_booker_roster_updated              before update on public.booker_roster              for each row execute function public.touch_updated_at();
create trigger trg_booker_venues_updated              before update on public.booker_venues              for each row execute function public.touch_updated_at();
create trigger trg_booker_contacts_updated            before update on public.booker_contacts            for each row execute function public.touch_updated_at();
create trigger trg_booker_shows_updated               before update on public.booker_shows               for each row execute function public.touch_updated_at();
create trigger trg_booker_commission_payments_updated before update on public.booker_commission_payments for each row execute function public.touch_updated_at();

-- ── 8. Privileges: browser may read, add and edit its own rows; never delete ─
revoke all on public.booker_profiles, public.booker_roster, public.booker_venues,
              public.booker_contacts, public.booker_shows, public.booker_commission_payments
  from anon, authenticated;
grant select, insert, update on public.booker_profiles, public.booker_roster, public.booker_venues,
              public.booker_contacts, public.booker_shows, public.booker_commission_payments
  to authenticated;

-- ── 9. RLS ───────────────────────────────────────────────────────────────────
alter table public.booker_profiles            enable row level security;
alter table public.booker_roster              enable row level security;
alter table public.booker_venues              enable row level security;
alter table public.booker_contacts            enable row level security;
alter table public.booker_shows               enable row level security;
alter table public.booker_commission_payments enable row level security;

-- Profiles: a signed-in user manages only their own agent profile.
create policy booker_profiles_select_own on public.booker_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy booker_profiles_insert_own on public.booker_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy booker_profiles_update_own on public.booker_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Every other table: rows belong to the caller's agent profile, on read and write.
create policy booker_roster_select_own on public.booker_roster
  for select to authenticated using (booker_id = (select public.booker_current_id()));
create policy booker_roster_insert_own on public.booker_roster
  for insert to authenticated with check (booker_id = (select public.booker_current_id()));
create policy booker_roster_update_own on public.booker_roster
  for update to authenticated
  using (booker_id = (select public.booker_current_id()))
  with check (booker_id = (select public.booker_current_id()));

create policy booker_venues_select_own on public.booker_venues
  for select to authenticated using (booker_id = (select public.booker_current_id()));
create policy booker_venues_insert_own on public.booker_venues
  for insert to authenticated with check (booker_id = (select public.booker_current_id()));
create policy booker_venues_update_own on public.booker_venues
  for update to authenticated
  using (booker_id = (select public.booker_current_id()))
  with check (booker_id = (select public.booker_current_id()));

create policy booker_contacts_select_own on public.booker_contacts
  for select to authenticated using (booker_id = (select public.booker_current_id()));
create policy booker_contacts_insert_own on public.booker_contacts
  for insert to authenticated with check (booker_id = (select public.booker_current_id()));
create policy booker_contacts_update_own on public.booker_contacts
  for update to authenticated
  using (booker_id = (select public.booker_current_id()))
  with check (booker_id = (select public.booker_current_id()));

create policy booker_shows_select_own on public.booker_shows
  for select to authenticated using (booker_id = (select public.booker_current_id()));
create policy booker_shows_insert_own on public.booker_shows
  for insert to authenticated with check (booker_id = (select public.booker_current_id()));
create policy booker_shows_update_own on public.booker_shows
  for update to authenticated
  using (booker_id = (select public.booker_current_id()))
  with check (booker_id = (select public.booker_current_id()));

create policy booker_commission_payments_select_own on public.booker_commission_payments
  for select to authenticated using (booker_id = (select public.booker_current_id()));
create policy booker_commission_payments_insert_own on public.booker_commission_payments
  for insert to authenticated with check (booker_id = (select public.booker_current_id()));
create policy booker_commission_payments_update_own on public.booker_commission_payments
  for update to authenticated
  using (booker_id = (select public.booker_current_id()))
  with check (booker_id = (select public.booker_current_id()));

commit;
