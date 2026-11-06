-- 20261106120000_setlists_guestlists.sql
--
-- Set List Builder + Guest Lists.
-- APPLIED to production by Scott in the Supabase SQL Editor on 2026-11-06 and
-- verified live (4 tables, RLS on, 9 policies, 4 functions, 7 triggers).
-- This file records exactly what ran, plus the explicit service_role grant the
-- repo requires (already present live via default privileges; re-running it is a no-op).
--
-- Who it affects: band admins (song library, set lists, guest list settings) and
-- members (read pushed set lists, manage their own guests on shows they play).
-- RLS: songs / set_list_items admin-only; set_lists admin + member read of pushed
-- snapshots; guest_list_entries admin + member own rows gated by
-- guest_list_member_can_edit(). Rollback: rollback/20261106120000_setlists_guestlists.down.sql

begin;

-- ---------------------------------------------------------------------
-- 0. Shared helpers
-- ---------------------------------------------------------------------

create or replace function public.crb_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- True when the caller is a band admin / superadmin of the given act.
create or replace function public.app_is_act_admin(p_act_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.act_id = p_act_id
      and p.role in ('band_admin', 'superadmin')
  );
$$;

revoke all on function public.app_is_act_admin(uuid) from public, anon;
grant execute on function public.app_is_act_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 1. Guest-list settings on bookings
-- ---------------------------------------------------------------------

alter table public.bookings
  add column if not exists guest_list_limit_per_member integer
    check (guest_list_limit_per_member is null or guest_list_limit_per_member between 0 and 50),
  add column if not exists guest_list_locked_at timestamptz;

comment on column public.bookings.guest_list_limit_per_member is
  'Max guest spots (guest + plus-ones) each member may add for this show. NULL = no limit. Admins are not limited.';
comment on column public.bookings.guest_list_locked_at is
  'When set, members can no longer add/edit/remove guests for this show.';

-- ---------------------------------------------------------------------
-- 2. Song library
-- ---------------------------------------------------------------------

