-- ============================================================
-- Phase 1: Auth & Multi-Tenancy Migration
-- Run in Supabase SQL Editor. Review every statement before
-- executing. Never auto-run migrations.
-- ============================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. user_profiles — confirm all expected columns exist
-- ============================================================
-- The trigger function ensures a profile row is created for
-- every new auth user. Re-create it defensively.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'member')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. Add act_id to tables that currently scope by agent_id
--    (venues, contacts, email_drafts, email_templates)
-- ============================================================

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS act_id UUID REFERENCES acts(id) ON DELETE SET NULL;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS act_id UUID REFERENCES acts(id) ON DELETE SET NULL;

ALTER TABLE email_drafts
  ADD COLUMN IF NOT EXISTS act_id UUID REFERENCES acts(id) ON DELETE SET NULL;

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS act_id UUID REFERENCES acts(id) ON DELETE SET NULL;

-- ============================================================
-- 3. Backfill act_id from the creating user's profile
-- ============================================================

UPDATE venues v
SET act_id = (
  SELECT up.act_id FROM user_profiles up
  WHERE up.id = v.agent_id AND up.act_id IS NOT NULL
  LIMIT 1
)
WHERE v.act_id IS NULL AND v.agent_id IS NOT NULL;

UPDATE contacts c
SET act_id = (
  SELECT up.act_id FROM user_profiles up
  WHERE up.id = c.agent_id AND up.act_id IS NOT NULL
  LIMIT 1
)
WHERE c.act_id IS NULL AND c.agent_id IS NOT NULL;

UPDATE email_drafts ed
SET act_id = (
  SELECT up.act_id FROM user_profiles up
  WHERE up.id = ed.agent_id AND up.act_id IS NOT NULL
  LIMIT 1
)
WHERE ed.act_id IS NULL AND ed.agent_id IS NOT NULL;

UPDATE email_templates et
SET act_id = (
  SELECT up.act_id FROM user_profiles up
  WHERE up.id = et.agent_id AND up.act_id IS NOT NULL
  LIMIT 1
)
WHERE et.act_id IS NULL AND et.agent_id IS NOT NULL;

-- ============================================================
-- 4. RLS policies — scope by act_id
-- ============================================================

-- acts: only members of the act can see it
ALTER TABLE acts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Act members can view their act" ON acts;
CREATE POLICY "Act members can view their act"
  ON acts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid() AND p.act_id = acts.id
    )
  );

DROP POLICY IF EXISTS "Band admin can update their act" ON acts;
CREATE POLICY "Band admin can update their act"
  ON acts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
        AND p.act_id = acts.id
        AND p.role = 'act_admin'
    )
  );

DROP POLICY IF EXISTS "Superadmin full access to acts" ON acts;
CREATE POLICY "Superadmin full access to acts"
  ON acts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'superadmin'
    )
  );

-- user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Act members can view each other" ON user_profiles;
CREATE POLICY "Act members can view each other"
  ON user_profiles FOR SELECT
  USING (
    act_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid() AND p.act_id = user_profiles.act_id
    )
  );

DROP POLICY IF EXISTS "Superadmin full access to profiles" ON user_profiles;
CREATE POLICY "Superadmin full access to profiles"
  ON user_profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid() AND p.role = 'superadmin'
    )
  );

-- venues: scope by act_id
DROP POLICY IF EXISTS "Act members can view their venues" ON venues;
CREATE POLICY "Act members can view their venues"
  ON venues FOR SELECT
  USING (
    act_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid() AND p.act_id = venues.act_id
    )
  );

DROP POLICY IF EXISTS "Band admin can manage their venues" ON venues;
CREATE POLICY "Band admin can manage their venues"
  ON venues FOR ALL
  USING (
    act_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
        AND p.act_id = venues.act_id
        AND p.role IN ('act_admin', 'superadmin')
    )
  );

-- contacts: scope by act_id
DROP POLICY IF EXISTS "Act members can view their contacts" ON contacts;
CREATE POLICY "Act members can view their contacts"
  ON contacts FOR SELECT
  USING (
    act_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid() AND p.act_id = contacts.act_id
    )
  );

DROP POLICY IF EXISTS "Band admin can manage their contacts" ON contacts;
CREATE POLICY "Band admin can manage their contacts"
  ON contacts FOR ALL
  USING (
    act_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
        AND p.act_id = contacts.act_id
        AND p.role IN ('act_admin', 'superadmin')
    )
  );

-- bookings: scope by act_id (already has act_id column)
DROP POLICY IF EXISTS "Act members can view their bookings" ON bookings;
CREATE POLICY "Act members can view their bookings"
  ON bookings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid() AND p.act_id = bookings.act_id
    )
  );

DROP POLICY IF EXISTS "Band admin can manage their bookings" ON bookings;
CREATE POLICY "Band admin can manage their bookings"
  ON bookings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
        AND p.act_id = bookings.act_id
        AND p.role IN ('act_admin', 'superadmin')
    )
  );

-- email_templates: scope by act_id
DROP POLICY IF EXISTS "Act members can view their email templates" ON email_templates;
CREATE POLICY "Act members can view their email templates"
  ON email_templates FOR SELECT
  USING (
    act_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid() AND p.act_id = email_templates.act_id
    )
  );

DROP POLICY IF EXISTS "Band admin can manage their email templates" ON email_templates;
CREATE POLICY "Band admin can manage their email templates"
  ON email_templates FOR ALL
  USING (
    act_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
        AND p.act_id = email_templates.act_id
        AND p.role IN ('act_admin', 'superadmin')
    )
  );

-- ============================================================
-- 5. Fix registration: act_id must be set on user_profiles
--    when the act is created. The API route handles this now,
--    but add a helper function as safety net.
-- ============================================================

CREATE OR REPLACE FUNCTION public.link_act_to_user(
  p_user_id UUID,
  p_act_id  UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE public.user_profiles
  SET act_id = p_act_id,
      role   = 'act_admin',
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. Drop agent_id from acts_invitations (if it exists there)
-- ============================================================

-- Only drop agent_id columns after confirming no live code
-- references them. Application code has been updated to use
-- act_id. Run these drops only after verifying the backfill
-- (step 3) completed successfully.

-- ALTER TABLE venues         DROP COLUMN IF EXISTS agent_id;
-- ALTER TABLE contacts       DROP COLUMN IF EXISTS agent_id;
-- ALTER TABLE email_drafts   DROP COLUMN IF EXISTS agent_id;
-- ALTER TABLE email_templates DROP COLUMN IF EXISTS agent_id;
-- (Uncomment after confirming deployment is stable)
