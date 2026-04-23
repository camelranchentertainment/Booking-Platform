-- Colorado Venue Import — 17 venues across 5 markets
-- Account: grueneroadcase@gmail.com  (also tries grueneroadcases@gmail.com)
-- Run in Supabase SQL Editor

DO $$
DECLARE
  v_uid uuid;
  v_id  uuid;
BEGIN

  -- Locate the agent user (handles typo with/without trailing s)
  SELECT id INTO v_uid FROM auth.users
  WHERE email IN ('grueneroadcase@gmail.com', 'grueneroadcases@gmail.com')
  ORDER BY created_at DESC LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'User not found — check email spelling in auth.users';
  END IF;

  RAISE NOTICE 'Importing venues for user %', v_uid;

  -- ─────────────────────────────────────────
  -- FORT COLLINS / LAPORTE
  -- ─────────────────────────────────────────

  -- 01. Horsetooth Tavern
  INSERT INTO venues (agent_id, name, address, city, state, phone, venue_type, notes, source, country)
  SELECT v_uid, 'Horsetooth Tavern', '4791 W County Rd 38 E', 'Fort Collins', 'CO',
         '(970) 229-0022', 'bar', 'Mountain tavern with live music & patio', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'Horsetooth Tavern' AND city = 'Fort Collins'
  );

  -- 02. Swing Station
  INSERT INTO venues (agent_id, name, address, city, state, phone, venue_type, notes, source, country)
  SELECT v_uid, 'Swing Station', '3311 Co Rd 54G', 'Laporte', 'CO',
         '(970) 224-3326', 'bar', 'Honky tonk / live music — Laporte (5 min N of Fort Collins)', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'Swing Station' AND city = 'Laporte'
  )
  RETURNING id INTO v_id;

  -- Swing Station contact: Heather (Owner)
  IF v_id IS NOT NULL THEN
    INSERT INTO contacts (agent_id, venue_id, first_name, last_name, title, status)
    VALUES (v_uid, v_id, 'Heather', '', 'Owner', 'not_contacted')
    ON CONFLICT DO NOTHING;
  END IF;
  v_id := NULL;

  -- 03. Avogadro's Number
  INSERT INTO venues (agent_id, name, address, city, state, phone, venue_type, notes, source, country)
  SELECT v_uid, 'Avogadro''s Number', '605 S Mason St', 'Fort Collins', 'CO',
         '(970) 493-5555', 'bar', 'Indoor/outdoor stages, live music Thu–Mon. Contact via avogadros.com', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'Avogadro''s Number' AND city = 'Fort Collins'
  );

  -- ─────────────────────────────────────────
  -- DENVER
  -- ─────────────────────────────────────────

  -- 04. Larimer Lounge
  INSERT INTO venues (agent_id, name, address, city, state, phone, email, venue_type, capacity, notes, source, country)
  SELECT v_uid, 'Larimer Lounge', '2721 Larimer St', 'Denver', 'CO',
         '(303) 291-1007', 'info@larimerlounge.com', 'club', 250,
         'RiNo indie rock club. Booking contacts: Haylee & Jackson.', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'Larimer Lounge' AND city = 'Denver'
  )
  RETURNING id INTO v_id;

  -- Larimer Lounge contacts: Haylee and Jackson
  IF v_id IS NOT NULL THEN
    INSERT INTO contacts (agent_id, venue_id, first_name, last_name, title, email, status)
    VALUES (v_uid, v_id, 'Haylee', '', 'Booking', 'haylee@larimerlounge.com', 'not_contacted'),
           (v_uid, v_id, 'Jackson', '', 'Booking', 'jackson@larimerlounge.com', 'not_contacted')
    ON CONFLICT DO NOTHING;
  END IF;
  v_id := NULL;

  -- 05. The Soiled Dove Underground
  INSERT INTO venues (agent_id, name, address, city, state, phone, venue_type, notes, source, country)
  SELECT v_uid, 'The Soiled Dove Underground', '7401 E 1st Ave', 'Denver', 'CO',
         '(303) 226-1555', 'club',
         'POSSIBLY CLOSED — verify before outreach. Yelp lists as closed.', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'The Soiled Dove Underground' AND city = 'Denver'
  )
  RETURNING id INTO v_id;

  -- Soiled Dove contact: Tami McLaughlin
  IF v_id IS NOT NULL THEN
    INSERT INTO contacts (agent_id, venue_id, first_name, last_name, title, status, notes)
    VALUES (v_uid, v_id, 'Tami', 'McLaughlin', 'Group Sales', 'not_contacted', 'Ext. 101')
    ON CONFLICT DO NOTHING;
  END IF;
  v_id := NULL;

  -- 06. Hi-Dive
  INSERT INTO venues (agent_id, name, address, city, state, phone, email, venue_type, capacity, notes, source, country)
  SELECT v_uid, 'Hi-Dive', '7 S Broadway', 'Denver', 'CO',
         '(303) 733-0230', 'booking@hi-dive.com', 'bar', 260,
         'Baker neighborhood dive/rock club since 2003.', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'Hi-Dive' AND city = 'Denver'
  )
  RETURNING id INTO v_id;

  -- Hi-Dive contact: Curt
  IF v_id IS NOT NULL THEN
    INSERT INTO contacts (agent_id, venue_id, first_name, last_name, email, status)
    VALUES (v_uid, v_id, 'Curt', '', 'curt@hi-dive.com', 'not_contacted')
    ON CONFLICT DO NOTHING;
  END IF;
  v_id := NULL;

  -- 07. Globe Hall Live Music & BBQ
  INSERT INTO venues (agent_id, name, address, city, state, phone, email, venue_type, capacity, notes, source, country)
  SELECT v_uid, 'Globe Hall Live Music & BBQ', '4483 Logan St', 'Denver', 'CO',
         '(303) 296-1003', 'info@globehall.com', 'bar', 250,
         'RiNo / Globeville. 1903 building, BBQ + live music. Ph ext 100.', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'Globe Hall Live Music & BBQ' AND city = 'Denver'
  );

  -- ─────────────────────────────────────────
  -- GREELEY
  -- ─────────────────────────────────────────

  -- 08. Moxi Theater
  INSERT INTO venues (agent_id, name, address, city, state, phone, email, venue_type, capacity, notes, source, country)
  SELECT v_uid, 'Moxi Theater', '802 9th St', 'Greeley', 'CO',
         '(970) 584-3054', 'moxitheater@gmail.com', 'theater', 380,
         'Downtown Greeley''s premier live music venue since 2013. Upstairs.', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'Moxi Theater' AND city = 'Greeley'
  );

  -- ─────────────────────────────────────────
  -- STEAMBOAT SPRINGS
  -- ─────────────────────────────────────────

  -- 09. Schmiggity's Live Music & Dance Bar
  INSERT INTO venues (agent_id, name, address, city, state, phone, email, venue_type, capacity, notes, source, country)
  SELECT v_uid, 'Schmiggity''s Live Music & Dance Bar', '821 Lincoln Ave', 'Steamboat Springs', 'CO',
         '(970) 879-4100', 'schmiggitys@gmail.com', 'club', 200,
         'Steamboat''s only dedicated live music/dance club.', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'Schmiggity''s Live Music & Dance Bar' AND city = 'Steamboat Springs'
  );

  -- 10. Old Town Pub & Restaurant
  INSERT INTO venues (agent_id, name, address, city, state, phone, venue_type, capacity, notes, source, country)
  SELECT v_uid, 'Old Town Pub & Restaurant', '600 Lincoln Ave', 'Steamboat Springs', 'CO',
         '(970) 879-2101', 'bar', 275,
         '107-year-old landmark. Live music Thu–Sat (winter: 7 nights). Contact via otpsteamboat.com', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'Old Town Pub & Restaurant' AND city = 'Steamboat Springs'
  );

  -- 11. The Boathouse
  INSERT INTO venues (agent_id, name, address, city, state, phone, email, venue_type, notes, source, country)
  SELECT v_uid, 'The Boathouse', '609 Yampa St', 'Steamboat Springs', 'CO',
         '(970) 527-1200', 'info@theboathousesteamboat.com', 'event_space',
         'Yampa River event venue — private/corporate events + live music.', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'The Boathouse' AND city = 'Steamboat Springs'
  );

  -- ─────────────────────────────────────────
  -- VAIL
  -- ─────────────────────────────────────────

  -- 12. King's Club (Sonnenalp Hotel)
  INSERT INTO venues (agent_id, name, address, city, state, phone, venue_type, notes, source, country)
  SELECT v_uid, 'King''s Club', '20 Vail Rd (Sonnenalp Hotel)', 'Vail', 'CO',
         '(970) 479-5429', 'club',
         'Inside Sonnenalp Hotel. Nightly live music 7pm, après-ski lounge. Contact via sonnenalp.com', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'King''s Club' AND city = 'Vail'
  );

  -- 13. Red Lion
  INSERT INTO venues (agent_id, name, address, city, state, phone, email, venue_type, notes, source, country)
  SELECT v_uid, 'Red Lion', '304 Bridge St, Ste 1', 'Vail', 'CO',
         '(970) 476-7676', 'theredlion68@gmail.com', 'bar',
         'Vail Village landmark since 1962 — live music nightly, patio.', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'Red Lion' AND city = 'Vail'
  );

  -- ─────────────────────────────────────────
  -- BRECKENRIDGE
  -- ─────────────────────────────────────────

  -- 14. Breckenridge Brewery & Pub
  INSERT INTO venues (agent_id, name, address, city, state, phone, venue_type, notes, source, country)
  SELECT v_uid, 'Breckenridge Brewery & Pub', '600 S Main St', 'Breckenridge', 'CO',
         '(970) 453-1550', 'brewery',
         'Original brewpub since 1990 (now AB-InBev). Contact form at breckbrew.com/contact', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'Breckenridge Brewery & Pub' AND city = 'Breckenridge'
  );

  -- 15. The Blue Stag Saloon
  INSERT INTO venues (agent_id, name, address, city, state, phone, email, venue_type, notes, source, country)
  SELECT v_uid, 'The Blue Stag Saloon', '323 S Main St', 'Breckenridge', 'CO',
         '(970) 453-2221', 'bluestagbreckenridge@gmail.com', 'bar',
         'Live music / DJ weekly, wood-fired pizza, 40+ craft brews.', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'The Blue Stag Saloon' AND city = 'Breckenridge'
  );

  -- 16. Breckenridge Tap House
  INSERT INTO venues (agent_id, name, address, city, state, phone, email, venue_type, notes, source, country)
  SELECT v_uid, 'Breckenridge Tap House', '105 N Main St', 'Breckenridge', 'CO',
         '(970) 453-2167', 'contact@breckenridgetaphouse.com', 'bar',
         '37 taps, gourmet Mexican, event-friendly. Historic 1873 building.', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'Breckenridge Tap House' AND city = 'Breckenridge'
  );

  -- 17. Motherloaded Tavern
  INSERT INTO venues (agent_id, name, address, city, state, phone, venue_type, notes, source, country)
  SELECT v_uid, 'Motherloaded Tavern', '103 S Main St', 'Breckenridge', 'CO',
         '(970) 453-2572', 'bar',
         'Live music Thu–Sun + open mic Mon, comfort food, 2 bars. Contact via motherloadedtavern.com', 'import', 'US'
  WHERE NOT EXISTS (
    SELECT 1 FROM venues WHERE agent_id = v_uid AND name = 'Motherloaded Tavern' AND city = 'Breckenridge'
  );

  RAISE NOTICE 'Colorado venue import complete.';
END $$;
