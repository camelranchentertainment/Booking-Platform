-- Email drafts: support tour outreach pool venues (tour_venues)
-- Run in Supabase SQL Editor

-- 1. Create email_drafts table if it doesn't exist
CREATE TABLE IF NOT EXISTS email_drafts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID REFERENCES bookings(id) ON DELETE CASCADE,
  category     TEXT NOT NULL DEFAULT 'target',
  subject      TEXT,
  body         TEXT,
  agent_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Make booking_id nullable (allows tour_venue-only drafts)
ALTER TABLE email_drafts ALTER COLUMN booking_id DROP NOT NULL;

-- 3. Add tour_venue_id column for outreach pool venue drafts
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS tour_venue_id UUID REFERENCES tour_venues(id) ON DELETE CASCADE;

-- 4. RLS
ALTER TABLE email_drafts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'email_drafts' AND policyname = 'email_drafts_agent'
  ) THEN
    CREATE POLICY "email_drafts_agent" ON email_drafts FOR ALL USING (agent_id = auth.uid());
  END IF;
END $$;

-- 5. Unique constraint for tour_venue drafts (prevents duplicates)
DO $$ BEGIN
  ALTER TABLE email_drafts ADD CONSTRAINT email_drafts_tour_venue_category_unique UNIQUE (tour_venue_id, category);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_email_drafts_booking    ON email_drafts(booking_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_tour_venue ON email_drafts(tour_venue_id);
CREATE INDEX IF NOT EXISTS idx_email_drafts_agent      ON email_drafts(agent_id);

-- 6. Booking stage tracking columns (for outreach tracker)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS email_stage       TEXT DEFAULT 'target';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS last_contact_date DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS follow_up_count   INTEGER DEFAULT 0;
