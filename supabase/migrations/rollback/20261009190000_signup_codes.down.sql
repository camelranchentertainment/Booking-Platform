-- supabase/migrations/rollback/20261009190000_signup_codes.down.sql
-- Reverses 20261009190000_signup_codes.sql.
-- Refuses to run once any code has been redeemed, so the record of who received
-- a free year is never lost by accident. Free years already granted live on
-- profiles.trial_ends_at and are untouched.

begin;

do $$
begin
  if exists (select 1 from public.signup_code_redemptions limit 1) then
    raise exception 'signup_code_redemptions has rows; export them before rolling back.';
  end if;
end $$;

drop function if exists public.redeem_signup_code(text, uuid);
drop table if exists public.signup_code_redemptions;
drop table if exists public.signup_codes;

commit;
