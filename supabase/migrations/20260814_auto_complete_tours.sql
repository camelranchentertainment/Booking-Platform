-- Called daily by the Vercel cron at /api/cron/tour-status.
-- Only ever touches tours in 'planning' or 'active'.
CREATE OR REPLACE FUNCTION auto_complete_tours()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_completed int;
  v_cancelled int;
BEGIN
  -- Case A: tour had real shows and they are all done.
  -- Requires at least one booking that reached 'confirmed' or 'completed',
  -- and no non-cancelled booking still scheduled for today or later.
  UPDATE tours
  SET    status     = 'completed',
         updated_at = now()
  WHERE  status IN ('planning', 'active')
    AND EXISTS (
      SELECT 1 FROM bookings b
      WHERE  b.tour_id = tours.id
        AND  b.status IN ('confirmed', 'completed')
    )
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE  b.tour_id = tours.id
        AND  b.status <> 'cancelled'
        AND  b.show_date >= CURRENT_DATE
    );

  GET DIAGNOSTICS v_completed = ROW_COUNT;

  -- Case B: tour's window passed, nothing ever materialized.
  -- We use 'cancelled' not 'completed': no confirmed/completed show ever
  -- existed, so 'completed' would falsely imply the tour actually ran.
  -- COALESCE(end_date, start_date) evaluates to NULL when both columns are
  -- NULL, making the < CURRENT_DATE comparison NULL (falsy) — undated tours
  -- (Case C) are excluded automatically without a separate condition.
  UPDATE tours
  SET    status     = 'cancelled',
         updated_at = now()
  WHERE  status IN ('planning', 'active')
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE  b.tour_id = tours.id
        AND  b.status IN ('confirmed', 'completed')
    )
    AND COALESCE(end_date, start_date) < CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM bookings b
      WHERE  b.tour_id = tours.id
        AND  b.status <> 'cancelled'
        AND  b.show_date >= CURRENT_DATE
    );

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  RETURN jsonb_build_object('completed', v_completed, 'cancelled', v_cancelled);
END;
$$;
