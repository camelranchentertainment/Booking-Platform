-- Fix recursive RLS policy on user_profiles.
-- The superadmin policy queried user_profiles to check role, causing infinite recursion.
-- Fix: use a SECURITY DEFINER function that reads user_profiles while bypassing RLS,
-- so the check never re-enters the policy being evaluated.

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'superadmin'
  );
$$;

-- Drop existing policies
DROP POLICY IF EXISTS "Superadmin full access to profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- Recreate without recursion
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Superadmin policy — uses the security definer function, no recursive query
CREATE POLICY "Superadmin full access to profiles"
  ON user_profiles FOR ALL
  USING (public.is_superadmin());
