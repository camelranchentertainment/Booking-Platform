-- supabase/migrations/rollback/20261012200000_contacts_act_id_and_rls.down.sql
--
-- Undoes 20261012200000_contacts_act_id_and_rls.sql.
--
-- WARNING: this restores contacts_access, which lets every signed-in user read,
-- edit and delete every band's contacts. It also drops contacts.act_id, so the
-- save paths that send act_id (venue page, website scan, venue import) start
-- failing again. Only run it to recover from a broken deploy.

begin;

drop policy if exists contacts_select on public.contacts;
drop policy if exists contacts_insert on public.contacts;
drop policy if exists contacts_update on public.contacts;
drop policy if exists contacts_delete on public.contacts;

-- Exact definition found on production 2026-10-12.
create policy contacts_access on public.contacts
  for all
  using (auth.uid() is not null);

drop trigger if exists trg_contacts_set_act_id on public.contacts;
drop function if exists public.contacts_set_act_id();

drop index if exists public.idx_contacts_venue_id;
drop index if exists public.idx_contacts_act_id;

alter table public.contacts drop constraint if exists contacts_act_id_fkey;
alter table public.contacts drop column if exists act_id;

commit;
