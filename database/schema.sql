-- Camel Ranch Booking Platform Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Venues Table
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(50) NOT NULL,
  zip_code VARCHAR(20),
  phone VARCHAR(50),
  website TEXT,
  facebook_url TEXT,
  email VARCHAR(255),
  secondary_emails TEXT[],
  capacity_min INTEGER,
  capacity_max INTEGER,
  venue_type VARCHAR(50) CHECK (venue_type IN ('bar', 'saloon', 'pub', 'club', 'dancehall')),
  has_live_music BOOLEAN DEFAULT true,
  music_genres TEXT[],
  booking_contact VARCHAR(255),
  notes TEXT,
  last_contacted TIMESTAMP,
  contact_status VARCHAR(50) DEFAULT 'not_contacted' CHECK (contact_status IN ('not_contacted', 'awaiting_response', 'responded', 'booked', 'declined', 'no_response')),
  discovered_date TIMESTAMP DEFAULT NOW(),
  search_region VARCHAR(255),
  is_duplicate BOOLEAN DEFAULT false,
  duplicate_of UUID REFERENCES venues(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for duplicate detection
CREATE INDEX idx_venues_name_city ON venues(LOWER(name), LOWER(city));
CREATE INDEX idx_venues_email ON venues(email);
CREATE INDEX idx_venues_contact_status ON venues(contact_status);
CREATE INDEX idx_venues_user_id ON venues(user_id);

-- Campaigns Table
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  email_template_id UUID,
  cities TEXT[],                  -- Array of "City, ST" strings for this run
  radius INTEGER DEFAULT 25,      -- Venue search radius in miles
  target_regions TEXT[],
  date_range_start DATE,
  date_range_end DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  total_venues INTEGER DEFAULT 0,
  contacted INTEGER DEFAULT 0,
  responses INTEGER DEFAULT 0,
  bookings INTEGER DEFAULT 0
);

-- Email Templates Table
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  variables TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Email Logs Table
-- Tracks every email sent (and optionally received) through the platform.
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  -- template_id is the canonical FK name used by the application code
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  direction VARCHAR(10) DEFAULT 'sent' CHECK (direction IN ('sent', 'received')),
  to_address VARCHAR(255),
  subject TEXT,
  body TEXT,
  message_id TEXT,                  -- SMTP message-id header
  sent_at TIMESTAMP DEFAULT NOW(),
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  responded_at TIMESTAMP,
  response_type VARCHAR(50) CHECK (response_type IN ('interested', 'not_interested', 'booked', 'more_info')),
  response_notes TEXT
);

CREATE INDEX idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX idx_email_logs_venue_id ON email_logs(venue_id);
CREATE INDEX idx_email_logs_campaign_id ON email_logs(campaign_id);

-- User Email Settings Table
-- Stores per-user SMTP/IMAP credentials for outbound (and optionally inbound) email.
-- The password is stored AES-256-CBC encrypted (see ENCRYPTION_KEY env var).
CREATE TABLE user_email_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  provider VARCHAR(50) DEFAULT 'smtp',  -- 'smtp', 'gmail', 'outlook', etc.
  display_name VARCHAR(255),
  email_address VARCHAR(255),
  smtp_host VARCHAR(255),
  smtp_port INTEGER DEFAULT 587,
  imap_host VARCHAR(255),
  imap_port INTEGER DEFAULT 993,
  username VARCHAR(255),
  password_enc TEXT,                -- AES-256-CBC encrypted password
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Search Regions Table
CREATE TABLE search_regions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(50) NOT NULL,
  radius_miles INTEGER DEFAULT 25,
  is_active BOOLEAN DEFAULT true,
  last_searched TIMESTAMP,
  venues_found INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Search Queue Table
CREATE TABLE search_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id UUID REFERENCES search_regions(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  search_query TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  venues_discovered INTEGER DEFAULT 0,
  error_message TEXT
);

-- Campaign Venues Junction Table
-- Tracks which venues are in each campaign and their booking status.
-- Has its own UUID primary key so BookingCalendar and SocialMediaCampaign
-- can reference rows by id.
CREATE TABLE campaign_venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'contact?', 'contacted', 'booked', 'confirmed', 'responded', 'declined', 'cancelled')),
  -- booking_date is the canonical show date column used by all components.
  -- (Previously referred to as "show_date" in some parts of the UI code — same field.)
  booking_date DATE,
  added_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (campaign_id, venue_id)
);

CREATE INDEX idx_campaign_venues_campaign_id ON campaign_venues(campaign_id);
CREATE INDEX idx_campaign_venues_status ON campaign_venues(status);
CREATE INDEX idx_campaign_venues_booking_date ON campaign_venues(booking_date);

-- Booking Runs Table
-- A "booking run" is a named touring period (e.g. "Summer 2026 Run").
CREATE TABLE booking_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'cancelled')),
  start_date DATE,
  end_date DATE,
  target_regions TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_booking_runs_status ON booking_runs(status);
CREATE INDEX idx_booking_runs_start_date ON booking_runs(start_date);

-- Social Media Posts Table
-- AI-generated social media posts tied to a confirmed booking (campaign_venues row).
CREATE TABLE social_media_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES campaign_venues(id) ON DELETE CASCADE,
  platform VARCHAR(50) CHECK (platform IN ('facebook', 'instagram', 'twitter', 'tiktok')),
  post_text TEXT,
  post_date TIMESTAMP,
  hashtags TEXT[],
  mentions TEXT[],
  image_prompt TEXT,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'posted', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_social_media_posts_booking_id ON social_media_posts(booking_id);
CREATE INDEX idx_social_media_posts_post_date ON social_media_posts(post_date);
CREATE INDEX idx_social_media_posts_status ON social_media_posts(status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON venues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_email_settings_updated_at BEFORE UPDATE ON user_email_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_booking_runs_updated_at BEFORE UPDATE ON booking_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_social_media_posts_updated_at BEFORE UPDATE ON social_media_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default email template
INSERT INTO email_templates (name, subject, body, variables) VALUES
('Initial Booking Inquiry',
 'Live Music Booking Inquiry - Better Than Nothin''',
 'Hello {{booking_contact}},

I hope this message finds you well! My name is Scott, and I represent Better Than Nothin'', an Ozark Country band based in Northwest Arkansas featuring Jake Stringer.

We''re currently booking shows for {{season}} and came across {{venue_name}} in {{city}}. We love what you''re doing with live music and think our high-energy country sound would be a great fit for your venue.

Better Than Nothin'' delivers authentic Ozark Country with a mix of classic country covers and original songs. We typically play 3-4 hour sets and have experience playing venues ranging from intimate clubs to larger dancehalls.

Would you be interested in discussing available dates? We''re flexible on scheduling and would love to bring our music to {{venue_name}}.

Looking forward to hearing from you!

Best regards,
Scott
Better Than Nothin''
[Your Contact Info]',
 ARRAY['booking_contact', 'venue_name', 'city', 'season']);
