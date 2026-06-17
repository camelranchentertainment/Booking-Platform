-- Add Gmail OAuth columns to the acts table.
-- Run manually in Supabase SQL Editor. Never auto-run.

ALTER TABLE acts ADD COLUMN IF NOT EXISTS google_access_token  TEXT;
ALTER TABLE acts ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE acts ADD COLUMN IF NOT EXISTS gmail_address        TEXT;
ALTER TABLE acts ADD COLUMN IF NOT EXISTS gmail_connected_at   TIMESTAMPTZ;

-- Confirm:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'acts'
-- AND column_name IN ('google_access_token','google_refresh_token','gmail_address','gmail_connected_at');
