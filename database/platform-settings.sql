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
DO $$ BEGIN
  CREATE POLICY "platform_settings_superadmin" ON platform_settings
    FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'superadmin'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed defaults (empty — filled via Settings → Platform Setup)
INSERT INTO platform_settings (key, value) VALUES
  ('resend_api_key',        ''),
  ('resend_from_email',     ''),
  ('resend_webhook_secret', ''),
  ('anthropic_api_key',     ''),
  ('firecrawl_api_key',     ''),
  ('stripe_secret_key',     ''),
  ('stripe_webhook_secret', ''),
  ('stripe_agent_price_id', ''),
  ('stripe_band_price_id',  ''),
  ('google_maps_api_key',   '')
ON CONFLICT (key) DO NOTHING;
