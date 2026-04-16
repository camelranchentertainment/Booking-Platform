-- Schema v4: Agent-Band cohesion + 30-day outreach tracking
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ── band_id on campaigns (ties a run to a specific band) ─────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS band_id UUID REFERENCES bands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_band ON campaigns(band_id);

-- ── band_id on email_logs (tracks which band an email was sent for) ──────────
ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS band_id UUID REFERENCES bands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_logs_band    ON email_logs(band_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_venue   ON email_logs(venue_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at DESC);

-- ── band_shows: band-owned show dates (independent of agent campaigns) ───────
CREATE TABLE IF NOT EXISTS band_shows (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  band_id     UUID REFERENCES bands(id) ON DELETE CASCADE NOT NULL,
  venue_id    UUID REFERENCES venues(id) ON DELETE SET NULL,
  venue_name  TEXT,          -- free-text fallback if venue not in DB
  show_date   DATE NOT NULL,
  notes       TEXT,
  status      TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed','pending','cancelled')),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE band_shows ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_shows' AND policyname='band_shows_select') THEN
    CREATE POLICY "band_shows_select" ON band_shows FOR SELECT TO authenticated
      USING (band_id IN (
        SELECT id FROM bands WHERE owner_user_id = auth.uid()
        UNION
        SELECT band_id FROM band_members WHERE user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_shows' AND policyname='band_shows_insert') THEN
    CREATE POLICY "band_shows_insert" ON band_shows FOR INSERT TO authenticated
      WITH CHECK (band_id IN (
        SELECT id FROM bands WHERE owner_user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_shows' AND policyname='band_shows_update') THEN
    CREATE POLICY "band_shows_update" ON band_shows FOR UPDATE TO authenticated
      USING (band_id IN (SELECT id FROM bands WHERE owner_user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='band_shows' AND policyname='band_shows_delete') THEN
    CREATE POLICY "band_shows_delete" ON band_shows FOR DELETE TO authenticated
      USING (band_id IN (SELECT id FROM bands WHERE owner_user_id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_band_shows_band ON band_shows(band_id);
CREATE INDEX IF NOT EXISTS idx_band_shows_date ON band_shows(show_date);
