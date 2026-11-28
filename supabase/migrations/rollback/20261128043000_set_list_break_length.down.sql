-- rollback for 20261128043000_set_list_break_length.sql
-- Restores save_set_list_items() and publish_set_list() as defined in
-- 20261106120000_setlists_guestlists.sql, then drops the break length column.
-- Break lengths entered since the migration are lost.

begin;

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

alter table public.set_list_items drop constraint if exists set_list_items_duration_check;
alter table public.set_list_items drop column if exists duration_sec;

commit;
