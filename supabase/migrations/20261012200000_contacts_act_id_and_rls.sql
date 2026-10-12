-- supabase/migrations/20261012200000_contacts_act_id_and_rls.sql
--
-- Security fix: each band can only see and change its own venue contacts.
-- Depends on 20261012180000_venues_rls_tenant_isolation.sql (helper functions).
--
-- Before (verified on production 2026-10-12):
--   * contacts had one policy, contacts_access: FOR ALL USING (auth.uid() IS NOT NULL).
--     Every signed-in user, Members included, could read, edit and delete every
--     band's contacts.
--   * contacts had no act_id column, yet three save paths already send one
--     (venue page "Add contact", website scan, spreadsheet venue import). Those
--     inserts were rejected by the API (a 400 seen in the logs on 2026-10-12),
--     so contacts added that way were silently never saved.
--
-- After:
--   * contacts.act_id NOT NULL, backfilled from the contact's venue.
--   * A trigger fills act_id from the venue when a caller doesn't send it (the AI
--     agent's path and the mobile app), and rejects a contact whose act_id does
--     not match its venue's band. It reads the venue's true band (SECURITY
--     DEFINER), so a caller cannot attach a contact to another band's venue.
--   * Policies mirror venues: read = superadmin or anyone in the band;
--     write = superadmin or that band's band_admin.
--
-- Production at authoring time: 21 contacts, all linked to a venue, all one band.
--
-- Rollback: supabase/migrations/rollback/20261012200000_contacts_act_id_and_rls.down.sql

begin;

-- Fail fast if the venue helpers from the previous migration are missing.
do $$
begin
  if to_regprocedure('public.app_current_act_id()') is null
     or to_regprocedure('public.app_current_role()') is null
     or to_regprocedure('public.app_is_superadmin()') is null then
    raise exception 'apply 20261012180000_venues_rls_tenant_isolation.sql first';
  end if;
end $$;

-- ─── 1. Column + backfill ─────────────────────────────────────────────────────

alter table public.contacts add column if not exists act_id uuid;

update public.contacts c
set act_id = v.act_id
from public.venues v
where v.id = c.venue_id
  and c.act_id is null;

-- Refuse to orphan data: every contact must have a band after the backfill.
do $$
declare
  missing int;
begin
  select count(*) into missing from public.contacts where act_id is null;
  if missing > 0 then
    raise exception 'contacts backfill incomplete: % rows have no band (no venue, or venue has no band); resolve manually first', missing;
  end if;
end $$;

alter table public.contacts alter column act_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_act_id_fkey') then
    alter table public.contacts
      add constraint contacts_act_id_fkey foreign key (act_id) references public.acts(id) on delete cascade;
  end if;
end $$;

create index if not exists idx_contacts_act_id   on public.contacts (act_id);
create index if not exists idx_contacts_venue_id on public.contacts (venue_id);

-- ─── 2. Keep act_id correct on every write ────────────────────────────────────

create or replace function public.contacts_set_act_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  venue_act uuid;
begin
  if new.venue_id is not null then
    -- SECURITY DEFINER: read the venue's real band even when the caller's RLS
    -- cannot see that venue, so a foreign venue is detected, not ignored.
    select act_id into venue_act from public.venues where id = new.venue_id;

    if new.act_id is null then
      new.act_id := venue_act;
    elsif venue_act is not null and new.act_id <> venue_act then
      raise exception 'contact band does not match its venue''s band'
        using errcode = '23514';
    end if;
  end if;

  -- No venue: fall back to the caller's own band. Service-role callers have no
  -- band, so they must send act_id explicitly (NOT NULL rejects otherwise).
  if new.act_id is null then
    new.act_id := public.app_current_act_id();
  end if;

  return new;
end
$$;

revoke all on function public.contacts_set_act_id() from public, anon, authenticated;

drop trigger if exists trg_contacts_set_act_id on public.contacts;
create trigger trg_contacts_set_act_id
  before insert or update of venue_id, act_id on public.contacts
  for each row execute function public.contacts_set_act_id();

-- ─── 3. Policies ──────────────────────────────────────────────────────────────

drop policy if exists contacts_access on public.contacts;
drop policy if exists contacts_select on public.contacts;
drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;
drop policy if exists contacts_delete on public.contacts;

create policy contacts_select on public.contacts
  for select to authenticated
  using (
    (select public.app_is_superadmin())
    or act_id = (select public.app_current_act_id())
  );

create policy contacts_insert on public.contacts
  for insert to authenticated
  with check (
    (select public.app_is_superadmin())
    or ( act_id = (select public.app_current_act_id())
         and (select public.app_current_role()) = 'band_admin' )
  );

create policy contacts_update on public.contacts
  for update to authenticated
  using (
    (select public.app_is_superadmin())
    or ( act_id = (select public.app_current_act_id())
         and (select public.app_current_role()) = 'band_admin' )
  )
  with check (
    (select public.app_is_superadmin())
    or ( act_id = (select public.app_current_act_id())
         and (select public.app_current_role()) = 'band_admin' )
  );

create policy contacts_delete on public.contacts
  for delete to authenticated
  using (
    (select public.app_is_superadmin())
    or ( act_id = (select public.app_current_act_id())
         and (select public.app_current_role()) = 'band_admin' )
  );

commit;
