-- Configurable lookup values — manage from Supabase dashboard, no code deploys needed
-- Run in: Supabase dashboard → SQL Editor → New query → Run

CREATE TABLE IF NOT EXISTS lookup_values (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category   TEXT        NOT NULL,
  value      TEXT        NOT NULL,
  label      TEXT        NOT NULL,
  sort_order INTEGER     NOT NULL DEFAULT 0,
  color      TEXT,
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lookup_values_category_value_key UNIQUE (category, value)
);

ALTER TABLE lookup_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lookup_select" ON lookup_values
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lookup_insert" ON lookup_values
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'
  ));

CREATE POLICY "lookup_update" ON lookup_values
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'
  ));

CREATE POLICY "lookup_delete" ON lookup_values
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'
  ));

-- ── Seed data ──────────────────────────────────────────────────────────────────

INSERT INTO lookup_values (category, value, label, sort_order, color) VALUES

  -- Genres
  ('genre', 'Rock',              'Rock',              1,  NULL),
  ('genre', 'Country',           'Country',           2,  NULL),
  ('genre', 'Americana',         'Americana',         3,  NULL),
  ('genre', 'Folk',              'Folk',              4,  NULL),
  ('genre', 'Blues',             'Blues',             5,  NULL),
  ('genre', 'Jazz',              'Jazz',              6,  NULL),
  ('genre', 'Pop',               'Pop',               7,  NULL),
  ('genre', 'Hip-Hop',           'Hip-Hop',           8,  NULL),
  ('genre', 'R&B',               'R&B',               9,  NULL),
  ('genre', 'Soul',              'Soul',              10, NULL),
  ('genre', 'Metal',             'Metal',             11, NULL),
  ('genre', 'Punk',              'Punk',              12, NULL),
  ('genre', 'Electronic',        'Electronic',        13, NULL),
  ('genre', 'Singer-Songwriter', 'Singer-Songwriter', 14, NULL),
  ('genre', 'Other',             'Other',             99, NULL),

  -- Venue types
  ('venue_type', 'bar',          'Bar',          1,  NULL),
  ('venue_type', 'club',         'Club',         2,  NULL),
  ('venue_type', 'concert_hall', 'Concert Hall', 3,  NULL),
  ('venue_type', 'festival',     'Festival',     4,  NULL),
  ('venue_type', 'restaurant',   'Restaurant',   5,  NULL),
  ('venue_type', 'winery',       'Winery',       6,  NULL),
  ('venue_type', 'outdoor',      'Outdoor',      7,  NULL),
  ('venue_type', 'theater',      'Theater',      8,  NULL),
  ('venue_type', 'other',        'Other',        99, NULL),

  -- Booking statuses (color = fallback when CSS var is unavailable)
  ('booking_status', 'pitch',       'Pitch',       1, '#64748b'),
  ('booking_status', 'followup',    'Follow-up',   2, '#818cf8'),
  ('booking_status', 'negotiation', 'Negotiation', 3, '#f59e0b'),
  ('booking_status', 'hold',        'Hold',        4, '#fb923c'),
  ('booking_status', 'contract',    'Contract',    5, '#a78bfa'),
  ('booking_status', 'confirmed',   'Confirmed',   6, '#34d399'),
  ('booking_status', 'advancing',   'Advancing',   7, '#00e5ff'),
  ('booking_status', 'completed',   'Completed',   8, '#6b7280'),
  ('booking_status', 'cancelled',   'Cancelled',   9, '#ef4444'),

  -- Tour statuses
  ('tour_status', 'planning',  'Planning',  1, '#818cf8'),
  ('tour_status', 'active',    'Active',    2, '#34d399'),
  ('tour_status', 'completed', 'Completed', 3, '#9ca3af'),
  ('tour_status', 'cancelled', 'Cancelled', 4, '#6b7280'),

  -- Deal types (used in booking forms)
  ('deal_type', 'flat_fee',          'Flat Fee',          1, NULL),
  ('deal_type', 'door_deal',         'Door Deal',         2, NULL),
  ('deal_type', 'guarantee_vs_door', 'Guarantee vs Door', 3, NULL),
  ('deal_type', 'percentage',        'Percentage',        4, NULL),
  ('deal_type', 'trade',             'Trade',             5, NULL)

ON CONFLICT (category, value) DO NOTHING;
