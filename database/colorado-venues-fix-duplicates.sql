-- Colorado Venues: Remove duplicates and update originals with correct info
-- Run in Supabase SQL Editor

DO $$
DECLARE
  v_uid uuid;
  v_vid uuid;
BEGIN

  SELECT id INTO v_uid FROM auth.users
  WHERE email IN ('grueneroadcase@gmail.com', 'grueneroadcases@gmail.com')
  ORDER BY created_at DESC LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- ── Step 1: Remove duplicate venues (keep the oldest row per name+city) ──
  DELETE FROM venues
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY agent_id, lower(trim(name)), lower(trim(city))
               ORDER BY created_at ASC
             ) AS rn
      FROM venues
      WHERE agent_id = v_uid
    ) ranked
    WHERE rn > 1
  );

  RAISE NOTICE 'Duplicates removed.';

  -- ── Step 2: Remove duplicate contacts for this user's venues ──
  DELETE FROM contacts
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY venue_id, lower(trim(first_name)), lower(trim(coalesce(last_name,'')))
               ORDER BY created_at ASC
             ) AS rn
      FROM contacts
      WHERE agent_id = v_uid
    ) ranked
    WHERE rn > 1
  );

  RAISE NOTICE 'Duplicate contacts removed.';

  -- ── Step 3: Update each venue with correct information ──

  UPDATE venues SET address = '4791 W County Rd 38 E', phone = '(970) 229-0022',
    notes = 'Mountain tavern with live music & patio'
  WHERE agent_id = v_uid AND lower(name) = lower('Horsetooth Tavern') AND lower(city) = lower('Fort Collins');

  UPDATE venues SET address = '3311 Co Rd 54G', phone = '(970) 224-3326',
    notes = 'Honky tonk / live music — Laporte (5 min N of Fort Collins)'
  WHERE agent_id = v_uid AND lower(name) = lower('Swing Station') AND lower(city) = lower('Laporte');

  UPDATE venues SET address = '605 S Mason St', phone = '(970) 493-5555',
    notes = 'Indoor/outdoor stages, live music Thu–Mon. Contact via avogadros.com'
  WHERE agent_id = v_uid AND lower(name) = lower('Avogadro''s Number') AND lower(city) = lower('Fort Collins');

  UPDATE venues SET address = '2721 Larimer St', phone = '(303) 291-1007',
    email = 'info@larimerlounge.com', capacity = 250,
    notes = 'RiNo indie rock club. Booking contacts: Haylee & Jackson.'
  WHERE agent_id = v_uid AND lower(name) = lower('Larimer Lounge') AND lower(city) = lower('Denver');

  UPDATE venues SET address = '7401 E 1st Ave', phone = '(303) 226-1555',
    notes = 'POSSIBLY CLOSED — verify before outreach. Yelp lists as closed.'
  WHERE agent_id = v_uid AND lower(name) = lower('The Soiled Dove Underground') AND lower(city) = lower('Denver');

  UPDATE venues SET address = '7 S Broadway', phone = '(303) 733-0230',
    email = 'booking@hi-dive.com', capacity = 260,
    notes = 'Baker neighborhood dive/rock club since 2003.'
  WHERE agent_id = v_uid AND lower(name) = lower('Hi-Dive') AND lower(city) = lower('Denver');

  UPDATE venues SET address = '4483 Logan St', phone = '(303) 296-1003',
    email = 'info@globehall.com', capacity = 250,
    notes = 'RiNo / Globeville. 1903 building, BBQ + live music. Ph ext 100.'
  WHERE agent_id = v_uid AND lower(name) = lower('Globe Hall Live Music & BBQ') AND lower(city) = lower('Denver');

  UPDATE venues SET address = '802 9th St', phone = '(970) 584-3054',
    email = 'moxitheater@gmail.com', capacity = 380,
    notes = 'Downtown Greeley''s premier live music venue since 2013. Upstairs.'
  WHERE agent_id = v_uid AND lower(name) = lower('Moxi Theater') AND lower(city) = lower('Greeley');

  UPDATE venues SET address = '821 Lincoln Ave', phone = '(970) 879-4100',
    email = 'schmiggitys@gmail.com', capacity = 200,
    notes = 'Steamboat''s only dedicated live music/dance club.'
  WHERE agent_id = v_uid AND lower(name) = lower('Schmiggity''s Live Music & Dance Bar') AND lower(city) = lower('Steamboat Springs');

  UPDATE venues SET address = '600 Lincoln Ave', phone = '(970) 879-2101', capacity = 275,
    notes = '107-year-old landmark. Live music Thu–Sat (winter: 7 nights). Contact via otpsteamboat.com'
  WHERE agent_id = v_uid AND lower(name) = lower('Old Town Pub & Restaurant') AND lower(city) = lower('Steamboat Springs');

  UPDATE venues SET address = '609 Yampa St', phone = '(970) 527-1200',
    email = 'info@theboathousesteamboat.com',
    notes = 'Yampa River event venue — private/corporate events + live music.'
  WHERE agent_id = v_uid AND lower(name) = lower('The Boathouse') AND lower(city) = lower('Steamboat Springs');

  UPDATE venues SET address = '20 Vail Rd (Sonnenalp Hotel)', phone = '(970) 479-5429',
    notes = 'Inside Sonnenalp Hotel. Nightly live music 7pm, après-ski lounge. Contact via sonnenalp.com'
  WHERE agent_id = v_uid AND lower(name) = lower('King''s Club') AND lower(city) = lower('Vail');

  UPDATE venues SET address = '304 Bridge St, Ste 1', phone = '(970) 476-7676',
    email = 'theredlion68@gmail.com',
    notes = 'Vail Village landmark since 1962 — live music nightly, patio.'
  WHERE agent_id = v_uid AND lower(name) = lower('Red Lion') AND lower(city) = lower('Vail');

  UPDATE venues SET address = '600 S Main St', phone = '(970) 453-1550',
    notes = 'Original brewpub since 1990 (now AB-InBev). Contact form at breckbrew.com/contact'
  WHERE agent_id = v_uid AND lower(name) = lower('Breckenridge Brewery & Pub') AND lower(city) = lower('Breckenridge');

  UPDATE venues SET address = '323 S Main St', phone = '(970) 453-2221',
    email = 'bluestagbreckenridge@gmail.com',
    notes = 'Live music / DJ weekly, wood-fired pizza, 40+ craft brews.'
  WHERE agent_id = v_uid AND lower(name) = lower('The Blue Stag Saloon') AND lower(city) = lower('Breckenridge');

  UPDATE venues SET address = '105 N Main St', phone = '(970) 453-2167',
    email = 'contact@breckenridgetaphouse.com',
    notes = '37 taps, gourmet Mexican, event-friendly. Historic 1873 building.'
  WHERE agent_id = v_uid AND lower(name) = lower('Breckenridge Tap House') AND lower(city) = lower('Breckenridge');

  UPDATE venues SET address = '103 S Main St', phone = '(970) 453-2572',
    notes = 'Live music Thu–Sun + open mic Mon, comfort food, 2 bars. Contact via motherloadedtavern.com'
  WHERE agent_id = v_uid AND lower(name) = lower('Motherloaded Tavern') AND lower(city) = lower('Breckenridge');

  RAISE NOTICE 'All venue records updated.';

  -- ── Step 4: Ensure contacts exist (upsert-safe inserts) ──

  -- Swing Station — Heather (Owner)
  SELECT id INTO v_vid FROM venues WHERE agent_id = v_uid AND lower(name) = lower('Swing Station') AND lower(city) = lower('Laporte') LIMIT 1;
  IF v_vid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contacts WHERE venue_id = v_vid AND lower(first_name) = 'heather') THEN
    INSERT INTO contacts (agent_id, venue_id, first_name, last_name, title, status) VALUES (v_uid, v_vid, 'Heather', '', 'Owner', 'not_contacted');
  END IF;

  -- Larimer Lounge — Haylee
  SELECT id INTO v_vid FROM venues WHERE agent_id = v_uid AND lower(name) = lower('Larimer Lounge') AND lower(city) = lower('Denver') LIMIT 1;
  IF v_vid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contacts WHERE venue_id = v_vid AND lower(first_name) = 'haylee') THEN
    INSERT INTO contacts (agent_id, venue_id, first_name, last_name, title, email, status) VALUES (v_uid, v_vid, 'Haylee', '', 'Booking', 'haylee@larimerlounge.com', 'not_contacted');
  END IF;
  IF v_vid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contacts WHERE venue_id = v_vid AND lower(first_name) = 'jackson') THEN
    INSERT INTO contacts (agent_id, venue_id, first_name, last_name, title, email, status) VALUES (v_uid, v_vid, 'Jackson', '', 'Booking', 'jackson@larimerlounge.com', 'not_contacted');
  END IF;

  -- Soiled Dove — Tami McLaughlin
  SELECT id INTO v_vid FROM venues WHERE agent_id = v_uid AND lower(name) = lower('The Soiled Dove Underground') AND lower(city) = lower('Denver') LIMIT 1;
  IF v_vid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contacts WHERE venue_id = v_vid AND lower(last_name) = 'mclaughlin') THEN
    INSERT INTO contacts (agent_id, venue_id, first_name, last_name, title, status, notes) VALUES (v_uid, v_vid, 'Tami', 'McLaughlin', 'Group Sales', 'not_contacted', 'Ext. 101');
  END IF;

  -- Hi-Dive — Curt
  SELECT id INTO v_vid FROM venues WHERE agent_id = v_uid AND lower(name) = lower('Hi-Dive') AND lower(city) = lower('Denver') LIMIT 1;
  IF v_vid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contacts WHERE venue_id = v_vid AND lower(first_name) = 'curt') THEN
    INSERT INTO contacts (agent_id, venue_id, first_name, last_name, email, status) VALUES (v_uid, v_vid, 'Curt', '', 'curt@hi-dive.com', 'not_contacted');
  END IF;

  RAISE NOTICE 'Done. Duplicates removed, venues updated, contacts verified.';
END $$;
