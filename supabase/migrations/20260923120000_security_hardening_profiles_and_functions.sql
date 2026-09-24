-- supabase/migrations/20260923120000_security_hardening_profiles_and_functions.sql
--
-- WHY: Audit of the live project (2026-09-23) found:
--   1. CRITICAL - any signed-in user can UPDATE their own profiles row with no column limits,
--      so they can set role = 'superadmin', switch act_id to another band, or mark their
--      subscription 'active' without paying. (RLS allows own-row update; column grants allow all.)
--   2. SECURITY DEFINER functions are callable by anonymous visitors through /rest/v1/rpc.
--   3. Nine functions have a mutable search_path (Supabase advisor 0011).
--
-- APPROACH: a guard trigger rather than column REVOKEs, so existing `select('*')`/`update()` calls
-- in the app keep working. Only end-user API roles (authenticated/anon) are restricted.
-- service_role (server routes, Stripe webhook), SECURITY DEFINER signup triggers, and migrations
-- run as other roles and pass through untouched. Superadmins may still change their own row.
--
-- ROLLBACK: drop trigger trg_guard_profile_privileged_columns on public.profiles;

-- 1. Profiles privilege-escalation guard -------------------------------------------------------
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security invoker            -- must be INVOKER so current_user reflects the real caller
set search_path = ''
as $$
begin
  -- Service role, definer functions (signup triggers), and migrations are trusted.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Superadmins keep full control of their own row.
  if exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'superadmin'
  ) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A user creating their own profile from the browser always starts unprivileged.
    new.role                   := 'member';
    new.act_id                 := null;
    new.subscription_status    := 'inactive';
    new.subscription_tier      := null;
    new.trial_ends_at          := null;
    new.stripe_customer_id     := null;
    new.stripe_subscription_id := null;
    new.admin_notes            := null;
    return new;
  end if;

  if new.id                     is distinct from old.id
     or new.role                   is distinct from old.role
     or new.act_id                 is distinct from old.act_id
     or new.subscription_status    is distinct from old.subscription_status
     or new.subscription_tier      is distinct from old.subscription_tier
     or new.trial_ends_at          is distinct from old.trial_ends_at
     or new.stripe_customer_id     is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.admin_notes            is distinct from old.admin_notes
  then
    raise exception 'Not allowed to change protected profile fields'
      using errcode = '42501',
            hint    = 'Role, band, and subscription changes must go through a server route using the service role.';
  end if;

  return new;
end;
$$;

comment on function public.guard_profile_privileged_columns() is
  'Blocks end users from escalating role, switching act, or altering billing fields on their own profile.';

drop trigger if exists trg_guard_profile_privileged_columns on public.profiles;
create trigger trg_guard_profile_privileged_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- 2. Lock down SECURITY DEFINER functions exposed via /rest/v1/rpc ------------------------------
-- Trigger functions never need EXECUTE for triggers to fire; nobody should call them directly.
revoke execute on function public.handle_new_user()           from public, anon, authenticated;
revoke execute on function public.handle_new_user_with_band() from public, anon, authenticated;
-- Signed-in users may still need these; anonymous visitors never do.
revoke execute on function public.can_search(uuid)            from public, anon;
revoke execute on function public.user_band_ids()             from public, anon;

-- 3. Pin search_path (advisor 0011). public + extensions keeps existing unqualified references working.
alter function public.update_smtp_settings_updated_at()     set search_path = public, extensions, pg_temp;
alter function public.update_updated_at()                   set search_path = public, extensions, pg_temp;
alter function public.can_search(uuid)                      set search_path = public, extensions, pg_temp;
alter function public.handle_new_user_with_band()           set search_path = public, extensions, pg_temp;
alter function public.user_band_ids()                       set search_path = public, extensions, pg_temp;
alter function public.update_calendar_settings_updated_at() set search_path = public, extensions, pg_temp;
alter function public.touch_updated_at()                    set search_path = public, extensions, pg_temp;
alter function public.update_updated_at_column()            set search_path = public, extensions, pg_temp;
alter function public.auto_complete_tours()                 set search_path = public, extensions, pg_temp;
