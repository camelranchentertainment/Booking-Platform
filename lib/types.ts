export type UserRole = 'agent' | 'act_admin' | 'member';

export type BookingStatus =
  | 'pitch' | 'followup' | 'negotiation' | 'hold'
  | 'contract' | 'confirmed' | 'advancing' | 'completed' | 'cancelled';

export type ContactStatus =
  | 'not_contacted' | 'pitched' | 'responded' | 'negotiating'
  | 'booked' | 'declined' | 'do_not_contact';

export type TourStatus = 'planning' | 'active' | 'completed' | 'cancelled';

export type LinkStatus = 'pending' | 'active' | 'revoked' | 'declined';

export interface UserProfile {
  id: string;
  role: UserRole;
  display_name: string;
  email: string;
  agency_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  act_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Act {
  id: string;
  // agent_id: booking agent managing this act (null = self-managed by band)
  agent_id?: string | null;
  // owner_id: the act_admin user who IS this act
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

export interface AgentActLink {
  id: string;
  agent_id: string;
  act_id: string;
  status: LinkStatus;
  permissions: 'view' | 'manage';
  token: string;
  message?: string | null;
  invited_at: string;
  accepted_at?: string | null;
  act?: Act | null;
  agent?: { display_name: string; agency_name?: string | null; email: string } | null;
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
  set_time?: string | null;
  set_length_min?: number | null;
  door_time?: string | null;
  fee?: number | null;
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
