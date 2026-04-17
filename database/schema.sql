-- Camel Ranch Booking Platform — Master Schema
-- Single source of truth. Supersedes schema-v2 through schema-v5 and migrate.sql.
-- Safe to run on a fresh database or an existing one (all statements use IF NOT EXISTS).

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- provides gen_random_bytes for invite tokens

-- ── shared updated_at trigger function ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ═════════════════════════════════════════════════════════════════════════════
-- CORE TABLES
-- ═════════════════════════════════════════════════════════════════════════════

-- ── profiles (agent identity, one row per auth user) ─────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name          TEXT,
  agency_name         TEXT,
  contact_phone       TEXT,
  contact_email       TEXT,
  display_name        TEXT,
  role                TEXT DEFAULT 'agent'
                        CHECK (role IN ('agent', 'band_admin', 'band_member')),
  subscription_tier   TEXT DEFAULT 'free',
  stripe_customer_id  TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_select') THEN
    CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_insert') THEN
    CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_update') THEN
    CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_delete') THEN
    CREATE POLICY "profiles_delete" ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_profiles_updated_at') THEN
    CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ── venues ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venues (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name             VARCHAR(255) NOT NULL,
  address          TEXT,
  city             VARCHAR(100) NOT NULL,
  state            VARCHAR(50) NOT NULL,
  zip_code         VARCHAR(20),
  phone            VARCHAR(50),
  website          TEXT,
  facebook_url     TEXT,
  email            VARCHAR(255),
  secondary_emails TEXT[],
  capacity_min     INTEGER,
  capacity_max     INTEGER,
  venue_type       VARCHAR(50) CHECK (venue_type IN ('bar', 'saloon', 'pub', 'club', 'dancehall')),
  has_live_music   BOOLEAN DEFAULT true,
  music_genres     TEXT[],
  booking_contact  VARCHAR(255),
  notes            TEXT,
  last_contacted   TIMESTAMP,
  last_reply_at    TIMESTAMPTZ,
  contact_status   VARCHAR(50) DEFAULT 'not_contacted'
                     CHECK (contact_status IN (
                       'not_contacted', 'awaiting_response', 'responded',
                       'booked', 'declined', 'no_response'
                     )),
  source           TEXT,
  place_id         TEXT,
  rating           NUMERIC(3,1),
  google_maps_url  TEXT,
  discovery_score  INTEGER,
  discovered_date  TIMESTAMP DEFAULT NOW(),
  search_region    VARCHAR(255),
  is_duplicate     BOOLEAN DEFAULT false,
  duplicate_of     UUID REFERENCES venues(id),
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venues_name_city       ON venues(LOWER(name), LOWER(city));
CREATE INDEX IF NOT EXISTS idx_venues_email           ON venues(email);
CREATE INDEX IF NOT EXISTS idx_venues_contact_status  ON venues(contact_status);
CREATE INDEX IF NOT EXISTS idx_venues_user_id         ON venues(user_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_venues_updated_at') THEN
    CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON venues
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ── bands (acts represented by the agent) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS bands (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agent_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  band_name         TEXT NOT NULL,
  genre             TEXT,
  home_city         TEXT,
  home_state        TEXT,
  profile_photo_url TEXT,
  instagram         TEXT,
  facebook          TEXT,
  website           TEXT,
  epk_link          TEXT,
  bio               TEXT,
  contact_email     TEXT,
  contact_phone     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bands_owner ON bands(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_bands_agent ON bands(agent_user_id);

ALTER TABLE bands ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bands' AND policyname='bands_select') THEN
    CREATE POLICY "bands_select" ON bands FOR SELECT TO authenticated
      USING (auth.uid() = owner_user_id OR auth.uid() = agent_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bands' AND policyname='bands_insert') THEN
    CREATE POLICY "bands_insert" ON bands FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = owner_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bands' AND policyname='bands_update') THEN
    CREATE POLICY "bands_update" ON bands FOR UPDATE TO authenticated
      USING (auth.uid() = owner_user_id OR auth.uid() = agent_user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bands' AND policyname='bands_delete') THEN
    CREATE POLICY "bands_delete" ON bands FOR DELETE TO authenticated
      USING (auth.uid() = owner_user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_bands_updated_at') THEN
    CREATE TRIGGER trg_bands_updated_at BEFORE UPDATE ON bands
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ── band_members (user ↔ band junction with role) ─────────────────────────────
CREATE TABLE IF NOT EXISTS band_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  band_id    UUID REFERENCES bands(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role       TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(band_id, user_id)
);

ALTER TABLE band_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_members' AND policyname='band_members_select') THEN
    CREATE POLICY "band_members_select" ON band_members FOR SELECT TO authenticated
      USING (auth.uid() = user_id OR band_id IN (
        SELECT id FROM bands WHERE owner_user_id = auth.uid() OR agent_user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_members' AND policyname='band_members_insert') THEN
    CREATE POLICY "band_members_insert" ON band_members FOR INSERT TO authenticated
      WITH CHECK (band_id IN (
        SELECT id FROM bands WHERE owner_user_id = auth.uid() OR agent_user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_members' AND policyname='band_members_update') THEN
    CREATE POLICY "band_members_update" ON band_members FOR UPDATE TO authenticated
      USING (band_id IN (SELECT id FROM bands WHERE owner_user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_members' AND policyname='band_members_delete') THEN
    CREATE POLICY "band_members_delete" ON band_members FOR DELETE TO authenticated
      USING (band_id IN (SELECT id FROM bands WHERE owner_user_id = auth.uid()));
  END IF;
END $$;

-- ── band_invites (pending member invitations) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS band_invites (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  band_id    UUID REFERENCES bands(id) ON DELETE CASCADE NOT NULL,
  invited_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email      TEXT NOT NULL,
  role       TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  token      TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status     TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE band_invites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_invites' AND policyname='band_invites_select') THEN
    CREATE POLICY "band_invites_select" ON band_invites FOR SELECT TO authenticated
      USING (auth.uid() = invited_by OR band_id IN (
        SELECT id FROM bands WHERE owner_user_id = auth.uid() OR agent_user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_invites' AND policyname='band_invites_insert') THEN
    CREATE POLICY "band_invites_insert" ON band_invites FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = invited_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_invites' AND policyname='band_invites_update') THEN
    CREATE POLICY "band_invites_update" ON band_invites FOR UPDATE TO authenticated
      USING (auth.uid() = invited_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_invites' AND policyname='band_invites_delete') THEN
    CREATE POLICY "band_invites_delete" ON band_invites FOR DELETE TO authenticated
      USING (auth.uid() = invited_by);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_band_invites_token ON band_invites(token);
CREATE INDEX IF NOT EXISTS idx_band_invites_band  ON band_invites(band_id);
CREATE INDEX IF NOT EXISTS idx_band_invites_email ON band_invites(email);

-- ── band_shows (band-owned show dates, independent of agent campaigns) ─────────
CREATE TABLE IF NOT EXISTS band_shows (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  band_id    UUID REFERENCES bands(id) ON DELETE CASCADE NOT NULL,
  venue_id   UUID REFERENCES venues(id) ON DELETE SET NULL,
  venue_name TEXT,
  show_date  DATE NOT NULL,
  notes      TEXT,
  status     TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending', 'cancelled')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE band_shows ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_shows' AND policyname='band_shows_select') THEN
    CREATE POLICY "band_shows_select" ON band_shows FOR SELECT TO authenticated
      USING (band_id IN (
        SELECT id FROM bands WHERE owner_user_id = auth.uid() OR agent_user_id = auth.uid()
        UNION
        SELECT band_id FROM band_members WHERE user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_shows' AND policyname='band_shows_insert') THEN
    CREATE POLICY "band_shows_insert" ON band_shows FOR INSERT TO authenticated
      WITH CHECK (band_id IN (
        SELECT id FROM bands WHERE owner_user_id = auth.uid() OR agent_user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_shows' AND policyname='band_shows_update') THEN
    CREATE POLICY "band_shows_update" ON band_shows FOR UPDATE TO authenticated
      USING (band_id IN (
        SELECT id FROM bands WHERE owner_user_id = auth.uid() OR agent_user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_shows' AND policyname='band_shows_delete') THEN
    CREATE POLICY "band_shows_delete" ON band_shows FOR DELETE TO authenticated
      USING (band_id IN (SELECT id FROM bands WHERE owner_user_id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_band_shows_band ON band_shows(band_id);
CREATE INDEX IF NOT EXISTS idx_band_shows_date ON band_shows(show_date);

-- ── band_profiles (agent subscription metadata — one row per band_admin) ───────
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

-- ── campaigns (booking runs / tours) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  band_id           UUID REFERENCES bands(id) ON DELETE SET NULL,
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  status            VARCHAR(50) DEFAULT 'draft'
                      CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  email_template_id UUID,
  cities            TEXT[],
  radius            INTEGER DEFAULT 25,
  target_regions    TEXT[],
  date_range_start  DATE,
  date_range_end    DATE,
  total_venues      INTEGER DEFAULT 0,
  contacted         INTEGER DEFAULT 0,
  responses         INTEGER DEFAULT 0,
  bookings          INTEGER DEFAULT 0,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user   ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_band   ON campaigns(band_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_campaigns_updated_at') THEN
    CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ── campaign_venues (venues in each campaign + booking status) ─────────────────
CREATE TABLE IF NOT EXISTS campaign_venues (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id  UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  venue_id     UUID REFERENCES venues(id) ON DELETE CASCADE,
  status       VARCHAR(50) DEFAULT 'pending'
                 CHECK (status IN (
                   'pending', 'contact?', 'contacted', 'booked',
                   'confirmed', 'responded', 'declined', 'cancelled'
                 )),
  booking_date DATE,
  added_at     TIMESTAMP DEFAULT NOW(),
  created_at   TIMESTAMP DEFAULT NOW(),
  UNIQUE(campaign_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_venues_campaign_id ON campaign_venues(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_venues_status      ON campaign_venues(status);
CREATE INDEX IF NOT EXISTS idx_campaign_venues_booking_date ON campaign_venues(booking_date);

-- ── email_templates ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  band_id    UUID REFERENCES bands(id) ON DELETE SET NULL,
  name       VARCHAR(255) NOT NULL,
  subject    VARCHAR(500) NOT NULL,
  body       TEXT NOT NULL,
  variables  TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_user_band ON email_templates(user_id, band_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_email_templates_updated_at') THEN
    CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ── email_logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_logs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  venue_id       UUID REFERENCES venues(id) ON DELETE CASCADE,
  campaign_id    UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  band_id        UUID REFERENCES bands(id) ON DELETE SET NULL,
  template_id    UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  direction      VARCHAR(10) DEFAULT 'sent' CHECK (direction IN ('sent', 'received')),
  from_address   TEXT,
  to_address     VARCHAR(255),
  subject        TEXT,
  body           TEXT,
  message_id     TEXT,
  sent_at        TIMESTAMP DEFAULT NOW(),
  opened_at      TIMESTAMP,
  clicked_at     TIMESTAMP,
  responded_at   TIMESTAMP,
  response_type  VARCHAR(50) CHECK (response_type IN ('interested', 'not_interested', 'booked', 'more_info')),
  response_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_logs_user_id    ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_venue_id   ON email_logs(venue_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_id ON email_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_band        ON email_logs(band_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at     ON email_logs(sent_at DESC);

-- ── user_email_settings (per-user SMTP/IMAP credentials) ─────────────────────
CREATE TABLE IF NOT EXISTS user_email_settings (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  provider       VARCHAR(50) DEFAULT 'smtp',
  display_name   VARCHAR(255),
  email_address  VARCHAR(255),
  smtp_host      VARCHAR(255),
  smtp_port      INTEGER DEFAULT 587,
  imap_host      VARCHAR(255),
  imap_port      INTEGER DEFAULT 993,
  username       VARCHAR(255),
  password_enc   TEXT,  -- AES-256-CBC encrypted
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_user_email_settings_updated_at') THEN
    CREATE TRIGGER update_user_email_settings_updated_at BEFORE UPDATE ON user_email_settings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ── user_calendar_settings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_calendar_settings (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_email           TEXT,
  calendar_type        TEXT DEFAULT 'google' CHECK (calendar_type IN ('google', 'ical', 'none')),
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

-- ── search_regions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS search_regions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city          VARCHAR(100) NOT NULL,
  state         VARCHAR(50) NOT NULL,
  radius_miles  INTEGER DEFAULT 25,
  is_active     BOOLEAN DEFAULT true,
  last_searched TIMESTAMP,
  venues_found  INTEGER DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ── search_queue ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS search_queue (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id         UUID REFERENCES search_regions(id) ON DELETE CASCADE,
  status            VARCHAR(50) DEFAULT 'pending'
                      CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  search_query      TEXT,
  started_at        TIMESTAMP,
  completed_at      TIMESTAMP,
  results_count     INTEGER DEFAULT 0,
  error_message     TEXT
);

-- ── booking_runs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_runs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           VARCHAR(255) NOT NULL,
  description    TEXT,
  status         VARCHAR(50) DEFAULT 'planning'
                   CHECK (status IN ('planning', 'active', 'completed', 'cancelled')),
  start_date     DATE,
  end_date       DATE,
  target_regions TEXT[],
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_runs_status     ON booking_runs(status);
CREATE INDEX IF NOT EXISTS idx_booking_runs_start_date ON booking_runs(start_date);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_booking_runs_updated_at') THEN
    CREATE TRIGGER update_booking_runs_updated_at BEFORE UPDATE ON booking_runs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ── social_media_posts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_media_posts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id   UUID REFERENCES campaign_venues(id) ON DELETE CASCADE,
  platform     VARCHAR(50) CHECK (platform IN ('facebook', 'instagram', 'twitter', 'tiktok')),
  post_text    TEXT,
  post_date    TIMESTAMP,
  hashtags     TEXT[],
  mentions     TEXT[],
  image_prompt TEXT,
  status       VARCHAR(50) DEFAULT 'draft'
                 CHECK (status IN ('draft', 'scheduled', 'posted', 'cancelled')),
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_media_posts_booking_id ON social_media_posts(booking_id);
CREATE INDEX IF NOT EXISTS idx_social_media_posts_post_date  ON social_media_posts(post_date);
CREATE INDEX IF NOT EXISTS idx_social_media_posts_status     ON social_media_posts(status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_social_media_posts_updated_at') THEN
    CREATE TRIGGER update_social_media_posts_updated_at BEFORE UPDATE ON social_media_posts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- MIGRATIONS: safe to run on existing databases
-- These ALTER TABLE statements are no-ops if the column already exists.
-- ═════════════════════════════════════════════════════════════════════════════

-- Columns added after initial release that may not exist on older instances
ALTER TABLE venues          ADD COLUMN IF NOT EXISTS source           TEXT;
ALTER TABLE venues          ADD COLUMN IF NOT EXISTS place_id         TEXT;
ALTER TABLE venues          ADD COLUMN IF NOT EXISTS rating           NUMERIC(3,1);
ALTER TABLE venues          ADD COLUMN IF NOT EXISTS google_maps_url  TEXT;
ALTER TABLE venues          ADD COLUMN IF NOT EXISTS discovery_score  INTEGER;
ALTER TABLE venues          ADD COLUMN IF NOT EXISTS last_reply_at    TIMESTAMPTZ;
ALTER TABLE email_logs      ADD COLUMN IF NOT EXISTS from_address     TEXT;
ALTER TABLE email_logs      ADD COLUMN IF NOT EXISTS band_id          UUID REFERENCES bands(id) ON DELETE SET NULL;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS band_id          UUID REFERENCES bands(id) ON DELETE SET NULL;
ALTER TABLE campaigns       ADD COLUMN IF NOT EXISTS band_id          UUID REFERENCES bands(id) ON DELETE SET NULL;
ALTER TABLE profiles        ADD COLUMN IF NOT EXISTS role             TEXT DEFAULT 'agent'
                              CHECK (role IN ('agent', 'band_admin', 'band_member'));
ALTER TABLE bands           ADD COLUMN IF NOT EXISTS agent_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE bands           ADD COLUMN IF NOT EXISTS epk_link         TEXT;

-- If show_date column exists on campaign_venues from older code, migrate to booking_date
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='campaign_venues' AND column_name='show_date'
  ) THEN
    ALTER TABLE campaign_venues ADD COLUMN IF NOT EXISTS booking_date DATE;
    UPDATE campaign_venues SET booking_date = show_date::DATE WHERE booking_date IS NULL AND show_date IS NOT NULL;
    ALTER TABLE campaign_venues DROP COLUMN show_date;
  END IF;
END $$;

-- Backfill band_admin role for existing band owners (idempotent)
INSERT INTO profiles (id, role, display_name)
SELECT owner_user_id, 'band_admin', band_name FROM bands
ON CONFLICT (id) DO UPDATE SET role = 'band_admin' WHERE profiles.role = 'agent';
