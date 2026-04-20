-- ============================================================
-- CAMEL RANCH BOOKING PLATFORM — SCHEMA v2
-- Supports: independent bands, agent-managed bands, invites
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUMS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('superadmin', 'agent', 'act_admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM (
    'pitch', 'followup', 'negotiation', 'hold',
    'contract', 'confirmed', 'advancing', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contact_status AS ENUM (
    'not_contacted', 'pitched', 'responded', 'negotiating',
    'booked', 'declined', 'do_not_contact'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- user_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role          user_role NOT NULL DEFAULT 'agent',
  display_name  TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  agency_name   TEXT,
  phone         TEXT,
  avatar_url    TEXT,
  -- For invited members: which act they belong to
  act_id        UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_profiles_own" ON user_profiles FOR ALL USING (auth.uid() = id);
-- Agents can read profiles of members in acts they manage
CREATE POLICY "agent_reads_members" ON user_profiles FOR SELECT USING (
  act_id IN (
    SELECT id FROM acts
    WHERE agent_id = auth.uid() OR owner_id = auth.uid()
  )
);

-- ============================================================
-- acts
--   owner_id: the act_admin who IS this act (null = agent-only act)
--   agent_id: the booking agent managing this act (null = self-managed)
-- ============================================================
CREATE TABLE IF NOT EXISTS acts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Who manages bookings for this act (booking agent, or the band itself)
  agent_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- The act_admin user who "is" this act (null when agent creates act pre-band)
  owner_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  act_name         TEXT NOT NULL,
  genre            TEXT,
  bio              TEXT,
  website          TEXT,
  instagram        TEXT,
  spotify          TEXT,
  logo_url         TEXT,
  member_count     INT DEFAULT 1,
  gcal_calendar_id TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE acts ENABLE ROW LEVEL SECURITY;
-- Agent who manages the act
CREATE POLICY "acts_agent_all"  ON acts FOR ALL USING (agent_id = auth.uid());
-- Band admin who owns the act
CREATE POLICY "acts_owner_all"  ON acts FOR ALL USING (owner_id = auth.uid());
-- Band members
CREATE POLICY "acts_member_select" ON acts FOR SELECT USING (
  id IN (SELECT act_id FROM user_profiles WHERE id = auth.uid())
);
-- Linked agents (via agent_act_links)
CREATE POLICY "acts_linked_agent_select" ON acts FOR SELECT USING (
  id IN (
    SELECT act_id FROM agent_act_links
    WHERE agent_id = auth.uid() AND status = 'active'
  )
);

-- ============================================================
-- agent_act_links
-- Agent sends a link invite to a band; band accepts → agent gets visibility
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_act_links (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  act_id       UUID NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','revoked','declined')),
  permissions  TEXT NOT NULL DEFAULT 'view'
    CHECK (permissions IN ('view','manage')),
  token        TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  message      TEXT,
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at  TIMESTAMPTZ,
  UNIQUE (agent_id, act_id)
);
ALTER TABLE agent_act_links ENABLE ROW LEVEL SECURITY;
-- Agent can see and manage links they created
CREATE POLICY "links_agent" ON agent_act_links FOR ALL USING (agent_id = auth.uid());
-- Band owner can see and respond to incoming link requests
CREATE POLICY "links_act_owner" ON agent_act_links FOR ALL USING (
  act_id IN (SELECT id FROM acts WHERE owner_id = auth.uid())
);

-- ============================================================
-- act_invitations  (band/agent inviting members to join)
-- ============================================================
CREATE TABLE IF NOT EXISTS act_invitations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  act_id      UUID NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'member',
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','expired','revoked')),
  invited_by  UUID NOT NULL REFERENCES auth.users(id),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE act_invitations ENABLE ROW LEVEL SECURITY;
-- Agent or band owner can manage invitations
CREATE POLICY "invitations_manage" ON act_invitations FOR ALL USING (
  act_id IN (
    SELECT id FROM acts
    WHERE agent_id = auth.uid() OR owner_id = auth.uid()
  )
);

-- ============================================================
-- act_visibility_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS act_visibility_rules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  act_id      UUID NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
  field_name  TEXT NOT NULL,
  visible_to  user_role[] NOT NULL DEFAULT '{act_admin,member}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (act_id, field_name)
);
ALTER TABLE act_visibility_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visibility_rules_manage" ON act_visibility_rules FOR ALL USING (
  act_id IN (SELECT id FROM acts WHERE agent_id = auth.uid() OR owner_id = auth.uid())
);

