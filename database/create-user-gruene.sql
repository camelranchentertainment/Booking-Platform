-- Create Band Admin account: grueneroadcases@gmail.com
-- Display name: Gruene  |  Act: John D Hale Band
-- Run in Supabase SQL Editor

-- Step 1: Clean up any orphaned records from previous attempts
DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'grueneroadcases@gmail.com'
);
DELETE FROM auth.users WHERE email = 'grueneroadcases@gmail.com';

-- Step 2: Create the account
DO $$
DECLARE
  new_user_id  uuid        := gen_random_uuid();
  trial_end    timestamptz := NOW() + INTERVAL '14 days';
BEGIN

  INSERT INTO auth.users (
    instance_id, id, aud, role,
    email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id, 'authenticated', 'authenticated',
    'grueneroadcases@gmail.com',
    crypt('Password123!', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}', false
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_user_id,
    json_build_object('sub', new_user_id, 'email', 'grueneroadcases@gmail.com'),
    'email', 'grueneroadcases@gmail.com',
    NOW(), NOW()
  );

  -- Upsert in case a trigger already created the row
  INSERT INTO user_profiles (
    id, role, email, display_name,
    subscription_status, subscription_tier, trial_ends_at
  ) VALUES (
    new_user_id, 'act_admin', 'grueneroadcases@gmail.com', 'Gruene',
    'trialing', 'band_admin', trial_end
  )
  ON CONFLICT (id) DO UPDATE SET
    role              = 'act_admin',
    email             = 'grueneroadcases@gmail.com',
    display_name      = 'Gruene',
    subscription_status = 'trialing',
    subscription_tier = 'band_admin',
    trial_ends_at     = trial_end;

  INSERT INTO acts (owner_id, agent_id, act_name)
  VALUES (new_user_id, NULL, 'John D Hale Band')
  ON CONFLICT DO NOTHING;

END $$;
