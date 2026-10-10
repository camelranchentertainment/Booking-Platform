// lib/booker/types.ts
// Row shapes for the Booking Agent workspace tables (booker_*).
// "Booker" is the code name for the Booking Agent role; "agent" already means
// the AI assistant elsewhere in the codebase.
// Source of truth: supabase/migrations/20261010120000_booker_workspace_foundation.sql

export const SHOW_STATUSES = ['hold', 'pending', 'confirmed', 'played', 'cancelled'] as const;
export type ShowStatus = (typeof SHOW_STATUSES)[number];

export const DEAL_TYPES = ['guarantee', 'door', 'percentage', 'guarantee_plus', 'other'] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export const PAYMENT_METHODS = ['cash_app', 'venmo', 'paypal', 'zelle', 'check', 'cash', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ROSTER_STATUSES = ['active', 'inactive'] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];

/** Venue-book entries are venues, or the other kinds of buyer an agent books with. */
export const VENUE_KINDS = ['venue', 'festival', 'fair', 'promoter', 'private_event'] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];

export const VENUE_KIND_LABEL: Record<VenueKind, string> = {
  venue: 'Venue',
  festival: 'Festival',
  fair: 'Fair',
  promoter: 'Promoter',
  private_event: 'Private event',
};

interface Timestamps {
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BookerProfile extends Timestamps {
  id: string;
  user_id: string;
  agency_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  default_commission_pct: number | null;
}

export interface RosterBand extends Timestamps {
  id: string;
  booker_id: string;
  band_name: string;
  genre: string | null;
  home_city: string | null;
  home_state: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  commission_pct: number | null;
  color: string | null;
  notes: string | null;
  status: RosterStatus;
}

export interface BookerVenue extends Timestamps {
  id: string;
  booker_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  capacity: number | null;
  website: string | null;
  notes: string | null;
  kind: VenueKind;
  place_id: string | null;
  email: string | null;
  phone: string | null;
  last_scanned_at: string | null;
}

export interface BookerContact extends Timestamps {
  id: string;
  booker_id: string;
  venue_id: string | null;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  /** "Show to my bands" — off by default; bands never see a contact unless the agent ticks it */
  share_with_bands: boolean;
  source: 'manual' | 'website';
}

export interface BookerShow extends Timestamps {
  id: string;
  booker_id: string;
  roster_id: string;
  venue_id: string | null;
  venue_name: string | null;
  venue_city: string | null;
  /** ISO date, YYYY-MM-DD */
  show_date: string;
  load_in_time: string | null;
  door_time: string | null;
  set_time: string | null;
  set_length_min: number | null;
  status: ShowStatus;
  deal_type: DealType | null;
  fee: number | null;
  actual_amount: number | null;
  commission_pct_override: number | null;
  deal_notes: string | null;
  internal_notes: string | null;
  /** ISO date, YYYY-MM-DD */
  followup_on: string | null;
}

export interface CommissionPayment extends Timestamps {
  id: string;
  booker_id: string;
  show_id: string;
  amount: number;
  method: PaymentMethod;
  /** ISO date, YYYY-MM-DD */
  paid_on: string;
  notes: string | null;
}

export const SHOW_STATUS_LABEL: Record<ShowStatus, string> = {
  hold: 'Hold',
  pending: 'Pending',
  confirmed: 'Confirmed',
  played: 'Played',
  cancelled: 'Cancelled',
};

/** Maps a show status to the shared badge class in styles/globals.css. */
export const SHOW_STATUS_BADGE: Record<ShowStatus, string> = {
  hold: 'badge-hold',
  pending: 'badge-negotiation',
  confirmed: 'badge-confirmed',
  played: 'badge-completed',
  cancelled: 'badge-cancelled',
};

export const DEAL_TYPE_LABEL: Record<DealType, string> = {
  guarantee: 'Guarantee',
  door: 'Door deal',
  percentage: 'Percentage',
  guarantee_plus: 'Guarantee + %',
  other: 'Other',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash_app: 'Cash App',
  venmo: 'Venmo',
  paypal: 'PayPal',
  zelle: 'Zelle',
  check: 'Check',
  cash: 'Cash',
  other: 'Other',
};
