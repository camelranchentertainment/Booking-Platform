-- Phase 14 (revised): EPK Settings, Generated Posters, Media Library Extensions
-- Run manually in Supabase SQL Editor. Review before executing.
-- Dependencies: Phase 1 (acts, bookings, profiles) and Phase 4 (media_library) must be applied first.
--
-- WHAT CHANGED FROM ORIGINAL DRAFT:
--   • media_assets table removed — media_library already serves this purpose
--   • media-assets storage bucket and its policies removed
--   • generated_posters FKs now reference media_library(id) instead of media_assets(id)
--   • All RLS subqueries and FKs reference profiles — the live application table
--   • Additive columns added to media_library: is_featured, epk_order, is_public, caption
--   • file_type on media_library has no CHECK constraint (comment-only in phase4) — no change needed
--   • media-library storage bucket switched from public to private
--   • storage.objects RLS policies added for media-library bucket (phase4 added none)

-- ============================================================
-- 1. epk_settings  (one row per act, enforced by UNIQUE on act_id)
-- ============================================================
create table if not exists epk_settings (
  id                  uuid        primary key default gen_random_uuid(),
  act_id              uuid        not null references acts(id) on delete cascade unique,
  slug                text        unique,
  headline            text,
  bio                 text,
  genres              text[],
  hometown            text,
  website_url         text,
  spotify_url         text,
  apple_music_url     text,
  youtube_url         text,
  facebook_url        text,
  instagram_url       text,
  tiktok_url          text,
  contact_name        text,
  contact_email       text,
  contact_phone       text,
  is_published        boolean     not null default false,
  custom_accent       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table epk_settings enable row level security;

drop policy if exists "Act admins can manage own EPK settings" on epk_settings;
create policy "Act admins can manage own EPK settings"
  on epk_settings for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.act_id = epk_settings.act_id
        and p.role in ('band_admin', 'superadmin')
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.act_id = epk_settings.act_id
        and p.role in ('band_admin', 'superadmin')
    )
  );

drop trigger if exists epk_settings_updated_at on epk_settings;
create trigger epk_settings_updated_at
  before update on epk_settings
  for each row execute function update_updated_at_column();

-- ============================================================
-- 2. generated_posters
--    FKs point to media_library(id) — media_assets table was removed.
-- ============================================================
create table if not exists generated_posters (
  id                      uuid        primary key default gen_random_uuid(),
  act_id                  uuid        not null references acts(id) on delete cascade,
  booking_id              uuid        not null references bookings(id) on delete cascade,
  media_asset_id          uuid        references media_library(id) on delete set null,
  style                   text        not null
                            check (style in ('americana','electric','western')),
  included_fields         jsonb       not null default '{}',
  output_media_asset_id   uuid        references media_library(id) on delete set null,
  created_at              timestamptz not null default now(),
  created_by              uuid        references profiles(id) on delete set null
);

alter table generated_posters enable row level security;

drop policy if exists "Act admins can manage own generated posters" on generated_posters;
create policy "Act admins can manage own generated posters"
  on generated_posters for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.act_id = generated_posters.act_id
        and p.role in ('band_admin', 'superadmin')
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.act_id = generated_posters.act_id
        and p.role in ('band_admin', 'superadmin')
    )
  );

-- ============================================================
-- 3. Extend media_library with EPK / poster metadata columns
--    file_type has NO CHECK constraint in phase4 (comment only),
--    so file_type = 'poster' is already valid — no schema change needed.
-- ============================================================
alter table media_library
  add column if not exists is_featured boolean default false,
  add column if not exists epk_order   integer,
  add column if not exists is_public   boolean default false,
  add column if not exists caption     text;

-- ============================================================
-- 4. Switch media-library storage bucket from public to private
--    Uses the name column — bucket was created manually via Dashboard
--    and Supabase sets id = name for dashboard-created buckets, but
--    name is the safe identifier here in case id was customised.
-- ============================================================
update storage.buckets
  set public = false
  where name = 'media-library';

-- ============================================================
-- 5. Storage RLS policies for the media-library bucket
--    Phase 4 added zero storage.objects policies (bucket was public).
--    Storage paths must follow the pattern: {act_id}/{filename}
--    bucket_id = 'media-library' matches storage.buckets.id, which
--    equals the name for dashboard-created buckets.
-- ============================================================

-- SELECT: any member of the act can read their act's files
drop policy if exists "Act members can read media-library" on storage.objects;
create policy "Act members can read media-library"
  on storage.objects for select
  using (
    bucket_id = 'media-library'
    and split_part(name, '/', 1) in (
      select act_id::text from profiles where id = auth.uid()
    )
  );

-- INSERT: only band_admin / superadmin can upload
drop policy if exists "Act admins can upload to media-library" on storage.objects;
create policy "Act admins can upload to media-library"
  on storage.objects for insert
  with check (
    bucket_id = 'media-library'
    and split_part(name, '/', 1) in (
      select act_id::text from profiles
      where id = auth.uid()
        and role in ('band_admin', 'superadmin')
    )
  );

-- UPDATE: only band_admin / superadmin can overwrite
drop policy if exists "Act admins can update media-library" on storage.objects;
create policy "Act admins can update media-library"
  on storage.objects for update
  using (
    bucket_id = 'media-library'
    and split_part(name, '/', 1) in (
      select act_id::text from profiles
      where id = auth.uid()
        and role in ('band_admin', 'superadmin')
    )
  );

-- DELETE: only band_admin / superadmin can remove
drop policy if exists "Act admins can delete from media-library" on storage.objects;
create policy "Act admins can delete from media-library"
  on storage.objects for delete
  using (
    bucket_id = 'media-library'
    and split_part(name, '/', 1) in (
      select act_id::text from profiles
      where id = auth.uid()
        and role in ('band_admin', 'superadmin')
    )
  );
