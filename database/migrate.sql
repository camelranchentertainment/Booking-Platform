-- Migration: add columns missing from the initial schema
-- Run this in your Supabase SQL Editor if you already have a database from
-- an earlier version of the schema. Safe to run multiple times (all ALTER TABLE
-- statements use IF NOT EXISTS / DO NOTHING patterns where possible).

-- ── venues ───────────────────────────────────────────────────────────────────
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_venues_user_id ON venues(user_id);

-- ── campaigns ────────────────────────────────────────────────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cities TEXT[],
  ADD COLUMN IF NOT EXISTS radius INTEGER DEFAULT 25,
  ADD COLUMN IF NOT EXISTS date_range_start DATE,
  ADD COLUMN IF NOT EXISTS date_range_end DATE;

-- ── campaign_venues ───────────────────────────────────────────────────────────
-- Add UUID primary key (previously used compound PK on campaign_id+venue_id).
-- If the table already has the compound PK we convert it to a UNIQUE constraint.
DO $$
BEGIN
  -- Add id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='campaign_venues' AND column_name='id'
  ) THEN
    ALTER TABLE campaign_venues ADD COLUMN id UUID DEFAULT uuid_generate_v4();
    -- Back-fill id for any existing rows
    UPDATE campaign_venues SET id = uuid_generate_v4() WHERE id IS NULL;
    ALTER TABLE campaign_venues ALTER COLUMN id SET NOT NULL;
  END IF;
END $$;

-- Add status column
ALTER TABLE campaign_venues
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS booking_date DATE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- If an old show_date column exists (from earlier app code), copy it into booking_date
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='campaign_venues' AND column_name='show_date'
  ) THEN
    UPDATE campaign_venues SET booking_date = show_date::DATE WHERE booking_date IS NULL AND show_date IS NOT NULL;
    ALTER TABLE campaign_venues DROP COLUMN IF EXISTS show_date;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_campaign_venues_campaign_id ON campaign_venues(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_venues_status ON campaign_venues(status);
CREATE INDEX IF NOT EXISTS idx_campaign_venues_booking_date ON campaign_venues(booking_date);

-- ── email_logs ────────────────────────────────────────────────────────────────
ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS direction VARCHAR(10) DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS to_address VARCHAR(255),
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_venue_id ON email_logs(venue_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_id ON email_logs(campaign_id);

-- ── user_email_settings (new table) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_email_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  provider VARCHAR(50) DEFAULT 'smtp',
  display_name VARCHAR(255),
  email_address VARCHAR(255),
  smtp_host VARCHAR(255),
  smtp_port INTEGER DEFAULT 587,
  imap_host VARCHAR(255),
  imap_port INTEGER DEFAULT 993,
  username VARCHAR(255),
  password_enc TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- If table already exists, add the missing columns
ALTER TABLE user_email_settings
  ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'smtp',
  ADD COLUMN IF NOT EXISTS imap_host VARCHAR(255),
  ADD COLUMN IF NOT EXISTS imap_port INTEGER DEFAULT 993;

-- ── booking_runs (new table) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'cancelled')),
  start_date DATE,
  end_date DATE,
  target_regions TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_runs_status ON booking_runs(status);
CREATE INDEX IF NOT EXISTS idx_booking_runs_start_date ON booking_runs(start_date);

-- ── social_media_posts (new table) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_media_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES campaign_venues(id) ON DELETE CASCADE,
  platform VARCHAR(50) CHECK (platform IN ('facebook', 'instagram', 'twitter', 'tiktok')),
  post_text TEXT,
  post_date TIMESTAMP,
  hashtags TEXT[],
  mentions TEXT[],
  image_prompt TEXT,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'posted', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_media_posts_booking_id ON social_media_posts(booking_id);
CREATE INDEX IF NOT EXISTS idx_social_media_posts_post_date ON social_media_posts(post_date);
CREATE INDEX IF NOT EXISTS idx_social_media_posts_status ON social_media_posts(status);

-- ── updated_at triggers for new tables ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_email_settings_updated_at') THEN
    CREATE TRIGGER update_user_email_settings_updated_at
      BEFORE UPDATE ON user_email_settings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_booking_runs_updated_at') THEN
    CREATE TRIGGER update_booking_runs_updated_at
      BEFORE UPDATE ON booking_runs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_social_media_posts_updated_at') THEN
    CREATE TRIGGER update_social_media_posts_updated_at
      BEFORE UPDATE ON social_media_posts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
