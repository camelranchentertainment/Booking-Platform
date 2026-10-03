-- supabase/migrations/20260930120000_social_announcements.sql
-- Socials S1: one "Ready to post" announcement per confirmed booking, plus
-- per-platform post rows. Writes happen only through service-role API routes;
-- the authenticated role gets SELECT only, scoped by RLS.
-- Apply manually after review. Never auto-run.

begin;

-- 0. Retire the legacy table (0 rows, no code references). Refuse if data appeared.
do $$
begin
  if to_regclass('public.social_media_posts') is not null then
    if exists (select 1 from public.social_media_posts limit 1) then
      raise exception 'social_media_posts has rows; refusing to drop. Investigate first.';
    end if;
    drop table public.social_media_posts;
  end if;
end $$;

-- 1. Announcements: the cue created when a show is confirmed.
create table public.social_announcements (
  id                  uuid        primary key default gen_random_uuid(),
  act_id              uuid        not null references public.acts(id)     on delete cascade on update cascade,
  booking_id          uuid        not null references public.bookings(id) on delete cascade on update cascade,
  status              text        not null default 'ready'
                        check (status in ('ready','drafting','posted','dismissed')),
  dismissed_reason    text
                        check (dismissed_reason in ('user','booking_cancelled')),
  background_media_id uuid        references public.media_library(id) on delete set null on update cascade,
  graphic_style       text
                        check (graphic_style in ('americana','electric','western')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint social_announcements_booking_unique unique (booking_id),
  -- lets social_posts enforce a matching act_id via a composite FK
  constraint social_announcements_id_act_unique  unique (id, act_id),
  constraint social_announcements_dismiss_reason_ck
    check ((status = 'dismissed') = (dismissed_reason is not null))
);

create index idx_social_announcements_act_status on public.social_announcements (act_id, status);
create index idx_social_announcements_bg_media   on public.social_announcements (background_media_id);

create trigger trg_social_announcements_updated
  before update on public.social_announcements
  for each row execute function public.touch_updated_at();

-- 2. Posts: one row per platform per announcement.
create table public.social_posts (
  id               uuid        primary key default gen_random_uuid(),
  announcement_id  uuid        not null,
  act_id           uuid        not null references public.acts(id) on delete cascade on update cascade,
  platform         text        not null
                     check (platform in ('facebook','instagram','tiktok','discord','youtube')),
  delivery         text        not null default 'manual_kit'
                     check (delivery in ('auto','manual_kit')),
  options          jsonb       not null default '{}'::jsonb
                     check (jsonb_typeof(options) = 'object'),
  caption          text        not null default ''
                     check (char_length(caption) <= 5000),
  -- storage object path in the private media bucket; never a signed URL (they expire)
  image_path       text,
  status           text        not null default 'draft'
                     check (status in ('draft','approved','scheduled','posting','posted','failed','dismissed')),
  scheduled_for    timestamptz,             -- S4 only; must stay null until S4 ships
  approved_by      uuid        references public.profiles(id) on delete set null on update cascade,
  approved_at      timestamptz,
  posted_at        timestamptz,
  external_post_id text,
  last_error       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint social_posts_announcement_fk
    foreign key (announcement_id, act_id)
    references public.social_announcements (id, act_id)
    on delete cascade on update cascade,
  constraint social_posts_one_per_platform unique (announcement_id, platform),
  constraint social_posts_scheduled_ck
    check (status <> 'scheduled' or scheduled_for is not null),
  constraint social_posts_approval_ck
    check (status not in ('approved','scheduled','posting','posted') or approved_at is not null),
  constraint social_posts_posted_ck
    check (status <> 'posted' or posted_at is not null)
);

create index idx_social_posts_act_status   on public.social_posts (act_id, status);
create index idx_social_posts_approved_by  on public.social_posts (approved_by);
-- S4 cron scan: due scheduled posts only
create index idx_social_posts_due
  on public.social_posts (scheduled_for)
  where status = 'scheduled';

create trigger trg_social_posts_updated
  before update on public.social_posts
  for each row execute function public.touch_updated_at();

-- 3. RLS: read-only for the act's band admin (and superadmin). No write policies,
--    so all writes go through service-role routes that re-check the caller's role.
alter table public.social_announcements enable row level security;
alter table public.social_posts         enable row level security;

revoke all on public.social_announcements, public.social_posts from anon, authenticated;
grant select on public.social_announcements, public.social_posts to authenticated;

create policy social_announcements_admin_read on public.social_announcements
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'superadmin'
           or (p.role = 'band_admin' and p.act_id = social_announcements.act_id))
  ));

create policy social_posts_admin_read on public.social_posts
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'superadmin'
           or (p.role = 'band_admin' and p.act_id = social_posts.act_id))
  ));

-- 4. Cue on Confirmed, from ANY path (agent, booking screen, calendar, tours).
create or replace function public.cue_social_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Entering (or already in) confirmed with a future date: ensure a card exists,
  -- and reopen one that was auto-dismissed by an earlier cancellation.
  if new.status::text = 'confirmed'
     and new.show_date is not null
     and new.show_date >= current_date then
    insert into public.social_announcements (act_id, booking_id)
    values (new.act_id, new.id)
    on conflict (booking_id) do update
      set status = 'ready', dismissed_reason = null
      where social_announcements.status = 'dismissed'
        and social_announcements.dismissed_reason = 'booking_cancelled';
  end if;

  -- Cancelled: withdraw any card that hasn't been posted yet.
  if tg_op = 'UPDATE'
     and new.status::text = 'cancelled'
     and old.status is distinct from new.status then
    update public.social_announcements
       set status = 'dismissed', dismissed_reason = 'booking_cancelled'
     where booking_id = new.id
       and status in ('ready','drafting');
  end if;

  return null;  -- AFTER trigger
end $$;

revoke all on function public.cue_social_announcement() from public, anon, authenticated;

create trigger trg_bookings_cue_social
  after insert or update of status, show_date on public.bookings
  for each row execute function public.cue_social_announcement();

-- 5. Backfill: every future confirmed show gets a card now.
insert into public.social_announcements (act_id, booking_id)
select b.act_id, b.id
from public.bookings b
where b.status::text = 'confirmed'
  and b.show_date is not null
  and b.show_date >= current_date
on conflict (booking_id) do nothing;

commit;
