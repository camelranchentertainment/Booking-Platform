export type UserRole = 'superadmin' | 'act_admin' | 'member';

export type BookingStatus =
  | 'pitch' | 'followup' | 'negotiation' | 'hold'
  | 'contract' | 'confirmed' | 'advancing' | 'completed' | 'cancelled';

export type ContactStatus =
  | 'not_contacted' | 'pitched' | 'responded' | 'negotiating'
  | 'booked' | 'declined' | 'do_not_contact';

export type TourStatus = 'planning' | 'active' | 'completed' | 'cancelled';

export type LinkStatus = 'pending' | 'active' | 'revoked' | 'declined';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'inactive';
export type SubscriptionTier   = 'band_admin' | 'member';

export interface UserProfile {
  id: string;
  role: UserRole;
  display_name: string;
  email: string;
  agency_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  act_id?: string | null;
  stripe_customer_id?:     string | null;
  stripe_subscription_id?: string | null;
  subscription_status?:    SubscriptionStatus | null;
  subscription_tier?:      SubscriptionTier   | null;
  trial_ends_at?:          string | null;
  created_at: string;
  updated_at: string;
}

export interface Act {
  id: string;
  owner_id?: string | null;
  act_name: string;
  genre?: string | null;
  bio?: string | null;
  website?: string | null;
  instagram?: string | null;
  spotify?: string | null;
  logo_url?: string | null;
  member_count: number;
  gcal_calendar_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActInvitation {
  id: string;
  act_id: string;
  email: string;
  role: UserRole;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  invited_by: string;
  expires_at: string;
  created_at: string;
}

export interface Venue {
  id: string;
  agent_id?: string | null;
  name: string;
  address?: string | null;
  city: string;
  state: string;
  zip?: string | null;
  country: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  venue_type?: string | null;
  capacity?: number | null;
  stage_size?: string | null;
  backline?: string | null;
  notes?: string | null;
  source: string;
  place_id?: string | null;
  rating?: number | null;
  google_maps_url?: string | null;
  music_genres?: string[] | null;
  last_enriched_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  agent_id: string;
  venue_id?: string | null;
  first_name: string;
  last_name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  status: ContactStatus;
  last_contact?: string | null;
  created_at: string;
  updated_at: string;
  venue?: Venue | null;
}

export interface Tour {
  id: string;
  created_by: string;
  act_id: string;
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  routing_notes?: string | null;
  status: TourStatus;
  created_at: string;
  updated_at: string;
  act?: Act | null;
}

export type DealType       = 'guarantee' | 'door_split' | 'percentage' | 'flat_fee' | 'other';
export type PaymentStatus  = 'pending' | 'received' | 'settled';
export type RebookFlag     = 'yes' | 'no' | 'maybe';
export type SoundSystem    = 'house' | 'self';

export interface Booking {
  id: string;
  created_by: string;
  act_id: string;
  venue_id?: string | null;
  tour_id?: string | null;
  contact_id?: string | null;
  status: BookingStatus;
  show_date?: string | null;
  load_in_time?: string | null;
  soundcheck_time?: string | null;
  set_time?: string | null;
  end_time?: string | null;
  set_length_min?: number | null;
  door_time?: string | null;
  fee?: number | null;
  deal_type?: DealType | null;
  agreed_amount?: number | null;
  actual_amount_received?: number | null;
  payment_status?: PaymentStatus | null;
  date_paid?: string | null;
  expense_notes?: string | null;
  payout_notes?: string | null;
  source?: string | null;
  confirmed_by?: string | null;
  settled_by?: string | null;
  details_pending?: boolean | null;
  agent_id?: string | null;
  meals_provided?: boolean | null;
  drinks_provided?: boolean | null;
  hotel_booked?: boolean | null;
  lodging_details?: string | null;
  sound_system?: SoundSystem | null;
  venue_contact_name?: string | null;
  special_requirements?: string | null;
  rebook_flag?: RebookFlag | null;
  issue_notes?: string | null;
  post_show_notes?: string | null;
  deal_notes?: string | null;
  contract_url?: string | null;
  deposit_paid: boolean;
  deposit_amount?: number | null;
  venue_notes?: string | null;
  internal_notes?: string | null;
  advance_notes?: string | null;
  pitched_at?: string | null;
  followup_at?: string | null;
  responded_at?: string | null;
  created_at: string;
  updated_at: string;
  act?: Act | null;
  venue?: Venue | null;
  contact?: Contact | null;
  tour?: Tour | null;
}

export interface EmailLogEntry {
  id: string;
  sent_by?: string | null;
  booking_id?: string | null;
  venue_id?: string | null;
  contact_id?: string | null;
  act_id?: string | null;
  template_id?: string | null;
  resend_id?: string | null;
  subject?: string | null;
  recipient?: string | null;
  status: 'sent' | 'delivered' | 'bounced' | 'failed';
  sent_at: string;
}

export interface RoutingRule {
  id: string;
  agent_id: string;
  name: string;
  trigger_status: BookingStatus;
  delay_days: number;
  template_id?: string | null;
  is_active: boolean;
  created_at: string;
}

export type OutreachStatus = 'target' | 'pitched' | 'followup' | 'negotiating' | 'confirmed' | 'declined';
export type SocialPlatform = 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'discord';
export type SocialStatus   = 'pending' | 'approved' | 'posted' | 'dismissed';

export interface TourVenue {
  id: string;
  tour_id: string;
  venue_id: string;
  status: OutreachStatus;
  notes?: string | null;
  added_by?: string | null;
  created_at: string;
  updated_at: string;
  venue?: Venue | null;
}

export interface SocialQueueItem {
  id: string;
  booking_id: string;
  act_id: string;
  venue_id?: string | null;
  platform: SocialPlatform;
  content: string;
  status: SocialStatus;
  show_date?: string | null;
  created_at: string;
  updated_at: string;
  act?: Act | null;
  venue?: Venue | null;
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pitch:       'Pitch',
  followup:    'Follow-up',
  negotiation: 'Negotiation',
  hold:        'Hold',
  contract:    'Contract',
  confirmed:   'Confirmed',
  advancing:   'Advancing',
  completed:   'Completed',
  cancelled:   'Cancelled',
};

export const BOOKING_STATUS_ORDER: BookingStatus[] = [
  'pitch', 'followup', 'negotiation', 'hold',
  'contract', 'confirmed', 'advancing', 'completed',
];
