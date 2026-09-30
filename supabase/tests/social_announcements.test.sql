-- supabase/tests/social_announcements.test.sql
-- pgTAP coverage for the cue_social_announcement trigger and RLS policies.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ── Fixtures (all writes run as postgres, RLS bypassed) ───────────────────────

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000010', 'badmin@test.local',  '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000011', 'member@test.local',  '{}'::jsonb)
on conflict (id) do nothing;

insert into public.acts (id, act_name, is_active)
values
  ('00000000-0000-4000-8000-000000000001', 'Test Act A', true),
  ('00000000-0000-4000-8000-000000000002', 'Test Act B', true)
on conflict (id) do nothing;

insert into public.profiles (id, email, role, act_id)
values
  ('00000000-0000-4000-8000-000000000010', 'badmin@test.local', 'band_admin', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000011', 'member@test.local', 'member',     null)
on conflict (id) do update set role = excluded.role, act_id = excluded.act_id;

-- B1: Act A, confirmed, future → trigger creates 1 announcement
insert into public.bookings (id, created_by, act_id, status, show_date, entry_type)
values ('00000000-0000-4000-8000-000000000020',
        '00000000-0000-4000-8000-000000000010',
        '00000000-0000-4000-8000-000000000001',
        'confirmed', current_date + 7, 'show');

-- B2: Act A, pitch, future (updated to confirmed in test 2)
insert into public.bookings (id, created_by, act_id, status, show_date, entry_type)
values ('00000000-0000-4000-8000-000000000021',
        '00000000-0000-4000-8000-000000000010',
        '00000000-0000-4000-8000-000000000001',
        'pitch', current_date + 14, 'show');

-- B3: Act A, confirmed, PAST → trigger must not create announcement
insert into public.bookings (id, created_by, act_id, status, show_date, entry_type)
values ('00000000-0000-4000-8000-000000000022',
        '00000000-0000-4000-8000-000000000010',
        '00000000-0000-4000-8000-000000000001',
        'confirmed', current_date - 1, 'show');

-- B4: Act A, confirmed, future (cancel/reopen test)
insert into public.bookings (id, created_by, act_id, status, show_date, entry_type)
values ('00000000-0000-4000-8000-000000000023',
        '00000000-0000-4000-8000-000000000010',
        '00000000-0000-4000-8000-000000000001',
        'confirmed', current_date + 21, 'show');

-- B5: Act A, pitch, future (user-dismiss test)
insert into public.bookings (id, created_by, act_id, status, show_date, entry_type)
values ('00000000-0000-4000-8000-000000000024',
        '00000000-0000-4000-8000-000000000010',
        '00000000-0000-4000-8000-000000000001',
        'pitch', current_date + 28, 'show');

-- B6: Act B, confirmed, future (cross-act RLS test)
insert into public.bookings (id, created_by, act_id, status, show_date, entry_type)
values ('00000000-0000-4000-8000-000000000025',
        '00000000-0000-4000-8000-000000000010',
        '00000000-0000-4000-8000-000000000002',
        'confirmed', current_date + 7, 'show');

-- ── 1. INSERT confirmed + future → exactly 1 announcement, status ready ───────
select is(
  (select count(*)::int from public.social_announcements
   where booking_id = '00000000-0000-4000-8000-000000000020'),
  1,
  'confirmed future booking creates 1 announcement'
);

-- ── 2a. pitch → confirmed creates 1 announcement ─────────────────────────────
update public.bookings set status = 'confirmed'
where id = '00000000-0000-4000-8000-000000000021';

select is(
  (select count(*)::int from public.social_announcements
   where booking_id = '00000000-0000-4000-8000-000000000021'),
  1,
  'pitch→confirmed creates 1 announcement'
);

-- ── 2b. Re-confirming (status update) does not duplicate ──────────────────────
update public.bookings set show_date = current_date + 15
where id = '00000000-0000-4000-8000-000000000021';

select is(
  (select count(*)::int from public.social_announcements
   where booking_id = '00000000-0000-4000-8000-000000000021'),
  1,
  're-confirm does not duplicate the announcement'
);

-- ── 3. Confirmed booking with a past show_date creates no announcement ────────
select is(
  (select count(*)::int from public.social_announcements
   where booking_id = '00000000-0000-4000-8000-000000000022'),
  0,
  'confirmed booking with past show_date creates no announcement'
);

-- ── 4a. confirmed → cancelled dismisses the announcement ──────────────────────
update public.bookings set status = 'cancelled'
where id = '00000000-0000-4000-8000-000000000023';

select is(
  (select status from public.social_announcements
   where booking_id = '00000000-0000-4000-8000-000000000023'),
  'dismissed',
  'cancelling a confirmed booking sets announcement to dismissed'
);

-- ── 4b. Back to confirmed reopens the booking_cancelled-dismissed card ─────────
update public.bookings set status = 'confirmed'
where id = '00000000-0000-4000-8000-000000000023';

select is(
  (select status from public.social_announcements
   where booking_id = '00000000-0000-4000-8000-000000000023'),
  'ready',
  'back to confirmed reopens a booking_cancelled-dismissed announcement'
);

-- ── 5. User-dismissed card is NOT reopened by a later status change ───────────
-- Confirm B5 (trigger creates card), then manually set dismissed_reason='user'.
update public.bookings set status = 'confirmed'
where id = '00000000-0000-4000-8000-000000000024';

update public.social_announcements
   set status = 'dismissed', dismissed_reason = 'user'
 where booking_id = '00000000-0000-4000-8000-000000000024';

-- Nudge show_date to fire UPDATE path again.
update public.bookings set show_date = current_date + 29
where id = '00000000-0000-4000-8000-000000000024';

select is(
  (select status from public.social_announcements
   where booking_id = '00000000-0000-4000-8000-000000000024'),
  'dismissed',
  'user-dismissed announcement is not reopened by a subsequent confirm trigger'
);

-- ── Insert social_post fixture for update/delete RLS tests ────────────────────
insert into public.social_posts (id, announcement_id, act_id, platform, delivery, caption)
select '00000000-0000-4000-8000-000000000030',
       sa.id,
       '00000000-0000-4000-8000-000000000001',
       'facebook', 'manual_kit', ''
  from public.social_announcements sa
 where sa.booking_id = '00000000-0000-4000-8000-000000000020';

-- ── RLS tests: switch to authenticated role ───────────────────────────────────

-- ── 6a. Member sees 0 announcements ───────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.social_announcements),
  0,
  'member sees no social_announcements'
);

