-- Fix: replace 'act_admin' with 'band_admin' in all RLS policies.
-- Phase 1 migration used 'act_admin'; application code uses 'band_admin'.
-- This mismatch blocks all band_admin writes through the Supabase client.
-- Run manually in Supabase SQL Editor. Never auto-run.

-- Diagnostic (run first to confirm affected policies):
-- SELECT policyname, tablename, qual, with_check FROM pg_policies
-- WHERE qual ILIKE '%act_admin%' OR with_check ILIKE '%act_admin%';

-- ============================================================
-- 1. acts — write policy
-- ============================================================
DROP POLICY IF EXISTS "Band admin can update their act" ON acts;
CREATE POLICY "Band admin can update their act"
  ON acts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
        AND p.act_id = acts.id
        AND p.role = 'band_admin'
    )
  );

-- ============================================================
-- 2. venues — all-access policy
-- ============================================================
DROP POLICY IF EXISTS "Band admin can manage their venues" ON venues;
CREATE POLICY "Band admin can manage their venues"
  ON venues FOR ALL
  USING (
    act_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
        AND p.act_id = venues.act_id
        AND p.role IN ('band_admin', 'superadmin')
    )
  );

-- ============================================================
-- 3. contacts — all-access policy
-- ============================================================
DROP POLICY IF EXISTS "Band admin can manage their contacts" ON contacts;
CREATE POLICY "Band admin can manage their contacts"
  ON contacts FOR ALL
  USING (
    act_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
        AND p.act_id = contacts.act_id
        AND p.role IN ('band_admin', 'superadmin')
    )
  );

-- ============================================================
-- 4. bookings — all-access policy
-- ============================================================
DROP POLICY IF EXISTS "Band admin can manage their bookings" ON bookings;
CREATE POLICY "Band admin can manage their bookings"
  ON bookings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
        AND p.act_id = bookings.act_id
        AND p.role IN ('band_admin', 'superadmin')
    )
  );

-- ============================================================
-- 5. email_templates — all-access policy
-- ============================================================
DROP POLICY IF EXISTS "Band admin can manage their email templates" ON email_templates;
CREATE POLICY "Band admin can manage their email templates"
  ON email_templates FOR ALL
  USING (
    act_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.id = auth.uid()
        AND p.act_id = email_templates.act_id
        AND p.role IN ('band_admin', 'superadmin')
    )
  );

-- ============================================================
-- 6. Fix link_act_to_user helper — was setting 'act_admin', now 'band_admin'
-- ============================================================
CREATE OR REPLACE FUNCTION public.link_act_to_user(
  p_user_id UUID,
  p_act_id  UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE public.user_profiles
  SET act_id     = p_act_id,
      role       = 'band_admin',
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. Backfill existing rows that have role = 'act_admin'
-- ============================================================
UPDATE user_profiles
SET role = 'band_admin', updated_at = NOW()
WHERE role = 'act_admin';
