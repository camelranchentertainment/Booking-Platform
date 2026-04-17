-- Schema v5: complete migration — creates all missing tables/columns
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ── band_profiles (agent subscription table) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS band_profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  band_name         TEXT,
  username          TEXT,
  subscription_tier TEXT DEFAULT 'free',
  is_admin          BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE band_profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_profiles' AND policyname='bp_select') THEN
    CREATE POLICY "bp_select" ON band_profiles FOR SELECT TO authenticated USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_profiles' AND policyname='bp_insert') THEN
    CREATE POLICY "bp_insert" ON band_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_profiles' AND policyname='bp_update') THEN
    CREATE POLICY "bp_update" ON band_profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
  END IF;
END $$;

-- ── user_calendar_settings (missing entirely) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS user_calendar_settings (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_email           TEXT,
  calendar_type        TEXT DEFAULT 'google' CHECK (calendar_type IN ('google','ical','none')),
  google_access_token  TEXT,
  google_refresh_token TEXT,
  ical_url             TEXT,
  calendar_api_key     TEXT,
  is_active            BOOLEAN DEFAULT false,
  last_synced_at       TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
ALTER TABLE user_calendar_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_calendar_settings' AND policyname='ucs_select') THEN
    CREATE POLICY "ucs_select" ON user_calendar_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_calendar_settings' AND policyname='ucs_insert') THEN
    CREATE POLICY "ucs_insert" ON user_calendar_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_calendar_settings' AND policyname='ucs_update') THEN
    CREATE POLICY "ucs_update" ON user_calendar_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── Missing columns on existing tables ───────────────────────────────────────
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS from_address TEXT;
ALTER TABLE venues     ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ;
ALTER TABLE profiles   ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'agent' CHECK (role IN ('agent','band_admin','band_member'));

-- ── profiles RLS ─────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_select') THEN
    CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
  END IF;
END $$;

-- ── Backfill roles ────────────────────────────────────────────────────────────
INSERT INTO profiles (id, role, display_name)
SELECT owner_user_id, 'band_admin', band_name FROM bands
ON CONFLICT (id) DO UPDATE SET role = 'band_admin';

-- ── Fix Jake: create bands row + profile if missing ───────────────────────────
INSERT INTO bands (owner_user_id, band_name)
SELECT id, 'Jake Stringer' FROM auth.users
WHERE email ILIKE 'jake@%'
AND id NOT IN (SELECT owner_user_id FROM bands);

INSERT INTO profiles (id, role, display_name)
SELECT id, 'band_admin', email FROM auth.users
WHERE email ILIKE 'jake@%'
ON CONFLICT (id) DO UPDATE SET role = 'band_admin';

UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email ILIKE 'jake@%';
