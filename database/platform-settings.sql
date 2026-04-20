-- Platform-level configuration stored in the database
-- Only readable/writable via service role (API routes) — no direct client access
-- Run in: Supabase dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS platform_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS bypass for authenticated users — service role only
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Superadmin can read their own platform settings via the API route
-- (API routes use service client, so this policy is a safety belt for direct queries)
CREATE POLICY "platform_settings_superadmin" ON platform_settings
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'
  ));

-- Seed defaults (empty values — user fills them in via Settings UI)
INSERT INTO platform_settings (key, value) VALUES
  ('resend_api_key',   ''),
  ('resend_from_email', 'booking@mail.camelranchbooking.com')
ON CONFLICT (key) DO NOTHING;
