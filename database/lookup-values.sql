-- Database-driven config: replaces hardcoded TypeScript arrays
-- Run in: Supabase dashboard → SQL Editor
-- IMPORTANT: booking_status values must match the booking_status ENUM in schema-v2.sql
-- IMPORTANT: tour_status values must match the tours CHECK constraint in schema-v2.sql

CREATE TABLE IF NOT EXISTS lookup_values (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL,
  value       TEXT NOT NULL,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  color       TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(category, value)
);

ALTER TABLE lookup_values ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read; superadmin can write
CREATE POLICY "lookup_values_read" ON lookup_values
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lookup_values_write" ON lookup_values
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'));

-- ── Genres ────────────────────────────────────────────────────────────────────
INSERT INTO lookup_values (category, value, label, sort_order) VALUES
  ('genre', 'country',        'Country',        1),
  ('genre', 'country_rock',   'Country Rock',   2),
  ('genre', 'americana',      'Americana',      3),
  ('genre', 'bluegrass',      'Bluegrass',      4),
  ('genre', 'honky_tonk',     'Honky Tonk',     5),
  ('genre', 'outlaw_country', 'Outlaw Country', 6),
  ('genre', 'southern_rock',  'Southern Rock',  7),
  ('genre', 'folk',           'Folk',           8),
  ('genre', 'red_dirt',       'Red Dirt',       9),
  ('genre', 'blues',          'Blues',         10),
  ('genre', 'rock',           'Rock',          11),
  ('genre', 'pop',            'Pop',           12),
  ('genre', 'r_and_b',        'R&B',           13),
  ('genre', 'jazz',           'Jazz',          14),
  ('genre', 'other',          'Other',         15)
ON CONFLICT (category, value) DO NOTHING;

-- ── Venue types ───────────────────────────────────────────────────────────────
INSERT INTO lookup_values (category, value, label, sort_order) VALUES
  ('venue_type', 'honky_tonk',      'Honky Tonk',     1),
  ('venue_type', 'bar',             'Bar / Tavern',    2),
  ('venue_type', 'roadhouse',       'Roadhouse',       3),
  ('venue_type', 'concert_hall',    'Concert Hall',    4),
  ('venue_type', 'amphitheater',    'Amphitheater',    5),
  ('venue_type', 'festival_ground', 'Festival Ground', 6),
  ('venue_type', 'casino',          'Casino',          7),
  ('venue_type', 'private_event',   'Private / Event', 8),
  ('venue_type', 'other',           'Other',           9)
ON CONFLICT (category, value) DO NOTHING;

-- ── Booking statuses ──────────────────────────────────────────────────────────
-- These values MUST match the booking_status ENUM defined in schema-v2.sql:
-- CREATE TYPE booking_status AS ENUM ('pitch','followup','negotiation','hold',
--   'contract','confirmed','advancing','completed','cancelled');
INSERT INTO lookup_values (category, value, label, sort_order, color) VALUES
  ('booking_status', 'pitch',       'Pitch',       1, '#818cf8'),
  ('booking_status', 'followup',    'Follow-up',   2, '#a78bfa'),
  ('booking_status', 'negotiation', 'Negotiation', 3, '#fbbf24'),
  ('booking_status', 'hold',        'Hold',        4, '#f59e0b'),
  ('booking_status', 'contract',    'Contract',    5, '#fb923c'),
  ('booking_status', 'confirmed',   'Confirmed',   6, '#34d399'),
  ('booking_status', 'advancing',   'Advancing',   7, '#10b981'),
  ('booking_status', 'completed',   'Completed',   8, '#6ee7b7'),
  ('booking_status', 'cancelled',   'Cancelled',   9, '#f87171')
ON CONFLICT (category, value) DO NOTHING;

-- ── Tour statuses ─────────────────────────────────────────────────────────────
-- These values MUST match the tours CHECK constraint in schema-v2.sql:
-- CHECK (status IN ('planning','active','completed','cancelled'))
INSERT INTO lookup_values (category, value, label, sort_order, color) VALUES
  ('tour_status', 'planning',  'Planning',  1, '#818cf8'),
  ('tour_status', 'active',    'Active',    2, '#fbbf24'),
  ('tour_status', 'completed', 'Completed', 3, '#34d399'),
  ('tour_status', 'cancelled', 'Cancelled', 4, '#f87171')
ON CONFLICT (category, value) DO NOTHING;

-- ── Deal types ────────────────────────────────────────────────────────────────
INSERT INTO lookup_values (category, value, label, sort_order) VALUES
  ('deal_type', 'flat',       'Flat Fee',      1),
  ('deal_type', 'door',       'Door Deal',     2),
  ('deal_type', 'versus',     'Flat vs. %',    3),
  ('deal_type', 'percentage', '% of Gross',    4),
  ('deal_type', 'trade',      'Trade / Barter', 5)
ON CONFLICT (category, value) DO NOTHING;
