-- Phase 4: Media Library
-- Run manually in Supabase SQL editor. Review before executing.
-- Dependencies: Phase 1 migration must be applied first.
--
-- IMPORTANT: Before running this migration, create the storage bucket manually:
--   Supabase Dashboard → Storage → New Bucket
--   Name: media-library
--   Public: ON

-- ============================================================
-- 1. media_library table
-- ============================================================
create table if not exists media_library (
  id              uuid primary key default gen_random_uuid(),
  act_id          uuid not null references acts(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  file_name       text not null,
  file_type       text not null,  -- 'image', 'logo', 'document', 'audio', 'video'
  mime_type       text not null,
  file_size       bigint not null,
  storage_path    text not null,
  public_url      text not null,
  alt_text        text,
  is_primary_logo boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table media_library enable row level security;

-- Band admins and members of the same act can view
create policy "Act members can view media"
  on media_library for select
  using (
    act_id in (
      select act_id from user_profiles where id = auth.uid() and act_id is not null
    )
  );

-- Band admins can insert
create policy "Band admins can upload media"
  on media_library for insert
  with check (
    auth.uid() = user_id
    and act_id in (
      select act_id from user_profiles
      where id = auth.uid() and role in ('band_admin', 'superadmin') and act_id is not null
    )
  );

-- Band admins can delete their own act's media
create policy "Band admins can delete media"
  on media_library for delete
  using (
    act_id in (
      select act_id from user_profiles
      where id = auth.uid() and role in ('band_admin', 'superadmin') and act_id is not null
    )
  );

-- ============================================================
-- 2. updated_at trigger for media_library
-- ============================================================
create trigger media_library_updated_at
  before update on media_library
  for each row execute function update_updated_at_column();

-- ============================================================
-- 3. image_url on social_queue
-- ============================================================
alter table social_queue add column if not exists image_url text;

-- ============================================================
-- 4. Only one primary logo per act
-- ============================================================
-- When is_primary_logo is set to true, clear other logos for same act.
-- Handle this in application code (upsert logic in upload API).
