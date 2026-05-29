-- Phase 10: columns needed for inbound email tracking
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'sent';
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS from_address TEXT;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE tour_venues ADD COLUMN IF NOT EXISTS last_replied_at TIMESTAMPTZ;
