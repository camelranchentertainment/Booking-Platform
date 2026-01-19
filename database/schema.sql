-- Camel Ranch Booking Platform Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Venues Table
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Campaigns Table
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  email_template_id UUID,
  target_regions TEXT[],
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
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  email_template_id UUID REFERENCES email_templates(id),
  sent_at TIMESTAMP DEFAULT NOW(),
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  responded_at TIMESTAMP,
  response_type VARCHAR(50) CHECK (response_type IN ('interested', 'not_interested', 'booked', 'more_info')),
  response_notes TEXT
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
CREATE TABLE campaign_venues (
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (campaign_id, venue_id)
);

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
