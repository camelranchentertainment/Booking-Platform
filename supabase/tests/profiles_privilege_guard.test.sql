-- supabase/tests/profiles_privilege_guard.test.sql
-- Proves a normal member cannot escalate privileges through their own profile row.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Fixture: one ordinary member (created as postgres, so the guard does not apply here).
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000001', 'member@test.local', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, email, role)
values ('00000000-0000-4000-8000-000000000001', 'member@test.local', 'member')
on conflict (id) do update set role = 'member', act_id = null;

-- Act as that member through the API role.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ update public.profiles set role = 'superadmin' where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'member cannot promote self to superadmin');

select throws_ok(
  $$ update public.profiles set role = 'band_admin' where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'member cannot promote self to band_admin');

select throws_ok(
  $$ update public.profiles set act_id = gen_random_uuid() where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'member cannot move self into another band');

select throws_ok(
  $$ update public.profiles set subscription_status = 'active' where id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'member cannot mark own subscription active');

select lives_ok(
  $$ update public.profiles set display_name = 'Test Member' where id = '00000000-0000-4000-8000-000000000001' $$,
  'member can still edit harmless fields like display_name');

reset role;

select ok(not has_function_privilege('anon', 'public.handle_new_user()', 'execute'),
  'anonymous visitors cannot call handle_new_user');
select ok(not has_function_privilege('anon', 'public.user_band_ids()', 'execute'),
  'anonymous visitors cannot call user_band_ids');
select ok(has_function_privilege('authenticated', 'public.user_band_ids()', 'execute'),
  'signed-in users can still call user_band_ids');

select * from finish();
rollback;
