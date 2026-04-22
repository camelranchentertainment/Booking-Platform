-- Tour outreach pool: venues being targeted for a specific tour
-- Run in: Supabase dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS tour_venues (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tour_id    UUID NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  venue_id   UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'target'
               CHECK (status IN ('target','pitched','followup','negotiating','confirmed','declined')),
  notes      TEXT,
  added_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tour_id, venue_id)
);

ALTER TABLE tour_venues ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tour_venues_agent" ON tour_venues FOR ALL
    USING (tour_id IN (SELECT id FROM tours WHERE created_by = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_tour_venues_tour   ON tour_venues(tour_id);
CREATE INDEX IF NOT EXISTS idx_tour_venues_venue  ON tour_venues(venue_id);
CREATE INDEX IF NOT EXISTS idx_tour_venues_status ON tour_venues(status);

DO $$ BEGIN
  CREATE TRIGGER trg_tour_venues_updated
    BEFORE UPDATE ON tour_venues FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Social post queue: AI-written posts pending approval
CREATE TABLE IF NOT EXISTS social_queue (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  act_id     UUID NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
  venue_id   UUID REFERENCES venues(id) ON DELETE SET NULL,
  platform   TEXT NOT NULL DEFAULT 'instagram'
               CHECK (platform IN ('instagram','facebook','both')),
  content    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','posted','dismissed')),
  show_date  DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE social_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "social_queue_agent" ON social_queue FOR ALL
    USING (act_id IN (SELECT id FROM acts WHERE agent_id = auth.uid() OR owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_social_queue_booking ON social_queue(booking_id);
CREATE INDEX IF NOT EXISTS idx_social_queue_status  ON social_queue(status);

DO $$ BEGIN
  CREATE TRIGGER trg_social_queue_updated
    BEFORE UPDATE ON social_queue FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
