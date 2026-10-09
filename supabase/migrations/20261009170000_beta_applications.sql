-- supabase/migrations/20261009120000_beta_applications.sql
-- Founding beta program: public applications for a free year of Band Admin.
--
-- * Applications are written and read ONLY through service-role API routes
--   (/api/public/beta-apply, /api/admin/beta-applications*). RLS is enabled
--   with no policies, and anon/authenticated have no table privileges, so the
--   public anon key can neither read applicant emails nor insert rows directly.
-- * The 10-band cap is enforced in the database by approve_beta_application(),
--   which takes a transaction-scoped advisory lock so two simultaneous
--   approvals cannot both pass the count check.
-- Apply manually after review. Never auto-run. Rollback:
--   supabase/migrations/rollback/20261009120000_beta_applications.down.sql

begin;

create table public.beta_applications (
  id                 uuid        primary key default gen_random_uuid(),
  applicant_name     text        not null check (char_length(btrim(applicant_name)) between 1 and 120),
  email              text        not null check (char_length(email) between 3 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  act_name           text        not null check (char_length(btrim(act_name)) between 1 and 160),
  genre              text        not null check (char_length(btrim(genre)) between 1 and 80),
  home_base          text        not null check (char_length(btrim(home_base)) between 1 and 120),
  shows_per_year     text        not null check (shows_per_year in ('under_25', '25_75', '75_plus')),
  booking_method     text        not null check (char_length(btrim(booking_method)) between 1 and 1000),
  website_url        text                 check (website_url is null or char_length(website_url) <= 300),
  agent_name         text                 check (agent_name  is null or char_length(agent_name)  <= 160),
  feedback_agreed    boolean     not null check (feedback_agreed),
  status             text        not null default 'pending'
                       check (status in ('pending', 'approved', 'declined')),
  reviewed_at        timestamptz,
  reviewed_by        uuid        references public.profiles(id) on delete set null on update cascade,
  -- Set once the free year has actually been applied to an account. An
  -- approved application with granted_at null means the band has not
  -- registered yet; registration applies the year and fills these in.
  granted_profile_id uuid        references public.profiles(id) on delete set null on update cascade,
  granted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint beta_applications_review_ck
    check ((status = 'pending') = (reviewed_at is null)),
  constraint beta_applications_grant_ck
    check (granted_at is null or status = 'approved')
);

-- One live application per email address (case-insensitive). A declined
-- applicant may apply again.
create unique index uq_beta_applications_active_email
  on public.beta_applications (lower(email))
  where status in ('pending', 'approved');

create index idx_beta_applications_status_created on public.beta_applications (status, created_at desc);
create index idx_beta_applications_reviewed_by    on public.beta_applications (reviewed_by);
create index idx_beta_applications_granted_prof   on public.beta_applications (granted_profile_id);

create trigger trg_beta_applications_updated
  before update on public.beta_applications
  for each row execute function public.touch_updated_at();

alter table public.beta_applications enable row level security;
revoke all on public.beta_applications from anon, authenticated;

-- Approves one pending application if the cap has not been reached.
-- Returns the number of approved applications after this call.
-- Raises 'beta_full' when the cap is already met and 'not_pending' when the
-- application does not exist or was already reviewed.
create or replace function public.approve_beta_application(
  p_application_id uuid,
  p_reviewer       uuid,
  p_cap            integer
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_approved integer;
  v_updated  integer;
begin
  if p_cap is null or p_cap < 1 then
    raise exception 'invalid_cap';
  end if;

  -- Serialise approvals: one lock key for the whole beta program.
  perform pg_advisory_xact_lock(hashtext('beta_applications_approve'));

  select count(*) into v_approved
    from public.beta_applications
   where status = 'approved';

  if v_approved >= p_cap then
    raise exception 'beta_full';
  end if;

  update public.beta_applications
     set status      = 'approved',
         reviewed_at = now(),
         reviewed_by = p_reviewer
   where id = p_application_id
     and status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'not_pending';
  end if;

  return v_approved + 1;
end;
$$;

revoke all on function public.approve_beta_application(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.approve_beta_application(uuid, uuid, integer) to service_role;

commit;
