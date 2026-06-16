-- Add covering index to support all RLS subquery patterns.
-- Every policy does: WHERE p.id = auth.uid() AND p.act_id = <table>.act_id [AND p.role IN (...)]
-- Without this index, each RLS check scans user_profiles.
-- Run manually in Supabase SQL Editor. Never auto-run.

CREATE INDEX IF NOT EXISTS idx_profiles_id_act_role
  ON user_profiles(id, act_id, role);

-- Also index the profiles table if it is a separate table from user_profiles
-- (both are queried in this codebase — confirm which is canonical before running):
-- CREATE INDEX IF NOT EXISTS idx_profiles_id_act_role_p
--   ON profiles(id, act_id, role);
