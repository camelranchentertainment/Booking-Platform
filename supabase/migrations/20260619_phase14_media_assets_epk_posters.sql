-- Phase 14: Media Assets, EPK Settings, Generated Posters
-- Run manually in Supabase SQL Editor. Review before executing.
-- Dependencies: Phase 1 migration (profiles, acts, bookings) must be applied first.
--
-- STORAGE BUCKET:
--   This migration includes an INSERT into storage.buckets for the
--   private 'media-assets' bucket. If your Supabase role lacks storage
--   admin permissions, create the bucket manually first:
--     Dashboard → Storage → New Bucket
--     Name: media-assets  |  Public: OFF  |  File size limit: 50 MB
--   Then run the rest of this file (the INSERT is idempotent via ON CONFLICT).

-- ============================================================
-- 1. media_assets
-- ============================================================
create table if not exists media_assets (
  id                  uuid        primary key default gen_random_uuid(),
  act_id              uuid        not null references acts(id) on delete cascade,
  uploaded_by         uuid        references profiles(id) on delete set null,
  label               text,
  category            text        not null
                        check (category in ('photo','video','audio','document','brand','poster')),
  storage_path        text,
  file_name           text,
  file_size           integer,
  mime_type           text,
  external_url        text,
  embed_type          text,
  tags                text[]      not null default '{}',
  alt_text            text,
  caption             text,
  is_featured         boolean     not null default false,
  is_public           boolean     not null default false,
  epk_order           integer,
  width               integer,
  height              integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

alter table media_assets enable row level security;

drop policy if exists "Act admins can manage own media assets" on media_assets;
create policy "Act admins can manage own media assets"
  on media_assets for all
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.act_id = media_assets.act_id
        and p.role in ('band_admin', 'superadmin')
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.act_id = media_assets.act_id
        and p.role in ('band_admin', 'superadmin')
    )
  );

drop trigger if exists media_assets_updated_at on media_assets;
create trigger media_assets_updated_at
  before update on media_assets
  for each row execute function update_updated_at_column();

-- ============================================================
-- 2. epk_settings  (one row per act, enforced by UNIQUE on act_id)
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
-- 3. generated_posters
-- ============================================================
create table if not exists generated_posters (
  id                      uuid        primary key default gen_random_uuid(),
  act_id                  uuid        not null references acts(id) on delete cascade,
  booking_id              uuid        not null references bookings(id) on delete cascade,
  media_asset_id          uuid        references media_assets(id) on delete set null,
  style                   text        not null
                            check (style in ('americana','electric','western')),
  included_fields         jsonb       not null default '{}',
  output_media_asset_id   uuid        references media_assets(id) on delete set null,
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
-- 4. Storage bucket: media-assets (private)
-- ============================================================
-- Idempotent — safe to run even if bucket already exists.
insert into storage.buckets (id, name, public)
values ('media-assets', 'media-assets', false)
on conflict (id) do nothing;

-- Storage paths must follow the pattern: {act_id}/{filename}
-- The first path segment is always the act_id (as text/UUID).
-- All four DML operations are covered separately so the USING /
-- WITH CHECK sides can be expressed correctly per operation.

-- SELECT: any member of the act can read their act's files
drop policy if exists "Act members can read own act media" on storage.objects;
create policy "Act members can read own act media"
  on storage.objects for select
  using (
    bucket_id = 'media-assets'
    and split_part(name, '/', 1) in (
      select act_id::text from profiles where id = auth.uid()
    )
  );

-- INSERT: only band_admin / superadmin can upload
drop policy if exists "Act admins can upload to own act media" on storage.objects;
create policy "Act admins can upload to own act media"
  on storage.objects for insert
  with check (
    bucket_id = 'media-assets'
    and split_part(name, '/', 1) in (
      select act_id::text from profiles
      where id = auth.uid()
        and role in ('band_admin', 'superadmin')
    )
  );

-- UPDATE: only band_admin / superadmin can overwrite
drop policy if exists "Act admins can update own act media" on storage.objects;
create policy "Act admins can update own act media"
  on storage.objects for update
  using (
    bucket_id = 'media-assets'
    and split_part(name, '/', 1) in (
      select act_id::text from profiles
      where id = auth.uid()
        and role in ('band_admin', 'superadmin')
    )
  );

-- DELETE: only band_admin / superadmin can remove
drop policy if exists "Act admins can delete own act media" on storage.objects;
create policy "Act admins can delete own act media"
  on storage.objects for delete
  using (
    bucket_id = 'media-assets'
    and split_part(name, '/', 1) in (
      select act_id::text from profiles
      where id = auth.uid()
        and role in ('band_admin', 'superadmin')
    )
  );
