-- 20261022020000_booker_venue_tags.sql
-- Build list item 6 (search & phone), database part: tags on the agent's
-- venues so the venue book can be filtered ("dance hall", "all ages",
-- "pays door", "red dirt", ...).
--
--   booker_venues.tags   text[], never null, default '{}'
--                        at most 20 tags, each 1–40 characters, stored
--                        lower-case and trimmed, no blanks, nulls or repeats
--
-- Additive only: one column with a default on the agent's own table. RLS on
-- booker_venues already limits rows to the owning agent and the existing
-- table grant (select, insert, update to authenticated) covers the column.
-- Bands never see booker_venues, so tags stay private to the agent.
--
-- The rules live in an immutable helper so the check can look at every
-- element; the browser also normalises tags before saving, and the check is
-- the backstop.
--
-- Apply manually after review. Never auto-run. Rollback:
--   supabase/migrations/rollback/20261022020000_booker_venue_tags.down.sql

begin;

create or replace function public.booker_tags_ok(tags text[])
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select tags is not null
     and cardinality(tags) <= 20
     and array_position(tags, null) is null
     and coalesce((
       select bool_and(char_length(t) between 1 and 40 and t = lower(btrim(t)))
          and count(distinct t) = count(*)
       from unnest(tags) as t
     ), true)
$$;

comment on function public.booker_tags_ok(text[]) is
  'Check helper for booker_venues.tags: <= 20 tags, each 1-40 chars, lower-case, trimmed, unique, no nulls';

revoke all on function public.booker_tags_ok(text[]) from public;
grant execute on function public.booker_tags_ok(text[]) to authenticated, service_role;

alter table public.booker_venues
  add column if not exists tags text[] not null default '{}';

alter table public.booker_venues
  add constraint booker_venues_tags_ck check (public.booker_tags_ok(tags));

comment on column public.booker_venues.tags is
  'The agent''s own labels for the venue (lower-case, unique, up to 20); private to the agent';

commit;
