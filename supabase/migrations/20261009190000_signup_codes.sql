-- supabase/migrations/20261009190000_signup_codes.sql
-- Signup codes: a code entered at registration grants a longer free Band Admin
-- period (the founding beta uses BETACRB26: 365 days, first 10 redemptions).
--
-- * Both tables are service-role only (RLS on, no policies, no anon/authenticated
--   privileges), so codes and who redeemed them are never readable from the browser.
-- * The use cap is enforced in the database: redeem_signup_code() locks the code
--   row, so two simultaneous sign-ups cannot both take the last slot.
-- * Replaces the short-lived beta_applications table from an earlier draft. That
--   table is dropped only if it exists and is empty.
-- Apply manually after review. Never auto-run. Rollback:
--   supabase/migrations/rollback/20261009190000_signup_codes.down.sql

begin;

do $$
begin
  if to_regclass('public.beta_applications') is not null then
    if exists (select 1 from public.beta_applications limit 1) then
      raise exception 'beta_applications has rows; export or delete them before applying this migration.';
    end if;
    drop function if exists public.approve_beta_application(uuid, uuid, integer);
    drop table public.beta_applications;
  end if;
end $$;

create table public.signup_codes (
  id         uuid        primary key default gen_random_uuid(),
  code       text        not null unique
               check (code ~ '^[A-Z0-9_-]{4,40}$'),
  label      text        not null check (char_length(btrim(label)) between 1 and 120),
  grant_days integer     not null check (grant_days between 1 and 1095),
  max_uses   integer     not null check (max_uses >= 1),
  uses       integer     not null default 0,
  is_active  boolean     not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signup_codes_uses_ck check (uses >= 0 and uses <= max_uses)
);

create table public.signup_code_redemptions (
  id          uuid        primary key default gen_random_uuid(),
  code_id     uuid        not null references public.signup_codes(id) on delete restrict on update cascade,
  profile_id  uuid        not null references public.profiles(id)     on delete cascade  on update cascade,
  redeemed_at timestamptz not null default now(),
  trial_ends_at timestamptz not null,
  -- One code redemption per account, ever.
  constraint uq_signup_code_redemptions_profile unique (profile_id)
);
create index idx_signup_code_redemptions_code on public.signup_code_redemptions (code_id, redeemed_at desc);

create trigger trg_signup_codes_updated
  before update on public.signup_codes
  for each row execute function public.touch_updated_at();

alter table public.signup_codes            enable row level security;
alter table public.signup_code_redemptions enable row level security;
revoke all on public.signup_codes            from anon, authenticated;
revoke all on public.signup_code_redemptions from anon, authenticated;

-- Redeems a code for one profile. Returns the new trial end and use counts.
-- Raises (message is the error code):
--   code_unknown      no such code
--   code_unavailable  inactive, expired or all uses taken
--   already_redeemed  this account has used a code before
--   not_eligible      profile is missing, not a band admin, or already paying
create or replace function public.redeem_signup_code(p_code text, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code    public.signup_codes%rowtype;
  v_profile public.profiles%rowtype;
  v_end     timestamptz;
begin
  select * into v_code
    from public.signup_codes
   where code = upper(btrim(coalesce(p_code, '')))
   for update;
  if not found then
    raise exception 'code_unknown';
  end if;

  if not v_code.is_active
     or (v_code.expires_at is not null and v_code.expires_at <= now())
     or v_code.uses >= v_code.max_uses then
    raise exception 'code_unavailable';
  end if;

  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found
     or v_profile.role <> 'band_admin'
     or coalesce(v_profile.subscription_status, '') in ('active', 'past_due') then
    raise exception 'not_eligible';
  end if;

  if exists (select 1 from public.signup_code_redemptions where profile_id = p_profile_id) then
    raise exception 'already_redeemed';
  end if;

  -- A year from today, replacing (not stacking on) the standard trial.
  v_end := greatest(coalesce(v_profile.trial_ends_at, now()), now() + make_interval(days => v_code.grant_days));

  insert into public.signup_code_redemptions (code_id, profile_id, trial_ends_at)
  values (v_code.id, p_profile_id, v_end);

  update public.signup_codes set uses = uses + 1 where id = v_code.id;

  update public.profiles
     set trial_ends_at = v_end, subscription_status = 'trialing'
   where id = p_profile_id;

  return jsonb_build_object(
    'code_id',       v_code.id,
    'label',         v_code.label,
    'uses',          v_code.uses + 1,
    'max_uses',      v_code.max_uses,
    'trial_ends_at', v_end
  );
end;
$$;

revoke all on function public.redeem_signup_code(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_signup_code(text, uuid) to service_role;

insert into public.signup_codes (code, label, grant_days, max_uses)
values ('BETACRB26', 'Founding beta', 365, 10)
on conflict (code) do nothing;

commit;
