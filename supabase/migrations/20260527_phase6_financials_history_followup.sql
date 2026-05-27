-- Phase 6: Financials, History, Follow-up Automation & Superadmin Panel
-- Run manually in Supabase SQL Editor. Review before executing.
-- Dependencies: Phase 1–5 migrations must be applied first.

-- ============================================================
-- 1. Add rating and attendance columns to bookings
-- ============================================================
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rating       integer CHECK (rating >= 1 AND rating <= 5);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS attendance   integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS would_return boolean;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS venue_feedback text;

-- ============================================================
-- 2. follow-up rules per act
-- ============================================================
CREATE TABLE IF NOT EXISTS followup_rules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  act_id               uuid NOT NULL REFERENCES acts(id) ON DELETE CASCADE UNIQUE,
  enabled              boolean NOT NULL DEFAULT true,
  first_followup_days  integer NOT NULL DEFAULT 7,
  second_followup_days integer NOT NULL DEFAULT 14,
  max_followups        integer NOT NULL DEFAULT 2,
  followup_template_id uuid REFERENCES email_templates(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE followup_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Band admin manages own followup rules" ON followup_rules;
CREATE POLICY "Band admin manages own followup rules"
  ON followup_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
        AND p.act_id = followup_rules.act_id
        AND p.role IN ('band_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
        AND p.act_id = followup_rules.act_id
        AND p.role IN ('band_admin', 'superadmin')
    )
  );

-- ============================================================
-- 3. follow-up queue
-- ============================================================
CREATE TABLE IF NOT EXISTS followup_queue (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  act_id            uuid NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
  tour_venue_id     uuid NOT NULL REFERENCES tour_venues(id) ON DELETE CASCADE,
  venue_id          uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tour_id           uuid NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  followup_number   integer NOT NULL DEFAULT 1,
  scheduled_for     timestamptz NOT NULL,
  sent_at           timestamptz,
  skipped_at        timestamptz,
  skip_reason       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tour_venue_id, followup_number)
);

ALTER TABLE followup_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Band admin manages own followup queue" ON followup_queue;
CREATE POLICY "Band admin manages own followup queue"
  ON followup_queue FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
        AND p.act_id = followup_queue.act_id
        AND p.role IN ('band_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
        AND p.act_id = followup_queue.act_id
        AND p.role IN ('band_admin', 'superadmin')
    )
  );

-- ============================================================
-- 4. updated_at trigger for followup_rules
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS followup_rules_updated_at ON followup_rules;
CREATE TRIGGER followup_rules_updated_at
  BEFORE UPDATE ON followup_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
