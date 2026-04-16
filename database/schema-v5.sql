-- Schema v5: profiles.role column + repair corrupted band_admin accounts
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ── Add role column to profiles ──────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'agent'
  CHECK (role IN ('agent', 'band_admin'));

-- ── Confirm any unconfirmed band_admin emails so they can log in ─────────────
-- (old SignUp.tsx used client-side signUp() which left emails unconfirmed)
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE id IN (
  SELECT owner_user_id FROM bands
)
AND email_confirmed_at IS NULL;

-- Also confirm any users who have no band_profiles row (they're band admins)
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE id NOT IN (SELECT id FROM band_profiles)
AND email_confirmed_at IS NULL;

-- ── Backfill role for existing users ─────────────────────────────────────────
-- Users with a band_profiles row are agents
INSERT INTO profiles (id, role, display_name)
SELECT bp.id, 'agent', bp.band_name
FROM band_profiles bp
ON CONFLICT (id) DO UPDATE SET role = 'agent';

-- Users who own a bands row are band_admins
INSERT INTO profiles (id, role, display_name)
SELECT b.owner_user_id, 'band_admin', b.band_name
FROM bands b
ON CONFLICT (id) DO UPDATE SET role = 'band_admin';

-- ── Fix Jake: create missing bands row + correct profile ──────────────────────
-- Replace 'jake@' with Jake's full email if needed (ILIKE matches any jake@... address)
INSERT INTO bands (owner_user_id, band_name)
SELECT au.id, 'Jake Stringer'
FROM auth.users au
WHERE au.email ILIKE 'jake@%'
  AND NOT EXISTS (
    SELECT 1 FROM bands b WHERE b.owner_user_id = au.id
  );

INSERT INTO profiles (id, role, display_name)
SELECT au.id, 'band_admin', au.email
FROM auth.users au
WHERE au.email ILIKE 'jake@%'
ON CONFLICT (id) DO UPDATE SET role = 'band_admin';

-- ── RLS: allow users to read their own profile role ──────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_select') THEN
    CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
  END IF;
END $$;
