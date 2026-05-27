-- Fix recursive RLS policy on profiles table.
-- The old superadmin policy queried profiles to check role, causing infinite recursion.
-- Replacement uses auth.jwt() to read the role claim directly.
--
-- NOTE: Verify the table name matches your schema — codebase queries "user_profiles".
-- If the table is "user_profiles", replace "profiles" with "user_profiles" below.
-- Also verify that the superadmin role is stored as a JWT claim (app_metadata.role)
-- vs user_metadata — adjust the jwt() path accordingly if needed.

-- Drop the recursive policy
DROP POLICY IF EXISTS "Superadmin full access to profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Recreate without recursion
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Superadmin policy using auth.jwt() instead of querying profiles
CREATE POLICY "Superadmin full access to profiles"
  ON profiles FOR ALL
  USING (auth.jwt() ->> 'role' = 'superadmin');
