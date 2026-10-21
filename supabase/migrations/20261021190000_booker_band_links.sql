-- 20261021190000_booker_band_links.sql
-- Booking Agent ↔ band hand-off (build list item 3; spec phases 3–5).
--
--   booker_links      the band-approved link between an agent's roster entry
--                     and a real band account (acts row), with the agent's
--                     sharing settings for that band
--   booker_proposals  a confirmed show the agent sends to a linked band; it
--                     reaches the band's calendar (bookings) only when the
--                     Band Admin accepts
--
-- Guardrails (same as the workspace foundation):
--   * Additive only. No existing table, column, policy or trigger changes.
--     Bookings and venues are written only inside booker_proposal_accept(),
--     acting as the Band Admin who clicked Accept.
--   * Neither side writes these tables directly: the browser gets SELECT only
--     (agent: own rows by RLS), and every change goes through a SECURITY
--     DEFINER function that checks the caller from auth.uid(). No function
--     takes a user ID as input.
--   * The band's act always comes from the caller's profile, never a parameter.
--   * Only fields the agent chose to share are copied into a proposal, so
--     unshared data never reaches the band's browser. Venue contacts and the
--     agent's internal notes are never copied.
--   * One active agent per band, enforced by a partial unique index.
--   * Revoking a link stops the read-in immediately: every function checks
--     status = 'active' on each call.
--
-- Apply manually after review. Never auto-run. Rollback:
--   supabase/migrations/rollback/20261021190000_booker_band_links.down.sql

begin;

-- ── 1. Links ─────────────────────────────────────────────────────────────────
create table public.booker_links (
  id                uuid        primary key default gen_random_uuid(),
  booker_id         uuid        not null references public.booker_profiles(id) on delete cascade on update cascade,
  roster_id         uuid        not null,
  -- Band Admin email the agent invited. The agent never learns whether an
  -- account exists for it; act_id is filled only when that admin accepts.
  invited_email     text        not null check (char_length(invited_email) between 3 and 254 and invited_email like '%@%'),
  act_id            uuid        references public.acts(id) on delete cascade,
  status            text        not null default 'invited'
                      check (status in ('invited', 'active', 'declined', 'revoked')),
  -- What the band sees on shows sent to it. Date, venue and city are always shared.
  share_times       boolean     not null default true,
  share_deal        boolean     not null default true,
  share_deal_notes  boolean     not null default false,
  share_commission  boolean     not null default false,
  invited_at        timestamptz not null default now(),
  accepted_at       timestamptz,
  accepted_by       uuid        references auth.users(id) on delete set null,
  declined_at       timestamptz,
  revoked_at        timestamptz,
  revoked_by        uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint uq_booker_links_id_booker unique (id, booker_id),
  constraint booker_links_roster_fk
    foreign key (roster_id, booker_id) references public.booker_roster (id, booker_id)
    on delete cascade on update cascade,
  constraint booker_links_active_has_act_ck
    check (status <> 'active' or act_id is not null)
);

-- A band has at most one active agent.
create unique index uq_booker_links_one_agent_per_band
  on public.booker_links (act_id) where status = 'active';
-- A roster entry has at most one open (invited or active) link.
create unique index uq_booker_links_one_open_per_roster
  on public.booker_links (roster_id) where status in ('invited', 'active');
create index idx_booker_links_booker on public.booker_links (booker_id);
create index idx_booker_links_email  on public.booker_links (lower(invited_email)) where status = 'invited';
create index idx_booker_links_act    on public.booker_links (act_id) where act_id is not null;

