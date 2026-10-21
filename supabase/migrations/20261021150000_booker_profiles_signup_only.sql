-- 20261021150000_booker_profiles_signup_only.sql
-- Each login belongs to exactly one side of the platform: band (superadmin,
-- band admin, member) or Booking Agent. Agent workspaces are created only by
-- the agent sign-up (/api/booker/register), which uses the service role.
--
-- Until now any signed-in account could insert its own booker_profiles row,
-- so a band login could turn itself into an agent too. Dropping the INSERT
-- policy closes that at the database: with RLS on and no INSERT policy, the
-- browser can't create agent workspaces. Service-role sign-up is unaffected
-- (it bypasses RLS). SELECT and UPDATE of an agent's own row are unchanged.
--
-- Pre-check (read-only, 2026-10-21): no profile has both act_id and an active
-- booker_profiles row, so no existing account is affected.
begin;
drop policy if exists booker_profiles_insert_own on public.booker_profiles;
commit;
