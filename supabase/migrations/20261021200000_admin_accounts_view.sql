-- 20261021200000_admin_accounts_view.sql
-- A read-only, at-a-glance list of every login and what kind of account it is,
-- for Scott in the Supabase dashboard (Table Editor → schema "admin_views" →
-- "accounts"). The Authentication → Users page can't show custom columns, and
-- account type lives in app tables (profiles.role, profiles.act_id,
-- booker_profiles), so this view joins them.
--
-- Security:
--   * Lives in its own schema, admin_views, which is NOT in the API's exposed
--     schemas, and anon/authenticated get no USAGE on it and no SELECT on the
--     view. Only dashboard/postgres access can read it. It exposes emails, so it
--     must never move to public.
--   * Read-only: a plain view, no functions, nothing writes through it.
--   * No existing table, column, policy or function changes.
--
-- Apply manually after review. Rollback:
--   supabase/migrations/rollback/20261021200000_admin_accounts_view.down.sql

begin;

create schema if not exists admin_views;
revoke all on schema admin_views from public, anon, authenticated;

create or replace view admin_views.accounts as
select
  u.email,
  case
    when p.role = 'superadmin'                          then 'Superadmin'
    when bp.id is not null                              then 'Booking Agent'
    when p.role = 'band_admin' and p.act_id is not null then 'Band Admin'
    when p.role = 'member'                              then 'Band Member'
    when p.id is null                                   then 'No profile (signup not finished)'
    else 'Band Admin, no band yet'
  end                       as account_type,
  a.act_name                as band,
  bp.agency_name            as agency,
  p.role                    as profile_role,
  u.created_at              as signed_up,
  u.last_sign_in_at         as last_sign_in,
  u.id                      as user_id
from auth.users u
left join public.profiles p         on p.id = u.id
left join public.acts a             on a.id = p.act_id
left join public.booker_profiles bp on bp.user_id = u.id and bp.deleted_at is null;

comment on view admin_views.accounts is
  'Every login with its account type (Superadmin / Booking Agent / Band Admin / Band Member). Dashboard only: never expose this schema to the API.';

revoke all on admin_views.accounts from public, anon, authenticated;

commit;
