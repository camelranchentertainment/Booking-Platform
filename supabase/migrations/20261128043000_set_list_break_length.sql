-- 20261128043000_set_list_break_length.sql
--
-- Breaks in a set list get a length (e.g. a 15-minute set break) that counts
-- toward the set's running time.
--
-- * set_list_items.duration_sec: seconds, breaks only, 1 s – 4 h. Null = no
--   length set. Songs keep taking their length from public.songs.
-- * save_set_list_items(): stores duration_sec for break rows, ignores it on
--   songs and notes.
-- * publish_set_list(): a break's snapshot item carries its own duration_sec
--   (songs still carry the library length), so members and the phone app see it.
--
-- RLS unchanged: set_list_items policies already gate the whole row, and the
-- table-level grants cover the new column. Both functions stay SECURITY INVOKER.

begin;

alter table public.set_list_items
  add column if not exists duration_sec integer;

alter table public.set_list_items
  drop constraint if exists set_list_items_duration_check;
alter table public.set_list_items
  add constraint set_list_items_duration_check check (
    duration_sec is null
    or (item_type = 'break' and duration_sec between 1 and 14400)
  );

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
    (set_list_id, act_id, position, item_type, song_id, label, key_override, notes, duration_sec)
  select
    p_set_list_id,
    v_act,
    (e.ord - 1)::integer,
    e.val ->> 'item_type',
    nullif(e.val ->> 'song_id', '')::uuid,
    nullif(btrim(e.val ->> 'label'), ''),
    nullif(btrim(e.val ->> 'key_override'), ''),
    nullif(btrim(e.val ->> 'notes'), ''),
    -- Only breaks carry their own length; jsonb null or missing reads as null.
    case when e.val ->> 'item_type' = 'break'
      then nullif(e.val ->> 'duration_sec', '')::integer end
  from jsonb_array_elements(p_items) with ordinality as e(val, ord);

  -- Marks the list as "changes not pushed".
  update public.set_lists set updated_at = now() where id = p_set_list_id;
end
$$;

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
        'duration_sec', coalesce(so.duration_sec, i.duration_sec),
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
