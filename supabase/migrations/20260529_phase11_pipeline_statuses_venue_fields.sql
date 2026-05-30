-- Phase 11: venue panel fields + 5-stage outreach pipeline (target→pitched→follow_up→confirmed/declined)

-- Issue 1: add missing venue columns
ALTER TABLE venues ADD COLUMN IF NOT EXISTS backline       BOOLEAN DEFAULT false;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS backline_notes TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS pay_notes      TEXT;

-- Issue 2: collapse to 5-stage outreach flow
--   reached_out → pitched
--   responded   → pitched  (merged: "waiting on response" was redundant)
--   waiting     → pitched  (same — catch any rows already renamed)
--   negotiating → follow_up
ALTER TABLE tour_venues DROP CONSTRAINT IF EXISTS tour_venues_status_check;

UPDATE tour_venues SET status = 'pitched'   WHERE status = 'reached_out';
UPDATE tour_venues SET status = 'pitched'   WHERE status = 'responded';
UPDATE tour_venues SET status = 'pitched'   WHERE status = 'waiting';
UPDATE tour_venues SET status = 'follow_up' WHERE status = 'negotiating';

ALTER TABLE tour_venues
  ADD CONSTRAINT tour_venues_status_check
  CHECK (status IN ('target','pitched','follow_up','confirmed','declined'));
ALTER TABLE tour_venues ALTER COLUMN status SET DEFAULT 'target';

-- Issue 3: backfill 12 emails sent May 25 — mark matched tour_venues as pitched
UPDATE tour_venues
SET status = 'pitched', updated_at = NOW()
WHERE id IN (
  SELECT DISTINCT tour_venue_id
  FROM email_log
  WHERE DATE(sent_at) = '2026-05-25'
    AND tour_venue_id IS NOT NULL
    AND (direction IS NULL OR direction <> 'received')
)
AND status = 'target';

NOTIFY pgrst, 'reload schema';