-- ── 6b. Member sees 0 posts ───────────────────────────────────────────────────
select is(
  (select count(*)::int from public.social_posts),
  0,
  'member sees no social_posts'
);

-- ── 7a/7b. Band-admin sees own act's cards but not another act's ──────────────
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000010","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.social_announcements
   where booking_id = '00000000-0000-4000-8000-000000000020'),
  1,
  'band_admin sees own act announcement'
);

select is(
  (select count(*)::int from public.social_announcements
   where booking_id = '00000000-0000-4000-8000-000000000025'),
  0,
  'band_admin cannot see another act announcement'
);

-- ── 8. Band-admin cannot write to either table (42501) ───────────────────────
select throws_ok(
  $$ insert into public.social_announcements (act_id, booking_id)
     values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000021') $$,
  '42501', null, 'band_admin: INSERT on social_announcements blocked'
);

select throws_ok(
  $$ update public.social_announcements set updated_at = now()
     where act_id = '00000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'band_admin: UPDATE on social_announcements blocked'
);

select throws_ok(
  $$ delete from public.social_announcements
     where booking_id = '00000000-0000-4000-8000-000000000020' $$,
  '42501', null, 'band_admin: DELETE on social_announcements blocked'
);

select throws_ok(
  $$ insert into public.social_posts (announcement_id, act_id, platform, delivery, caption)
     select sa.id, '00000000-0000-4000-8000-000000000001', 'instagram', 'manual_kit', ''
       from public.social_announcements sa
      where sa.booking_id = '00000000-0000-4000-8000-000000000020'
      limit 1 $$,
  '42501', null, 'band_admin: INSERT on social_posts blocked'
);

select throws_ok(
  $$ update public.social_posts set caption = 'x'
     where id = '00000000-0000-4000-8000-000000000030' $$,
  '42501', null, 'band_admin: UPDATE on social_posts blocked'
);

select throws_ok(
  $$ delete from public.social_posts
     where id = '00000000-0000-4000-8000-000000000030' $$,
  '42501', null, 'band_admin: DELETE on social_posts blocked'
);

-- ── Back to postgres for constraint tests ─────────────────────────────────────
reset role;

-- ── 9. social_post with mismatched act_id fails composite FK (23503) ──────────
select throws_ok(
  $$ insert into public.social_posts (announcement_id, act_id, platform, delivery, caption)
     select sa.id, '00000000-0000-4000-8000-000000000002', 'tiktok', 'manual_kit', ''
       from public.social_announcements sa
      where sa.booking_id = '00000000-0000-4000-8000-000000000020'
      limit 1 $$,
  '23503', null,
  'social_post with act_id not matching its announcement fails composite FK'
);

-- ── 10. status=scheduled with null scheduled_for fails check (23514) ──────────
select throws_ok(
  $$ insert into public.social_posts (announcement_id, act_id, platform, delivery, caption, status, scheduled_for)
     select sa.id, '00000000-0000-4000-8000-000000000001', 'facebook', 'manual_kit', '', 'scheduled', null
       from public.social_announcements sa
      where sa.booking_id = '00000000-0000-4000-8000-000000000020'
      limit 1 $$,
  '23514', null,
  'status=scheduled with null scheduled_for fails check constraint'
);

select * from finish();
rollback;
