-- Schema v2: agent-scoped booking platform
-- Run in Supabase SQL Editor. Safe to run multiple times.
-- Adds: profiles, bands, band_members tables + band_id on email_templates.

-- ── uuid extension (already exists in most Supabase projects) ─────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── profiles (agent identity, one row per user) ───────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name      TEXT,
  agency_name     TEXT,
  contact_phone   TEXT,
  contact_email   TEXT,
  display_name    TEXT,
  subscription_tier TEXT DEFAULT 'free',
  stripe_customer_id TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Separate per-operation policies avoid the infinite-recursion bug that
-- occurs when FOR ALL uses both USING and WITH CHECK simultaneously.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_select') THEN
    CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_insert') THEN
    CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_update') THEN
    CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_delete') THEN
    CREATE POLICY "profiles_delete" ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);
  END IF;
END $$;

-- ── bands (acts represented by the agent) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS bands (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  band_name       TEXT NOT NULL,
  genre           TEXT,
  home_city       TEXT,
  home_state      TEXT,
  profile_photo_url TEXT,
  instagram       TEXT,
  facebook        TEXT,
  website         TEXT,
  epk_link        TEXT,
  bio             TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Add epk_link if table existed before this column was defined
ALTER TABLE bands ADD COLUMN IF NOT EXISTS epk_link TEXT;

ALTER TABLE bands ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bands' AND policyname = 'bands_select') THEN
    CREATE POLICY "bands_select" ON bands FOR SELECT TO authenticated USING (auth.uid() = owner_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bands' AND policyname = 'bands_insert') THEN
    CREATE POLICY "bands_insert" ON bands FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bands' AND policyname = 'bands_update') THEN
    CREATE POLICY "bands_update" ON bands FOR UPDATE TO authenticated USING (auth.uid() = owner_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bands' AND policyname = 'bands_delete') THEN
    CREATE POLICY "bands_delete" ON bands FOR DELETE TO authenticated USING (auth.uid() = owner_user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bands_owner ON bands(owner_user_id);

-- ── band_members (junction: user ↔ band with role) ────────────────────────────
CREATE TABLE IF NOT EXISTS band_members (
  id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  band_id  UUID REFERENCES bands(id) ON DELETE CASCADE NOT NULL,
  user_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role     TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(band_id, user_id)
);

ALTER TABLE band_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'band_members' AND policyname = 'band_members_select') THEN
    CREATE POLICY "band_members_select" ON band_members FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'band_members' AND policyname = 'band_members_insert') THEN
    CREATE POLICY "band_members_insert" ON band_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'band_members' AND policyname = 'band_members_update') THEN
    CREATE POLICY "band_members_update" ON band_members FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'band_members' AND policyname = 'band_members_delete') THEN
    CREATE POLICY "band_members_delete" ON band_members FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── email_templates: add band_id ──────────────────────────────────────────────
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS band_id UUID REFERENCES bands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_templates_user_band
  ON email_templates(user_id, band_id);

-- ── updated_at trigger (shared function) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profiles_updated_at') THEN
    CREATE TRIGGER trg_profiles_updated_at
      BEFORE UPDATE ON profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bands_updated_at') THEN
    CREATE TRIGGER trg_bands_updated_at
      BEFORE UPDATE ON bands
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
