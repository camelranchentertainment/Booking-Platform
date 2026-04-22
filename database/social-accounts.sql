-- Social platform account connections per act
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS social_accounts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  act_id       UUID NOT NULL REFERENCES acts(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL CHECK (platform IN ('discord','facebook','instagram','youtube','tiktok')),
  credentials  JSONB NOT NULL DEFAULT '{}',
  handle       TEXT,                          -- @username / page name for display
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(act_id, platform)
);

-- Credentials shape per platform:
--   discord:   { webhook_url: string, server_id?: string }
--   facebook:  { page_id: string, page_access_token: string, page_handle?: string }
--   instagram: { ig_user_id: string, page_access_token: string }
--   youtube:   { channel_id: string }
--   tiktok:    { handle: string }

ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;

-- Access controlled entirely through server-side API routes (service client),
-- no direct client access needed.
CREATE POLICY "no_direct_access" ON social_accounts USING (false);
