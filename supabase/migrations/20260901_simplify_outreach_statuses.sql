-- Simplify outreach statuses to 5-stage manual workflow
-- Target / Follow Up / Confirm / Declined / Thank You

ALTER TABLE tour_venues
  DROP CONSTRAINT IF EXISTS tour_venues_status_check;

-- Convert legacy outreach statuses
UPDATE tour_venues
SET status = 'target',
    updated_at = NOW()
WHERE status IN ('pitched', 'reached_out');

UPDATE tour_venues
SET status = 'follow_up',
    updated_at = NOW()
WHERE status IN ('waiting', 'responded', 'negotiating');

-- Apply new 5-status constraint
ALTER TABLE tour_venues
  ADD CONSTRAINT tour_venues_status_check
  CHECK (
    status IN (
      'target',
      'follow_up',
      'confirmed',
      'declined',
      'thank_you'
    )
  );

ALTER TABLE tour_venues
  ALTER COLUMN status SET DEFAULT 'target';

NOTIFY pgrst, 'reload schema';