-- Cleanup remaining duplicate venues caused by city name abbreviations and name variations
-- Keeps the record with the most data; deletes the weaker duplicate.
-- Safe to run multiple times.
-- Account: grueneroadcase@gmail.com
-- Run in Supabase SQL Editor

DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users
  WHERE email IN ('grueneroadcase@gmail.com', 'grueneroadcases@gmail.com')
  ORDER BY created_at DESC LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- ── Aggie Theatre ──
  -- Keep "Fort Collins", delete "Ft collins"
  UPDATE venues SET phone = COALESCE(NULLIF(phone, ''), '(970) 482-8300')
  WHERE agent_id = v_uid AND lower(name) = 'aggie theatre' AND lower(city) = 'fort collins';

  DELETE FROM venues
  WHERE agent_id = v_uid AND lower(name) = 'aggie theatre' AND lower(trim(city)) = 'ft collins';

  RAISE NOTICE 'Aggie Theatre: Ft collins duplicate removed.';

  -- ── Globe Hall ──
  -- Keep "Globe Hall Live Music & BBQ", delete "Globe Hall Live Music and BBQ"
  DELETE FROM venues
  WHERE agent_id = v_uid AND lower(name) = 'globe hall live music and bbq' AND lower(city) = 'denver';

  RAISE NOTICE 'Globe Hall: "and" variant removed.';

  -- ── Old Town Pub & Restaurant ──
  -- Keep "Steamboat Springs" (has type + capacity), delete "Steamboat"
  DELETE FROM venues
  WHERE agent_id = v_uid AND lower(name) = 'old town pub & restaurant' AND lower(trim(city)) = 'steamboat';

  RAISE NOTICE 'Old Town Pub: Steamboat (abbrev) duplicate removed.';

  -- ── Schmiggity's Live Music & Dance Bar ──
  -- Keep "Steamboat Springs" (has type, capacity, email), delete "Steamboat"
  DELETE FROM venues
  WHERE agent_id = v_uid
    AND lower(name) LIKE 'schmiggity%'
    AND lower(trim(city)) = 'steamboat';

  RAISE NOTICE 'Schmiggity''s: Steamboat (abbrev) duplicate removed.';

  -- ── Swing Station ──
  -- Correct location is Laporte, CO — delete the Fort Collins and Ft collins entries
  DELETE FROM venues
  WHERE agent_id = v_uid AND lower(name) = 'swing station'
    AND lower(trim(city)) IN ('fort collins', 'ft collins');

  RAISE NOTICE 'Swing Station: Fort Collins / Ft collins duplicates removed.';

  -- ── The Boathouse ──
  -- Keep "Steamboat Springs" (has type + email), delete "Steamboat"
  DELETE FROM venues
  WHERE agent_id = v_uid AND lower(name) = 'the boathouse' AND lower(trim(city)) = 'steamboat';

  RAISE NOTICE 'The Boathouse: Steamboat (abbrev) duplicate removed.';

  -- ── The Mishawaka ──
  -- Keep "Fort Collins", delete "Ft collins"
  UPDATE venues SET phone = COALESCE(NULLIF(phone, ''), '(888) 843-6474')
  WHERE agent_id = v_uid AND lower(name) = 'the mishawaka' AND lower(city) = 'fort collins';

  DELETE FROM venues
  WHERE agent_id = v_uid AND lower(name) = 'the mishawaka' AND lower(trim(city)) = 'ft collins';

  RAISE NOTICE 'The Mishawaka: Ft collins duplicate removed.';

  -- ── Fix venue_type where it was missed on update ──
  UPDATE venues SET venue_type = 'bar'
  WHERE agent_id = v_uid AND lower(name) = 'hi-dive' AND lower(city) = 'denver' AND (venue_type IS NULL OR venue_type = '');

  UPDATE venues SET venue_type = 'bar'
  WHERE agent_id = v_uid AND lower(name) = 'horsetooth tavern' AND lower(city) = 'fort collins' AND (venue_type IS NULL OR venue_type = '');

  -- ── Normalize city name capitalisation on surviving records ──
  UPDATE venues SET city = 'Fort Collins'
  WHERE agent_id = v_uid AND lower(trim(city)) = 'fort collins' AND city != 'Fort Collins';

  UPDATE venues SET city = 'Breckenridge'
  WHERE agent_id = v_uid AND lower(trim(city)) = 'breckenridge' AND city != 'Breckenridge';

  UPDATE venues SET city = 'Steamboat Springs'
  WHERE agent_id = v_uid AND lower(trim(city)) = 'steamboat springs' AND city != 'Steamboat Springs';

  RAISE NOTICE 'City names normalised.';

  RAISE NOTICE '✓ All duplicate cleanup complete.';
END $$;
