-- =============================================================
-- PENDING MIGRATIONS — Camel Ranch Booking
-- Generated: 2026-04-28 by autonomous audit
-- Run these in order in: Supabase Dashboard → SQL Editor
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. BOOKINGS — Phase 3 columns
--    (schema-v2.sql only has the Phase 1 base columns)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS deal_type               TEXT
    CHECK (deal_type IN ('guarantee','door_split','percentage','flat_fee','other')),
  ADD COLUMN IF NOT EXISTS agreed_amount           NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS actual_amount_received  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS payment_status          TEXT DEFAULT 'pending'
    CHECK (payment_status IN ('pending','partial','received','waived')),
  ADD COLUMN IF NOT EXISTS date_paid               DATE,
  ADD COLUMN IF NOT EXISTS details_pending         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confirmed_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settled_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS soundcheck_time         TIME,
  ADD COLUMN IF NOT EXISTS end_time                TIME,
  ADD COLUMN IF NOT EXISTS meals_provided          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS drinks_provided         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hotel_booked            BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lodging_details         TEXT,
  ADD COLUMN IF NOT EXISTS sound_system            TEXT
    CHECK (sound_system IN ('house','self','none')),
  ADD COLUMN IF NOT EXISTS venue_contact_name      TEXT,
  ADD COLUMN IF NOT EXISTS rebook_flag             TEXT
    CHECK (rebook_flag IN ('yes','no','maybe')),
  ADD COLUMN IF NOT EXISTS post_show_notes         TEXT,
  ADD COLUMN IF NOT EXISTS issue_notes             TEXT,
  ADD COLUMN IF NOT EXISTS special_requirements    TEXT,
  ADD COLUMN IF NOT EXISTS source                  TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS agent_id                UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_show_date   ON bookings(show_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status      ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_agent_id    ON bookings(agent_id);


-- ─────────────────────────────────────────────────────────────
-- 2. VENUES — Phase 3 columns
--    (schema-v2.sql venues table is missing these)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS music_genres      TEXT[],
  ADD COLUMN IF NOT EXISTS secondary_emails  TEXT[],
  ADD COLUMN IF NOT EXISTS rebook_flag       TEXT
    CHECK (rebook_flag IN ('yes','no','maybe')),
  ADD COLUMN IF NOT EXISTS issue_notes       TEXT;


-- ─────────────────────────────────────────────────────────────
-- 3. DAILY NOTES table
--    Referenced in pages/api/notes/index.ts and pages/today.tsx
--    but no CREATE TABLE exists in any schema file.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_notes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  act_id       UUID REFERENCES acts(id) ON DELETE SET NULL,
  tour_id      UUID REFERENCES tours(id) ON DELETE SET NULL,
  note_date    DATE NOT NULL,
  content      TEXT NOT NULL DEFAULT '',
  visibility   TEXT NOT NULL DEFAULT 'agent_only'
    CHECK (visibility IN ('agent_only','band_admin','all_members')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, note_date)
);

ALTER TABLE daily_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "daily_notes_owner_all" ON daily_notes
    FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "daily_notes_band_admin_read" ON daily_notes
    FOR SELECT USING (
      visibility IN ('band_admin','all_members')
      AND act_id IN (
        SELECT id FROM acts WHERE owner_id = auth.uid()
        UNION
        SELECT act_id FROM user_profiles WHERE id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "daily_notes_member_read" ON daily_notes
    FOR SELECT USING (
      visibility = 'all_members'
      AND act_id IN (
        SELECT act_id FROM user_profiles WHERE id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_daily_notes_user_date  ON daily_notes(user_id, note_date);
CREATE INDEX IF NOT EXISTS idx_daily_notes_tour_id    ON daily_notes(tour_id);
CREATE INDEX IF NOT EXISTS idx_daily_notes_act_id     ON daily_notes(act_id);


-- ─────────────────────────────────────────────────────────────
-- 4. EXPENSES table
--    Referenced in pages/api/expenses/index.ts and pages/financials.tsx
--    but no CREATE TABLE exists in any schema file.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_id       UUID REFERENCES tours(id) ON DELETE SET NULL,
  booking_id    UUID REFERENCES bookings(id) ON DELETE SET NULL,
  expense_date  DATE NOT NULL,
  category      TEXT NOT NULL
    CHECK (category IN (
      'Gas / Mileage','Hotel / Lodging','Band Member Payments',
      'Food / Meals','Equipment','Other'
    )),
  amount        NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "expenses_owner_all" ON expenses
    FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_expenses_user_id      ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tour_id      ON expenses(tour_id);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);


-- ─────────────────────────────────────────────────────────────
-- 5. USER_PROFILES — additional columns seen in code
--    (admin_notes, personal_gmail already in some schema files
--     but included here as IF NOT EXISTS for safety)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS admin_notes       TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url        TEXT,
  ADD COLUMN IF NOT EXISTS display_name      TEXT,
  ADD COLUMN IF NOT EXISTS agency_name       TEXT,
  ADD COLUMN IF NOT EXISTS phone             TEXT;


-- =============================================================
-- END OF PENDING MIGRATIONS
-- =============================================================