-- ============================================================
-- venues
-- ============================================================
CREATE TABLE IF NOT EXISTS venues (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id        UUID REFERENCES auth.users(id),
  name            TEXT NOT NULL,
  address         TEXT,
  city            TEXT NOT NULL DEFAULT '',
  state           TEXT NOT NULL DEFAULT '',
  zip             TEXT,
  country         TEXT DEFAULT 'US',
  phone           TEXT,
  email           TEXT,
  website         TEXT,
  venue_type      TEXT,
  capacity        INT,
  stage_size      TEXT,
  backline        TEXT,
  notes           TEXT,
  source          TEXT DEFAULT 'manual',
  place_id        TEXT,
  rating          NUMERIC(3,1),
  google_maps_url TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "venues_agent_all" ON venues FOR ALL
  USING (agent_id = auth.uid() OR agent_id IS NULL);

-- ============================================================
-- contacts
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id     UUID REFERENCES venues(id) ON DELETE SET NULL,
  first_name   TEXT NOT NULL DEFAULT '',
  last_name    TEXT NOT NULL DEFAULT '',
  title        TEXT,
  email        TEXT,
  phone        TEXT,
  notes        TEXT,
  status       contact_status NOT NULL DEFAULT 'not_contacted',
  last_contact TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_agent_all" ON contacts FOR ALL USING (agent_id = auth.uid());

-- ============================================================
-- tours
-- ============================================================
CREATE TABLE IF NOT EXISTS tours (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- created_by: the user who made this tour (agent or band admin)
  created_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  act_id        UUID NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  start_date    DATE,
  end_date      DATE,
  routing_notes TEXT,
  status        TEXT NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning','active','completed','cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tours ENABLE ROW LEVEL SECURITY;
-- Creator can manage
CREATE POLICY "tours_creator_all" ON tours FOR ALL USING (created_by = auth.uid());
-- Act owner can manage their act's tours
CREATE POLICY "tours_act_owner" ON tours FOR ALL USING (
  act_id IN (SELECT id FROM acts WHERE owner_id = auth.uid())
);
-- Linked agent can view
CREATE POLICY "tours_linked_agent" ON tours FOR SELECT USING (
  act_id IN (
    SELECT act_id FROM agent_act_links
    WHERE agent_id = auth.uid() AND status = 'active'
  )
);
-- Members can view
CREATE POLICY "tours_member_select" ON tours FOR SELECT USING (
  act_id IN (SELECT act_id FROM user_profiles WHERE id = auth.uid())
);

-- ============================================================
-- bookings
-- ============================================================
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- created_by: the user who created this booking (agent or band admin)
  created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  act_id          UUID NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
  venue_id        UUID REFERENCES venues(id) ON DELETE SET NULL,
  tour_id         UUID REFERENCES tours(id) ON DELETE SET NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  status          booking_status NOT NULL DEFAULT 'pitch',
  show_date       DATE,
  load_in_time    TIME,
  set_time        TIME,
  set_length_min  INT,
  door_time       TIME,
  fee             NUMERIC(10,2),
  deal_notes      TEXT,
  contract_url    TEXT,
  deposit_paid    BOOLEAN DEFAULT FALSE,
  deposit_amount  NUMERIC(10,2),
  venue_notes     TEXT,
  internal_notes  TEXT,
  advance_notes   TEXT,
  pitched_at      TIMESTAMPTZ,
  followup_at     TIMESTAMPTZ,
  responded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
-- Creator manages
CREATE POLICY "bookings_creator_all" ON bookings FOR ALL USING (created_by = auth.uid());
-- Act owner sees all bookings for their act
CREATE POLICY "bookings_act_owner" ON bookings FOR ALL USING (
  act_id IN (SELECT id FROM acts WHERE owner_id = auth.uid())
);
-- Linked agent sees bookings for linked acts
CREATE POLICY "bookings_linked_agent" ON bookings FOR SELECT USING (
  act_id IN (
    SELECT act_id FROM agent_act_links
    WHERE agent_id = auth.uid() AND status = 'active'
  )
);
-- Members see confirmed+ bookings for their act
CREATE POLICY "bookings_member_select" ON bookings FOR SELECT USING (
  act_id IN (SELECT act_id FROM user_profiles WHERE id = auth.uid())
);

-- ============================================================
-- email_log
-- ============================================================
CREATE TABLE IF NOT EXISTS email_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sent_by     UUID REFERENCES auth.users(id),
  booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
  venue_id    UUID REFERENCES venues(id) ON DELETE SET NULL,
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  act_id      UUID REFERENCES acts(id) ON DELETE SET NULL,
  template_id TEXT,
  resend_id   TEXT,
  subject     TEXT,
  recipient   TEXT,
  status      TEXT DEFAULT 'sent' CHECK (status IN ('sent','delivered','bounced','failed')),
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_log_sender" ON email_log FOR ALL USING (sent_by = auth.uid());

-- ============================================================
-- routing_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS routing_rules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  trigger_status  booking_status NOT NULL,
  delay_days      INT NOT NULL DEFAULT 7,
  template_id     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routing_rules_agent" ON routing_rules FOR ALL USING (agent_id = auth.uid());

-- ============================================================
-- SUPERADMIN SETUP (run once to create scott@camelranchbooking.com)
-- You can also use the bootstrap API endpoint instead (see README).
-- ============================================================
-- Step 1: In Supabase Dashboard → Authentication → Users → Add User
--         Email: scott@camelranchbooking.com  Password: Password123
--         Enable "Auto Confirm Email"
--
-- Step 2: After creating the auth user, run this to set the superadmin role:
-- INSERT INTO user_profiles (id, role, email, display_name, agency_name)
-- SELECT id, 'superadmin', email, 'Scott', 'Camel Ranch Entertainment'
-- FROM auth.users WHERE email = 'scott@camelranchbooking.com'
-- ON CONFLICT (id) DO UPDATE SET role = 'superadmin';

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bookings_created_by  ON bookings(created_by);
CREATE INDEX IF NOT EXISTS idx_bookings_act         ON bookings(act_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status      ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_tour        ON bookings(tour_id);
CREATE INDEX IF NOT EXISTS idx_bookings_show_date   ON bookings(show_date);
CREATE INDEX IF NOT EXISTS idx_venues_agent         ON venues(agent_id);
CREATE INDEX IF NOT EXISTS idx_contacts_agent       ON contacts(agent_id);
CREATE INDEX IF NOT EXISTS idx_contacts_venue       ON contacts(venue_id);
CREATE INDEX IF NOT EXISTS idx_tours_created_by     ON tours(created_by);
CREATE INDEX IF NOT EXISTS idx_tours_act            ON tours(act_id);
CREATE INDEX IF NOT EXISTS idx_acts_agent           ON acts(agent_id);
CREATE INDEX IF NOT EXISTS idx_acts_owner           ON acts(owner_id);
CREATE INDEX IF NOT EXISTS idx_agent_act_links_agent ON agent_act_links(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_act_links_act   ON agent_act_links(act_id);
CREATE INDEX IF NOT EXISTS idx_agent_act_links_token ON agent_act_links(token);
CREATE INDEX IF NOT EXISTS idx_email_log_booking    ON email_log(booking_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token    ON act_invitations(token);

-- ============================================================
-- updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_acts_updated          BEFORE UPDATE ON acts          FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  CREATE TRIGGER trg_bookings_updated      BEFORE UPDATE ON bookings      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  CREATE TRIGGER trg_venues_updated        BEFORE UPDATE ON venues        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  CREATE TRIGGER trg_contacts_updated      BEFORE UPDATE ON contacts      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  CREATE TRIGGER trg_tours_updated         BEFORE UPDATE ON tours         FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  CREATE TRIGGER trg_user_profiles_updated BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
