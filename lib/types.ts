// Canonical shared types for Camel Ranch Booking Platform.
// Import from here instead of defining local interfaces in each component.

// ── User / Profile ────────────────────────────────────────────────────────────

export type UserRole = 'agent' | 'band_admin' | 'band_member';

export interface Profile {
  id: string;
  agent_name?: string;
  agency_name?: string;
  contact_phone?: string;
  contact_email?: string;
  display_name?: string;
  role: UserRole;
  subscription_tier?: string;
  stripe_customer_id?: string;
  created_at?: string;
  updated_at?: string;
}

// ── Venue ─────────────────────────────────────────────────────────────────────

export type ContactStatus =
  | 'not_contacted'
  | 'awaiting_response'
  | 'responded'
  | 'booked'
  | 'declined'
  | 'no_response';

export type VenueType = 'bar' | 'saloon' | 'pub' | 'club' | 'dancehall';

export interface Venue {
  id: string;
  user_id?: string;
  name: string;
  address?: string;
  city: string;
  state: string;
  zip_code?: string;
  phone?: string;
  website?: string;
  facebook_url?: string;
  email?: string | null;
  secondary_emails?: string[];
  capacity_min?: number;
  capacity_max?: number;
  venue_type?: VenueType;
  has_live_music?: boolean;
  music_genres?: string[];
  booking_contact?: string;
  notes?: string;
  last_contacted?: string;
  last_reply_at?: string;
  contact_status: ContactStatus;
  source?: string;
  place_id?: string;
  rating?: number;
  google_maps_url?: string;
  discovery_score?: number;
  discovered_date?: string;
  search_region?: string;
  is_duplicate?: boolean;
  duplicate_of?: string;
  created_at: string;
  updated_at?: string;
}

// ── Band ──────────────────────────────────────────────────────────────────────

export interface Band {
  id: string;
  owner_user_id: string;
  agent_user_id?: string | null;
  band_name: string;
  genre?: string;
  home_city?: string;
  home_state?: string;
  profile_photo_url?: string;
  instagram?: string;
  facebook?: string;
  website?: string;
  epk_link?: string;
  bio?: string;
  contact_email?: string;
  contact_phone?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BandMember {
  id: string;
  band_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  profile?: { display_name: string | null; contact_email: string | null } | null;
  email?: string;
  created_at?: string;
}

export interface BandInvite {
  id: string;
  band_id: string;
  invited_by: string;
  email: string;
  role: 'admin' | 'member';
  token: string;
  status: 'pending' | 'accepted' | 'expired';
  expires_at: string;
  created_at: string;
}

// ── Campaign (Run) ────────────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';

export interface Campaign {
  id: string;
  user_id?: string;
  band_id?: string | null;
  name: string;
  description?: string;
  status: CampaignStatus;
  email_template_id?: string;
  cities?: string[];
  radius?: number;
  target_regions?: string[];
  date_range_start?: string;
  date_range_end?: string;
  total_venues?: number;
  contacted?: number;
  responses?: number;
  bookings?: number;
  created_at?: string;
  updated_at?: string;
}

export type CampaignVenueStatus =
  | 'pending'
  | 'contact?'
  | 'contacted'
  | 'booked'
  | 'confirmed'
  | 'responded'
  | 'declined'
  | 'cancelled';

export interface CampaignVenue {
  id: string;
  campaign_id: string;
  venue_id: string;
  status: CampaignVenueStatus;
  booking_date?: string | null;
  added_at?: string;
  created_at?: string;
  venue?: Venue;
}

// ── Email ─────────────────────────────────────────────────────────────────────

export interface EmailTemplate {
  id: string;
  user_id?: string;
  band_id?: string;
  name: string;
  subject: string;
  body: string;
  variables?: string[];
  created_at?: string;
  updated_at?: string;
}

// ── Show ──────────────────────────────────────────────────────────────────────

export interface BandShow {
  id: string;
  band_id: string;
  venue_id?: string | null;
  venue_name?: string;
  show_date: string;
  notes?: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  created_by?: string;
  created_at?: string;
}

// ── Utility ───────────────────────────────────────────────────────────────────

export interface SaveMessage {
  ok: boolean;
  text: string;
}
