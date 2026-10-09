-- supabase/migrations/rollback/20261009120000_beta_applications.down.sql
-- Reverses 20261009120000_beta_applications.sql.
-- Refuses to drop the table while it holds applications, so applicant data is
-- never lost by accident. Export the rows first if a rollback is truly needed.
-- Free years already granted live on profiles.trial_ends_at and are untouched.

begin;

do $$
begin
  if exists (select 1 from public.beta_applications limit 1) then
    raise exception 'beta_applications has rows; export them before rolling back.';
  end if;
end $$;

drop function if exists public.approve_beta_application(uuid, uuid, integer);
drop table if exists public.beta_applications;

commit;
