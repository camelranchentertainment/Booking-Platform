-- Run in Supabase SQL Editor

-- 1. personal_gmail on user_profiles (for routing reminder emails)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS personal_gmail TEXT;

-- 2. System notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('advance_due','thank_you_due','follow_up_due','system')),
  message    TEXT NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  related_id UUID,       -- booking_id the notification is about
  action_url TEXT,       -- deep link e.g. /bookings/xxx
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "notif_own" ON notifications FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, read, created_at DESC);
