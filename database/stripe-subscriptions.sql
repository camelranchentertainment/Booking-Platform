-- Stripe subscription columns for user_profiles
-- Run in: Supabase dashboard → SQL Editor

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status    TEXT NOT NULL DEFAULT 'trialing'
    CHECK (subscription_status IN ('trialing','active','past_due','cancelled','inactive')),
  ADD COLUMN IF NOT EXISTS subscription_tier      TEXT
    CHECK (subscription_tier IN ('agent','band_admin','member')),
  ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days';

-- Index for webhook lookups by Stripe customer ID
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer
  ON user_profiles(stripe_customer_id);

-- Update the new-user trigger to initialize subscription fields based on role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Determine role from metadata (invite flow sets role) or default to agent
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'agent');

  INSERT INTO public.user_profiles (
    id, email, display_name, role,
    subscription_status, subscription_tier, trial_ends_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    v_role,
    -- members are free, agents/band_admins get a 14-day trial
    CASE WHEN v_role = 'member' THEN 'active' ELSE 'trialing' END,
    CASE WHEN v_role IN ('agent','superadmin') THEN 'agent'
         WHEN v_role = 'act_admin' THEN 'band_admin'
         ELSE 'member' END,
    CASE WHEN v_role = 'member' THEN NULL ELSE NOW() + INTERVAL '14 days' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users who have no subscription columns yet
UPDATE user_profiles SET
  subscription_status = CASE WHEN role = 'member' THEN 'active' ELSE 'trialing' END,
  subscription_tier   = CASE WHEN role IN ('agent','superadmin') THEN 'agent'
                             WHEN role = 'act_admin' THEN 'band_admin'
                             ELSE 'member' END,
  trial_ends_at       = CASE WHEN role = 'member' THEN NULL ELSE NOW() + INTERVAL '14 days' END
WHERE subscription_status = 'trialing' AND stripe_subscription_id IS NULL;

-- Superadmin is always active
UPDATE user_profiles SET subscription_status = 'active' WHERE role = 'superadmin';
