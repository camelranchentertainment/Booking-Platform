-- supabase/migrations/rollback/20261010120000_booker_workspace_foundation.down.sql
-- Reverses 20261010120000_booker_workspace_foundation.sql.
-- Refuses to run once any agent has saved a show or a commission payment, so
-- booking and money history is never lost by accident. Export first if needed.
-- Touches only booker_ objects; nothing that existed before is affected.

begin;

do $$
begin
  if to_regclass('public.booker_shows') is not null
     and exists (select 1 from public.booker_shows limit 1) then
    raise exception 'booker_shows has rows; export them before rolling back.';
  end if;
  if to_regclass('public.booker_commission_payments') is not null
     and exists (select 1 from public.booker_commission_payments limit 1) then
    raise exception 'booker_commission_payments has rows; export them before rolling back.';
  end if;
end $$;

drop table if exists public.booker_commission_payments;
drop table if exists public.booker_shows;
drop table if exists public.booker_contacts;
drop table if exists public.booker_venues;
drop table if exists public.booker_roster;
drop function if exists public.booker_current_id();
drop table if exists public.booker_profiles;

commit;