-- ── 2. Proposals ─────────────────────────────────────────────────────────────
create table public.booker_proposals (
  id                    uuid        primary key default gen_random_uuid(),
  booker_id             uuid        not null references public.booker_profiles(id) on delete cascade on update cascade,
  link_id               uuid        not null,
  show_id               uuid        not null,
  kind                  text        not null default 'add_show' check (kind in ('add_show')),
  -- Snapshot of the shared fields only, built by booker_proposal_send().
  payload               jsonb       not null,
  status                text        not null default 'pending'
                          check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  decision_note         text        check (decision_note is null or char_length(decision_note) <= 500),
  decided_by            uuid        references auth.users(id) on delete set null,
  decided_at            timestamptz,
  resulting_booking_id  uuid        references public.bookings(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint booker_proposals_link_fk
    foreign key (link_id, booker_id) references public.booker_links (id, booker_id)
    on delete cascade on update cascade,
  constraint booker_proposals_show_fk
    foreign key (show_id, booker_id) references public.booker_shows (id, booker_id)
    on delete restrict on update cascade
);

-- One pending proposal per show; a declined or withdrawn one can be re-sent.
create unique index uq_booker_proposals_one_pending_per_show
  on public.booker_proposals (show_id) where status = 'pending';
create index idx_booker_proposals_booker on public.booker_proposals (booker_id, created_at desc);
create index idx_booker_proposals_link   on public.booker_proposals (link_id, status);
create index idx_booker_proposals_show   on public.booker_proposals (show_id, booker_id);

create trigger trg_booker_links_updated     before update on public.booker_links     for each row execute function public.touch_updated_at();
create trigger trg_booker_proposals_updated before update on public.booker_proposals for each row execute function public.touch_updated_at();

-- ── 3. Privileges and RLS: the agent reads its own rows; nobody writes directly
revoke all on public.booker_links, public.booker_proposals from anon, authenticated;
grant select on public.booker_links, public.booker_proposals to authenticated;

alter table public.booker_links     enable row level security;
alter table public.booker_proposals enable row level security;

create policy booker_links_select_own on public.booker_links
  for select to authenticated using (booker_id = (select public.booker_current_id()));
create policy booker_proposals_select_own on public.booker_proposals
  for select to authenticated using (booker_id = (select public.booker_current_id()));

-- ── 4. Internal helpers (not callable from the browser) ─────────────────────

-- The caller's band act when they are a Band Admin (or superadmin) with a band;
-- null otherwise. Agent accounts have no act, so they never qualify.
create or replace function public.booker_caller_band_act()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.act_id
    from public.profiles p
   where p.id = auth.uid()
     and p.act_id is not null
     and p.role in ('band_admin', 'superadmin')
$$;

-- The caller's sign-in email, lower-cased.
create or replace function public.booker_caller_email()
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select lower(u.email) from auth.users u where u.id = auth.uid()
$$;

-- In-app notice. type 'system' is the only general type notifications allows.
create or replace function public.booker_notify(p_user uuid, p_act uuid, p_title text, p_message text, p_link text)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  insert into public.notifications (user_id, act_id, type, title, message, link, action_url, read)
  values (p_user, p_act, 'system', p_title, p_message, p_link, p_link, false)
$$;

revoke all on function public.booker_caller_band_act() from public, anon, authenticated;
revoke all on function public.booker_caller_email()    from public, anon, authenticated;
revoke all on function public.booker_notify(uuid, uuid, text, text, text) from public, anon, authenticated;

-- ── 5. Agent side ────────────────────────────────────────────────────────────

-- Invite a Band Admin (by email) to link to one of the agent's roster bands.
-- Rate limited to 20 invites per agent per day.
create or replace function public.booker_link_invite(p_roster_id uuid, p_email text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_booker uuid := public.booker_current_id();
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_band   text;
  v_agency text;
  v_id     uuid;
  v_user   uuid;
begin
  if v_booker is null then
    raise exception 'Only a Booking Agent can invite a band' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;

  select r.band_name into v_band
    from public.booker_roster r
   where r.id = p_roster_id and r.booker_id = v_booker and r.deleted_at is null;
  if v_band is null then
    raise exception 'Band not found on your roster' using errcode = 'P0002';
  end if;

  if (select count(*) from public.booker_links l
       where l.booker_id = v_booker and l.invited_at > now() - interval '1 day') >= 20 then
    raise exception 'Invite limit reached for today. Try again tomorrow.' using errcode = '54000';
  end if;

  insert into public.booker_links (booker_id, roster_id, invited_email)
  values (v_booker, p_roster_id, v_email)
  returning id into v_id;

  -- Tell the Band Admin in-app if that email belongs to one. The agent is not
  -- told either way.
  select bp.agency_name into v_agency from public.booker_profiles bp where bp.id = v_booker;
  for v_user in
    select p.id from public.profiles p
      join auth.users u on u.id = p.id
     where lower(u.email) = v_email and p.act_id is not null and p.role in ('band_admin', 'superadmin')
  loop
    perform public.booker_notify(v_user, null, 'Booking agent invite',
      coalesce(v_agency, 'A booking agent') || ' wants to link with your band as its booking agent.',
      '/band/settings#booking-agent');
  end loop;

  return v_id;
exception
  when unique_violation then
    raise exception 'This band already has an open invite or link' using errcode = '23505';
end;
$$;

-- Withdraw an invite, or end an active link, from the agent side.
create or replace function public.booker_link_cancel(p_link_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_booker uuid := public.booker_current_id();
  v_link   public.booker_links%rowtype;
begin
  select * into v_link from public.booker_links
   where id = p_link_id and booker_id = v_booker
   for update;
  if not found or v_link.status not in ('invited', 'active') then
    raise exception 'Link not found' using errcode = 'P0002';
  end if;

  update public.booker_links
     set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
   where id = p_link_id;

  update public.booker_proposals
     set status = 'withdrawn', decided_at = now(), decided_by = auth.uid(), decision_note = 'Link ended'
   where link_id = p_link_id and status = 'pending';
end;
$$;

-- Set what the band sees on shows sent to it.
create or replace function public.booker_link_set_sharing(
  p_link_id uuid, p_times boolean, p_deal boolean, p_deal_notes boolean, p_commission boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  update public.booker_links
     set share_times      = coalesce(p_times, share_times),
         share_deal       = coalesce(p_deal, share_deal),
         share_deal_notes = coalesce(p_deal_notes, share_deal_notes),
         share_commission = coalesce(p_commission, share_commission)
   where id = p_link_id
     and booker_id = public.booker_current_id()
     and status in ('invited', 'active');
  if not found then
    raise exception 'Link not found' using errcode = 'P0002';
  end if;
end;
$$;

-- The linked band's own calendar for a date range (read-in). Dates, status
-- and venue only — never the band's money or notes. Max 400 days per call.
create or replace function public.booker_band_calendar(p_roster_id uuid, p_from date, p_to date)
returns table (show_date date, status text, venue_name text, venue_city text, venue_state text, from_agent boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_booker uuid := public.booker_current_id();
  v_link   uuid;
  v_act    uuid;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Choose a date range of up to 400 days' using errcode = '22023';
  end if;
  select l.id, l.act_id into v_link, v_act
    from public.booker_links l
   where l.roster_id = p_roster_id and l.booker_id = v_booker and l.status = 'active';
  if v_act is null then
    return; -- not linked (or link revoked): nothing to read
  end if;

  return query
    select b.show_date,
           b.status::text,
           v.name,
           v.city,
           v.state,
           exists (select 1 from public.booker_proposals pr
                    where pr.link_id = v_link and pr.resulting_booking_id = b.id)
      from public.bookings b
      left join public.venues v on v.id = b.venue_id
     where b.act_id = v_act
       and b.show_date between p_from and p_to
       and coalesce(b.entry_type, 'show') = 'show'
       and b.status::text not in ('pitch', 'followup', 'cancelled')
     order by b.show_date;
end;
$$;

-- Send a confirmed show to the linked band. Builds the payload from the
-- link's sharing settings, so unshared fields are never stored in it.
-- Rate limited to 100 proposals per agent per day.
create or replace function public.booker_proposal_send(p_show_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_booker  uuid := public.booker_current_id();
  v_show    public.booker_shows%rowtype;
  v_link    public.booker_links%rowtype;
  v_venue   public.booker_venues%rowtype;
  v_band    text;
  v_pct     numeric;
  v_agency  text;
  v_payload jsonb;
  v_id      uuid;
  v_admin   uuid;
begin
  if v_booker is null then
    raise exception 'Only a Booking Agent can send shows' using errcode = '42501';
  end if;

  select * into v_show from public.booker_shows
   where id = p_show_id and booker_id = v_booker and deleted_at is null;
  if not found then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;
  if v_show.status <> 'confirmed' then
    raise exception 'Only confirmed shows can be sent to the band' using errcode = '22023';
  end if;
  if v_show.show_date < current_date then
    raise exception 'This show date has passed' using errcode = '22023';
  end if;

  select * into v_link from public.booker_links
   where roster_id = v_show.roster_id and booker_id = v_booker and status = 'active';
  if not found then
    raise exception 'This band is not linked to your workspace yet' using errcode = '22023';
  end if;

  if (select count(*) from public.booker_proposals p
       where p.booker_id = v_booker and p.created_at > now() - interval '1 day') >= 100 then
    raise exception 'Daily limit reached for sending shows. Try again tomorrow.' using errcode = '54000';
  end if;

  if v_show.venue_id is not null then
    select * into v_venue from public.booker_venues where id = v_show.venue_id and booker_id = v_booker;
  end if;
  select r.band_name, coalesce(v_show.commission_pct_override, r.commission_pct)
    into v_band, v_pct
    from public.booker_roster r where r.id = v_show.roster_id;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'show_date',      v_show.show_date,
    'venue_name',     coalesce(v_venue.name, v_show.venue_name),
    'venue_city',     coalesce(v_venue.city, v_show.venue_city),
    'venue_state',    v_venue.state,
    'venue_address',  v_venue.address,
    'venue_website',  v_venue.website,
    'venue_capacity', v_venue.capacity,
    'load_in_time',   case when v_link.share_times then v_show.load_in_time end,
    'door_time',      case when v_link.share_times then v_show.door_time end,
    'set_time',       case when v_link.share_times then v_show.set_time end,
    'set_length_min', case when v_link.share_times then v_show.set_length_min end,
    'deal_type',      case when v_link.share_deal then v_show.deal_type end,
    'fee',            case when v_link.share_deal then v_show.fee end,
    'deal_notes',     case when v_link.share_deal_notes then v_show.deal_notes end,
    'commission_pct', case when v_link.share_commission then v_pct end,
    'commission_amount', case when v_link.share_commission and v_show.fee is not null and v_pct is not null
                              then round(v_show.fee * v_pct / 100, 2) end
  ));

  insert into public.booker_proposals (booker_id, link_id, show_id, payload)
  values (v_booker, v_link.id, v_show.id, v_payload)
  returning id into v_id;

  select bp.agency_name into v_agency from public.booker_profiles bp where bp.id = v_booker;
  for v_admin in
    select p.id from public.profiles p
     where p.act_id = v_link.act_id and p.role in ('band_admin', 'superadmin')
  loop
    perform public.booker_notify(v_admin, v_link.act_id, 'Show from your agent',
      coalesce(v_agency, 'Your booking agent') || ' sent a confirmed show: '
        || coalesce(v_venue.name, v_show.venue_name, 'venue') || ' on ' || to_char(v_show.show_date, 'Mon DD, YYYY') || '.',
      '/band#agent-requests');
  end loop;

  return v_id;
exception
  when unique_violation then
    raise exception 'This show is already waiting on the band' using errcode = '23505';
end;
$$;

-- Take back a proposal the band has not answered yet.
create or replace function public.booker_proposal_withdraw(p_proposal_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  update public.booker_proposals
     set status = 'withdrawn', decided_at = now(), decided_by = auth.uid()
   where id = p_proposal_id
     and booker_id = public.booker_current_id()
     and status = 'pending';
  if not found then
    raise exception 'Nothing to withdraw: the band may have already answered' using errcode = 'P0002';
  end if;
end;
$$;

-- ── 6. Band side (Band Admin of the linked act only) ─────────────────────────

-- The caller's band's agent links, plus invites sent to the caller's email.
create or replace function public.booker_my_band_links()
returns table (
  link_id uuid, status text, agency_name text, agent_name text, agent_email text, agent_phone text,
  invited_at timestamptz, accepted_at timestamptz,
  share_times boolean, share_deal boolean, share_deal_notes boolean, share_commission boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_act   uuid := public.booker_caller_band_act();
  v_email text := public.booker_caller_email();
begin
  if v_act is null then
    return;
  end if;
  return query
    select l.id, l.status, bp.agency_name, bp.contact_name, bp.contact_email, bp.contact_phone,
           l.invited_at, l.accepted_at,
           l.share_times, l.share_deal, l.share_deal_notes, l.share_commission
      from public.booker_links l
      join public.booker_profiles bp on bp.id = l.booker_id
     where (l.act_id = v_act and l.status in ('active', 'revoked'))
        or (l.status = 'invited' and lower(l.invited_email) = v_email)
     order by (l.status = 'invited') desc, (l.status = 'active') desc, coalesce(l.accepted_at, l.invited_at) desc
     limit 20;
end;
$$;

-- Accept or decline an agent's invite.
create or replace function public.booker_link_respond(p_link_id uuid, p_accept boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_act   uuid := public.booker_caller_band_act();
  v_email text := public.booker_caller_email();
  v_link  public.booker_links%rowtype;
  v_agent uuid;
  v_name  text;
begin
  if v_act is null then
    raise exception 'Only a Band Admin can answer an agent invite' using errcode = '42501';
  end if;
  select * into v_link from public.booker_links
   where id = p_link_id and status = 'invited' and lower(invited_email) = v_email
   for update;
  if not found then
    raise exception 'Invite not found or already answered' using errcode = 'P0002';
  end if;

  if p_accept then
    if exists (select 1 from public.booker_links where act_id = v_act and status = 'active') then
      raise exception 'Your band already has a booking agent. End that link first.' using errcode = '23505';
    end if;
    update public.booker_links
       set status = 'active', act_id = v_act, accepted_at = now(), accepted_by = auth.uid()
     where id = p_link_id;
  else
    update public.booker_links set status = 'declined', declined_at = now() where id = p_link_id;
  end if;

  select bp.user_id into v_agent from public.booker_profiles bp where bp.id = v_link.booker_id;
  select a.act_name into v_name from public.acts a where a.id = v_act;
  perform public.booker_notify(v_agent, null,
    case when p_accept then 'Band linked' else 'Invite declined' end,
    coalesce(v_name, 'The band') || case when p_accept then ' accepted your invite. You can now send them confirmed shows.'
                                         else ' declined your invite.' end,
    '/agent/bands/' || v_link.roster_id);
end;
$$;

-- End the link from the band side. Takes effect immediately.
create or replace function public.booker_link_revoke(p_link_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_act   uuid := public.booker_caller_band_act();
  v_link  public.booker_links%rowtype;
  v_agent uuid;
begin
  if v_act is null then
    raise exception 'Only a Band Admin can end an agent link' using errcode = '42501';
  end if;
  select * into v_link from public.booker_links
   where id = p_link_id and act_id = v_act and status = 'active'
   for update;
  if not found then
    raise exception 'Link not found' using errcode = 'P0002';
  end if;

  update public.booker_links
     set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
   where id = p_link_id;
  update public.booker_proposals
     set status = 'withdrawn', decided_at = now(), decided_by = auth.uid(), decision_note = 'Band ended the link'
   where link_id = p_link_id and status = 'pending';

  select bp.user_id into v_agent from public.booker_profiles bp where bp.id = v_link.booker_id;
  perform public.booker_notify(v_agent, null, 'Band link ended',
    coalesce((select act_name from public.acts where id = v_act), 'A band') || ' ended the link with your workspace.',
    '/agent/bands/' || v_link.roster_id);
end;
$$;

-- Shows the agent sent to the caller's band. conflict = the band already has a
-- live show that date, so the proposal can't be accepted until resolved.
create or replace function public.booker_my_band_proposals()
returns table (
  proposal_id uuid, status text, payload jsonb, agency_name text, created_at timestamptz,
  decided_at timestamptz, decision_note text, resulting_booking_id uuid, conflict boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_act uuid := public.booker_caller_band_act();
begin
  if v_act is null then
    return;
  end if;
  return query
    select pr.id, pr.status, pr.payload, bp.agency_name, pr.created_at, pr.decided_at, pr.decision_note,
           pr.resulting_booking_id,
           (pr.status = 'pending' and exists (
              select 1 from public.bookings b
               where b.act_id = v_act
                 and b.show_date = (pr.payload->>'show_date')::date
                 and coalesce(b.entry_type, 'show') = 'show'
                 and b.status::text not in ('pitch', 'followup', 'cancelled')))
      from public.booker_proposals pr
      join public.booker_links l on l.id = pr.link_id
      join public.booker_profiles bp on bp.id = pr.booker_id
     where l.act_id = v_act
       and (pr.status = 'pending' or pr.decided_at > now() - interval '30 days')
     order by (pr.status = 'pending') desc, (pr.payload->>'show_date')::date;
end;
$$;

-- Accept: create the booking on the band's calendar as the Band Admin.
-- Idempotent: the proposal row is locked and must still be pending, so a
-- double click cannot create two bookings. Re-checks the link and the date.
create or replace function public.booker_proposal_accept(p_proposal_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_act     uuid := public.booker_caller_band_act();
  v_pr      public.booker_proposals%rowtype;
  v_link    public.booker_links%rowtype;
  v_p       jsonb;
  v_date    date;
  v_name    text;
  v_city    text;
  v_state   text;
  v_venue   uuid;
  v_booking uuid;
  v_deal    text;
  v_fee     numeric;
  v_notes   text;
  v_agent   uuid;
begin
  if v_act is null then
    raise exception 'Only a Band Admin can accept shows from an agent' using errcode = '42501';
  end if;

  select * into v_pr from public.booker_proposals where id = p_proposal_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  select * into v_link from public.booker_links where id = v_pr.link_id;
  if v_link.act_id is distinct from v_act then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_pr.status = 'accepted' then
    return v_pr.resulting_booking_id; -- already done: same answer, no second booking
  end if;
  if v_pr.status <> 'pending' then
    raise exception 'This request was already answered or withdrawn' using errcode = '22023';
  end if;
  if v_link.status <> 'active' then
    raise exception 'The agent link has ended' using errcode = '22023';
  end if;

  v_p     := v_pr.payload;
  v_date  := (v_p->>'show_date')::date;
  v_name  := nullif(btrim(v_p->>'venue_name'), '');
  v_city  := coalesce(nullif(btrim(v_p->>'venue_city'), ''), '');
  v_state := coalesce(nullif(btrim(v_p->>'venue_state'), ''), '');

  if exists (select 1 from public.bookings b
              where b.act_id = v_act and b.show_date = v_date
                and coalesce(b.entry_type, 'show') = 'show'
                and b.status::text not in ('pitch', 'followup', 'cancelled')) then
    raise exception 'Your band already has a show on this date. Resolve it before accepting.' using errcode = '23P01';
  end if;

  -- Use the band's own venue when it already has one by that name in that town.
  if v_name is not null then
    select v.id into v_venue from public.venues v
     where v.act_id = v_act and lower(v.name) = lower(v_name) and lower(coalesce(v.city, '')) = lower(v_city)
     order by v.created_at limit 1;
    if v_venue is null then
      insert into public.venues (name, city, state, address, website, capacity, act_id, created_by, source)
      values (v_name, v_city, v_state, v_p->>'venue_address', v_p->>'venue_website',
              (v_p->>'venue_capacity')::integer, v_act, auth.uid(), 'booking_agent')
      returning id into v_venue;
    end if;
  end if;

  v_deal := case v_p->>'deal_type'
              when 'guarantee' then 'guarantee'
              when 'guarantee_plus' then 'guarantee'
              when 'door' then 'door_split'
              when 'percentage' then 'percentage'
              when 'other' then 'other'
            end;
  v_fee := (v_p->>'fee')::numeric;
  v_notes := concat_ws(E'\n',
    case when v_p ? 'deal_notes' then v_p->>'deal_notes' end,
    case when v_p->>'deal_type' = 'guarantee_plus' then 'Guarantee plus a percentage (per your agent).' end,
    case when v_p ? 'commission_pct' then 'Agent commission: ' || (v_p->>'commission_pct') || '%'
         || coalesce(' ($' || (v_p->>'commission_amount') || ')', '') end);

  insert into public.bookings (
    created_by, confirmed_by, act_id, venue_id, status, show_date,
    load_in_time, door_time, set_time, set_length_min,
    deal_type, fee, agreed_amount, deal_notes, source, entry_type)
  values (
    auth.uid(), auth.uid(), v_act, v_venue, 'confirmed', v_date,
    (v_p->>'load_in_time')::time, (v_p->>'door_time')::time, (v_p->>'set_time')::time, (v_p->>'set_length_min')::integer,
    v_deal, v_fee, v_fee, nullif(v_notes, ''), 'booking_agent', 'show')
  returning id into v_booking;

  update public.booker_proposals
     set status = 'accepted', decided_by = auth.uid(), decided_at = now(), resulting_booking_id = v_booking
   where id = p_proposal_id;

  select bp.user_id into v_agent from public.booker_profiles bp where bp.id = v_pr.booker_id;
  perform public.booker_notify(v_agent, null, 'Show accepted',
    coalesce((select act_name from public.acts where id = v_act), 'The band') || ' added '
      || coalesce(v_name, 'the show') || ' on ' || to_char(v_date, 'Mon DD, YYYY') || ' to their calendar.',
    '/agent/shows');

  return v_booking;
end;
$$;

-- Decline, with an optional note the agent sees.
create or replace function public.booker_proposal_decline(p_proposal_id uuid, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_act   uuid := public.booker_caller_band_act();
  v_pr    public.booker_proposals%rowtype;
  v_agent uuid;
begin
  if v_act is null then
    raise exception 'Only a Band Admin can decline shows from an agent' using errcode = '42501';
  end if;
  select pr.* into v_pr from public.booker_proposals pr
    join public.booker_links l on l.id = pr.link_id
   where pr.id = p_proposal_id and l.act_id = v_act and pr.status = 'pending'
   for update of pr;
  if not found then
    raise exception 'Request not found or already answered' using errcode = 'P0002';
  end if;

  update public.booker_proposals
     set status = 'declined', decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(left(btrim(coalesce(p_note, '')), 500), '')
   where id = p_proposal_id;

  select bp.user_id into v_agent from public.booker_profiles bp where bp.id = v_pr.booker_id;
  perform public.booker_notify(v_agent, null, 'Show declined',
    coalesce((select act_name from public.acts where id = v_act), 'The band') || ' declined '
      || coalesce(v_pr.payload->>'venue_name', 'a show') || ' on ' || (v_pr.payload->>'show_date') || '.',
    '/agent/shows');
end;
$$;

-- ── 7. Function privileges: signed-in users only ─────────────────────────────
revoke all on function public.booker_link_invite(uuid, text)                          from public, anon;
revoke all on function public.booker_link_cancel(uuid)                                from public, anon;
revoke all on function public.booker_link_set_sharing(uuid, boolean, boolean, boolean, boolean) from public, anon;
revoke all on function public.booker_band_calendar(uuid, date, date)                  from public, anon;
revoke all on function public.booker_proposal_send(uuid)                              from public, anon;
revoke all on function public.booker_proposal_withdraw(uuid)                          from public, anon;
revoke all on function public.booker_my_band_links()                                  from public, anon;
revoke all on function public.booker_link_respond(uuid, boolean)                      from public, anon;
revoke all on function public.booker_link_revoke(uuid)                                from public, anon;
revoke all on function public.booker_my_band_proposals()                              from public, anon;
revoke all on function public.booker_proposal_accept(uuid)                            from public, anon;
revoke all on function public.booker_proposal_decline(uuid, text)                     from public, anon;

grant execute on function public.booker_link_invite(uuid, text)                          to authenticated;
grant execute on function public.booker_link_cancel(uuid)                                to authenticated;
grant execute on function public.booker_link_set_sharing(uuid, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.booker_band_calendar(uuid, date, date)                  to authenticated;
grant execute on function public.booker_proposal_send(uuid)                              to authenticated;
grant execute on function public.booker_proposal_withdraw(uuid)                          to authenticated;
grant execute on function public.booker_my_band_links()                                  to authenticated;
grant execute on function public.booker_link_respond(uuid, boolean)                      to authenticated;
grant execute on function public.booker_link_revoke(uuid)                                to authenticated;
grant execute on function public.booker_my_band_proposals()                              to authenticated;
grant execute on function public.booker_proposal_accept(uuid)                            to authenticated;
grant execute on function public.booker_proposal_decline(uuid, text)                     to authenticated;

commit;
