-- Schema v3: multi-role access (agent / band_admin / band_member)
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ── Role on profiles ──────────────────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'agent'
    CHECK (role IN ('agent', 'band_admin', 'band_member'));

-- ── Agent rep on bands (one agent per band, nullable) ─────────────────────────
ALTER TABLE bands
  ADD COLUMN IF NOT EXISTS agent_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bands_agent ON bands(agent_user_id);

-- ── band_invites (pending member invitations) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS band_invites (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  band_id       UUID REFERENCES bands(id) ON DELETE CASCADE NOT NULL,
  invited_by    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email         TEXT NOT NULL,
  role          TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  token         TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at    TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE band_invites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'band_invites' AND policyname = 'band_invites_select') THEN
    CREATE POLICY "band_invites_select" ON band_invites FOR SELECT TO authenticated
      USING (auth.uid() = invited_by OR band_id IN (
        SELECT id FROM bands WHERE owner_user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'band_invites' AND policyname = 'band_invites_insert') THEN
    CREATE POLICY "band_invites_insert" ON band_invites FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = invited_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'band_invites' AND policyname = 'band_invites_update') THEN
    CREATE POLICY "band_invites_update" ON band_invites FOR UPDATE TO authenticated
      USING (auth.uid() = invited_by);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'band_invites' AND policyname = 'band_invites_delete') THEN
    CREATE POLICY "band_invites_delete" ON band_invites FOR DELETE TO authenticated
      USING (auth.uid() = invited_by);
  END IF;
END $$;

-- Allow service role to read invites by token (for the join page — no auth yet)
-- This is handled via the service role client in the API, so no anon policy needed.

CREATE INDEX IF NOT EXISTS idx_band_invites_token  ON band_invites(token);
CREATE INDEX IF NOT EXISTS idx_band_invites_band   ON band_invites(band_id);
CREATE INDEX IF NOT EXISTS idx_band_invites_email  ON band_invites(email);
