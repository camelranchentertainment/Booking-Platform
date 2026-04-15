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

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_self'
  ) THEN
    CREATE POLICY "profiles_self" ON profiles
      FOR ALL TO authenticated
      USING  (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
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
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bands' AND policyname = 'bands_owner'
  ) THEN
    CREATE POLICY "bands_owner" ON bands
      FOR ALL TO authenticated
      USING  (auth.uid() = owner_user_id)
      WITH CHECK (auth.uid() = owner_user_id);
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
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'band_members' AND policyname = 'band_members_self'
  ) THEN
    CREATE POLICY "band_members_self" ON band_members
      FOR ALL TO authenticated
      USING  (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
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