create table public.songs (
  id           uuid primary key default gen_random_uuid(),
  act_id       uuid not null references public.acts(id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  artist       text check (artist is null or char_length(artist) <= 200),
  song_key     text check (song_key is null or char_length(song_key) <= 12),
  tempo_bpm    integer check (tempo_bpm is null or tempo_bpm between 20 and 400),
  duration_sec integer check (duration_sec is null or duration_sec between 1 and 3600),
  notes        text check (notes is null or char_length(notes) <= 2000),
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create unique index songs_act_title_artist_uniq
  on public.songs (act_id, lower(btrim(title)), coalesce(lower(btrim(artist)), ''))
  where deleted_at is null;
create index songs_act_idx on public.songs (act_id) where deleted_at is null;

create trigger songs_touch_updated_at
  before update on public.songs
  for each row execute function public.crb_touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. Set lists
-- ---------------------------------------------------------------------

create table public.set_lists (
  id                 uuid primary key default gen_random_uuid(),
  act_id             uuid not null references public.acts(id) on delete cascade,
  booking_id         uuid references public.bookings(id) on delete set null,
  name               text not null check (char_length(btrim(name)) between 1 and 200),
  is_template        boolean not null default false,
  notes              text check (notes is null or char_length(notes) <= 2000),
  published_snapshot jsonb,
  published_version  integer not null default 0 check (published_version >= 0),
  published_at       timestamptz,
  published_by       uuid references auth.users(id) on delete set null,
  created_by         uuid default auth.uid() references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint set_lists_template_has_no_show check (not (is_template and booking_id is not null))
);

-- One active set list per show.
create unique index set_lists_one_per_booking
  on public.set_lists (booking_id)
  where deleted_at is null and booking_id is not null;
create index set_lists_act_idx on public.set_lists (act_id) where deleted_at is null;

create or replace function public.set_lists_validate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.act_id <> old.act_id then
    raise exception 'A set list cannot be moved to another band' using errcode = '23514';
  end if;
  if new.booking_id is not null and not exists (
    select 1 from public.bookings b
    where b.id = new.booking_id and b.act_id = new.act_id
  ) then
    raise exception 'That show does not belong to this band' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger set_lists_validate
  before insert or update on public.set_lists
  for each row execute function public.set_lists_validate();

create trigger set_lists_touch_updated_at
  before update on public.set_lists
  for each row execute function public.crb_touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. Set list items (admin-only working copy)
-- ---------------------------------------------------------------------

create table public.set_list_items (
  id           uuid primary key default gen_random_uuid(),
  set_list_id  uuid not null references public.set_lists(id) on delete cascade,
  act_id       uuid not null references public.acts(id) on delete cascade,
  position     integer not null check (position >= 0),
  item_type    text not null check (item_type in ('song', 'break', 'note')),
  song_id      uuid references public.songs(id) on delete restrict,
  label        text check (label is null or char_length(label) <= 200),
  key_override text check (key_override is null or char_length(key_override) <= 12),
  notes        text check (notes is null or char_length(notes) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint set_list_items_position_uniq unique (set_list_id, position),
  constraint set_list_items_shape check (
    (item_type = 'song' and song_id is not null)
    or (item_type <> 'song' and song_id is null and label is not null)
  )
);

create index set_list_items_song_idx on public.set_list_items (song_id);
create index set_list_items_act_idx on public.set_list_items (act_id);

create or replace function public.set_list_items_validate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.set_lists s
    where s.id = new.set_list_id and s.act_id = new.act_id
  ) then
    raise exception 'Set list does not belong to this band' using errcode = '23514';
  end if;
  if new.song_id is not null and not exists (
    select 1 from public.songs so
    where so.id = new.song_id and so.act_id = new.act_id and so.deleted_at is null
  ) then
    raise exception 'That song is not in this band''s library' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger set_list_items_validate
  before insert or update on public.set_list_items
  for each row execute function public.set_list_items_validate();

create trigger set_list_items_touch_updated_at
  before update on public.set_list_items
  for each row execute function public.crb_touch_updated_at();

-- ---------------------------------------------------------------------
-- 5. Guest list entries
-- ---------------------------------------------------------------------

create table public.guest_list_entries (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  act_id       uuid not null references public.acts(id) on delete cascade,
  added_by     uuid default auth.uid() references auth.users(id) on delete set null,
  personnel_id uuid references public.act_personnel(id) on delete set null,
  guest_name   text not null check (char_length(btrim(guest_name)) between 1 and 120),
  plus_ones    integer not null default 0 check (plus_ones between 0 and 10),
  note         text check (note is null or char_length(note) <= 300),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index guest_list_entries_booking_idx on public.guest_list_entries (booking_id);
create index guest_list_entries_added_by_idx on public.guest_list_entries (added_by);
create index guest_list_entries_personnel_idx on public.guest_list_entries (personnel_id);
create index guest_list_entries_act_idx on public.guest_list_entries (act_id);

-- Can the calling member add/edit guests for this show right now?
create or replace function public.guest_list_member_can_edit(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bookings b
    join public.booking_personnel bp on bp.booking_id = b.id
    join public.act_personnel ap on ap.id = bp.personnel_id
    where b.id = p_booking_id
      and b.act_id = public.app_current_act_id()
      and b.status in ('confirmed', 'advancing')
      and b.guest_list_locked_at is null
      and b.show_date >= current_date - 1
      and ap.linked_user_id = auth.uid()
      and coalesce(bp.status, '') <> 'declined'
  );
$$;

revoke all on function public.guest_list_member_can_edit(uuid) from public, anon;
grant execute on function public.guest_list_member_can_edit(uuid) to authenticated;

create or replace function public.guest_list_entries_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin  boolean;
  v_limit     integer;
  v_used      integer;
  v_personnel uuid;
begin
  if tg_op = 'UPDATE' and (new.booking_id <> old.booking_id or new.act_id <> old.act_id) then
    raise exception 'A guest cannot be moved to another show' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.bookings b
    where b.id = new.booking_id and b.act_id = new.act_id
  ) then
    raise exception 'That show does not belong to this band' using errcode = '23514';
  end if;

  new.guest_name := btrim(new.guest_name);
  v_is_admin := public.app_is_act_admin(new.act_id);

  if v_is_admin then
    if tg_op = 'INSERT' and new.added_by is null then
      new.added_by := auth.uid();
    end if;
    if new.personnel_id is not null and not exists (
      select 1 from public.act_personnel ap
      where ap.id = new.personnel_id and ap.act_id = new.act_id
    ) then
      raise exception 'That roster member is not in this band' using errcode = '23514';
    end if;
    return new;
  end if;

  -- Members: entries are always theirs, tied to their own roster record.
  if tg_op = 'INSERT' then
    new.added_by := auth.uid();
  else
    new.added_by := old.added_by;
  end if;

  select ap.id into v_personnel
  from public.act_personnel ap
  where ap.act_id = new.act_id and ap.linked_user_id = auth.uid()
  order by ap.is_active desc, ap.created_at
  limit 1;
  new.personnel_id := v_personnel;

  select b.guest_list_limit_per_member into v_limit
  from public.bookings b where b.id = new.booking_id;

  if v_limit is not null then
    -- Serialize this member's writes for this show so quick double-adds can't exceed the limit.
    perform pg_advisory_xact_lock(hashtextextended(new.booking_id::text || ':' || auth.uid()::text, 0));

    select coalesce(sum(1 + g.plus_ones), 0) into v_used
    from public.guest_list_entries g
    where g.booking_id = new.booking_id
      and g.added_by = auth.uid()
      and g.id <> new.id;

    if v_used + 1 + new.plus_ones > v_limit then
      raise exception 'Guest list limit reached (% of % spots used)', v_used, v_limit
        using errcode = '23514', hint = 'guest_limit';
    end if;
  end if;

  return new;
end
$$;

create trigger guest_list_entries_before_write
  before insert or update on public.guest_list_entries
  for each row execute function public.guest_list_entries_before_write();

create trigger guest_list_entries_touch_updated_at
  before update on public.guest_list_entries
  for each row execute function public.crb_touch_updated_at();

-- ---------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------

alter table public.songs              enable row level security;
alter table public.set_lists          enable row level security;
alter table public.set_list_items     enable row level security;
alter table public.guest_list_entries enable row level security;

-- songs: admins only
create policy songs_admin_all on public.songs
  for all to authenticated
  using (public.app_is_act_admin(act_id))
  with check (public.app_is_act_admin(act_id));

-- set_lists: admins full; members read pushed lists for their band
create policy set_lists_admin_all on public.set_lists
  for all to authenticated
  using (public.app_is_act_admin(act_id))
  with check (public.app_is_act_admin(act_id));

create policy set_lists_member_read_published on public.set_lists
  for select to authenticated
  using (
    act_id = public.app_current_act_id()
    and published_snapshot is not null
    and deleted_at is null
  );

-- set_list_items: admins only (members read the snapshot instead)
create policy set_list_items_admin_all on public.set_list_items
  for all to authenticated
  using (public.app_is_act_admin(act_id))
  with check (public.app_is_act_admin(act_id));

-- guest_list_entries
create policy guest_admin_all on public.guest_list_entries
  for all to authenticated
  using (public.app_is_act_admin(act_id))
  with check (public.app_is_act_admin(act_id));

create policy guest_member_read_own on public.guest_list_entries
  for select to authenticated
  using (added_by = auth.uid() and act_id = public.app_current_act_id());

create policy guest_member_insert_own on public.guest_list_entries
  for insert to authenticated
  with check (
    act_id = public.app_current_act_id()
    and public.guest_list_member_can_edit(booking_id)
  );

create policy guest_member_update_own on public.guest_list_entries
  for update to authenticated
  using (added_by = auth.uid() and public.guest_list_member_can_edit(booking_id))
  with check (added_by = auth.uid() and public.guest_list_member_can_edit(booking_id));

create policy guest_member_delete_own on public.guest_list_entries
  for delete to authenticated
  using (added_by = auth.uid() and public.guest_list_member_can_edit(booking_id));

-- Table privileges: signed-in users only (RLS decides rows).
revoke all on public.songs, public.set_lists, public.set_list_items, public.guest_list_entries from anon;
grant select, insert, update, delete
  on public.songs, public.set_lists, public.set_list_items, public.guest_list_entries
  to authenticated;
grant all
  on public.songs, public.set_lists, public.set_list_items, public.guest_list_entries
  to service_role;

-- ---------------------------------------------------------------------
-- 7. App functions
-- ---------------------------------------------------------------------

-- Replace a set list's items in one transaction. p_items = ordered JSON array:
-- [{ "item_type": "song", "song_id": "...", "key_override": null, "notes": null },
--  { "item_type": "break", "label": "Break" }, ...]
create or replace function public.save_set_list_items(p_set_list_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_act uuid;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Items must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'A set list can have at most 200 items' using errcode = '22023';
  end if;

  -- Lock the parent row. Under RLS only the band's admins can lock it.
  select s.act_id into v_act
  from public.set_lists s
  where s.id = p_set_list_id and s.deleted_at is null
  for update;

  if v_act is null then
    raise exception 'Set list not found' using errcode = 'P0002';
  end if;

  delete from public.set_list_items where set_list_id = p_set_list_id;

  insert into public.set_list_items
    (set_list_id, act_id, position, item_type, song_id, label, key_override, notes)
  select
    p_set_list_id,
    v_act,
    (e.ord - 1)::integer,
    e.val ->> 'item_type',
    nullif(e.val ->> 'song_id', '')::uuid,
    nullif(btrim(e.val ->> 'label'), ''),
    nullif(btrim(e.val ->> 'key_override'), ''),
    nullif(btrim(e.val ->> 'notes'), '')
  from jsonb_array_elements(p_items) with ordinality as e(val, ord);

  -- Marks the list as "changes not pushed".
  update public.set_lists set updated_at = now() where id = p_set_list_id;
end
$$;

-- Freeze the current list into the snapshot members see.
-- Returns {set_list_id, version, published_at, changed}. changed=false means
-- nothing changed since the last push, so the caller must not notify anyone.
create or replace function public.publish_set_list(p_set_list_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.set_lists%rowtype;
  v_snapshot jsonb;
begin
  select * into r
  from public.set_lists
  where id = p_set_list_id and deleted_at is null
  for update;

  if not found then
    raise exception 'Set list not found' using errcode = 'P0002';
  end if;
  if not public.app_is_act_admin(r.act_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if r.published_at is not null and r.updated_at <= r.published_at then
    return jsonb_build_object(
      'set_list_id', r.id, 'version', r.published_version,
      'published_at', r.published_at, 'changed', false);
  end if;

  select jsonb_build_object(
    'name', r.name,
    'notes', r.notes,
    'version', r.published_version + 1,
    'items', coalesce(jsonb_agg(jsonb_build_object(
        'position', i.position,
        'type', i.item_type,
        'title', coalesce(so.title, i.label),
        'artist', so.artist,
        'key', coalesce(i.key_override, so.song_key),
        'bpm', so.tempo_bpm,
        'duration_sec', so.duration_sec,
        'song_notes', so.notes,
        'notes', i.notes
      ) order by i.position), '[]'::jsonb)
  )
  into v_snapshot
  from public.set_list_items i
  left join public.songs so on so.id = i.song_id
  where i.set_list_id = r.id;

  update public.set_lists
  set published_snapshot = v_snapshot,
      published_version  = r.published_version + 1,
      published_at       = now(),
      published_by       = auth.uid()
  where id = r.id
  returning * into r;

  return jsonb_build_object(
    'set_list_id', r.id, 'version', r.published_version,
    'published_at', r.published_at, 'changed', true);
end
$$;

revoke all on function public.save_set_list_items(uuid, jsonb) from public, anon;
revoke all on function public.publish_set_list(uuid) from public, anon;
grant execute on function public.save_set_list_items(uuid, jsonb) to authenticated;
grant execute on function public.publish_set_list(uuid) to authenticated;

commit;
