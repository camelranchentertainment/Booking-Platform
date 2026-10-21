// lib/booker/handoff.ts
// Band transparency and hand-off (build list item 3): the link between an
// agent's roster band and a real band account, and the confirmed shows the
// agent sends across. Types plus pure rules, no I/O, unit-tested.
//
// The database (migration 20261021190000_booker_band_links.sql) is the
// security boundary: it decides who can see and change what. These helpers
// only decide what to show.

import type { BookerShow } from './types';

export type LinkStatus = 'invited' | 'active' | 'declined' | 'revoked';
export type ProposalStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';

/** What the band sees on shows the agent sends. Date, venue and town always go. */
export interface ShareSettings {
  share_times: boolean;
  share_deal: boolean;
  share_deal_notes: boolean;
  share_commission: boolean;
}

/** A booker_links row as the agent sees it. */
export interface BandLink extends ShareSettings {
  id: string;
  booker_id: string;
  roster_id: string;
  invited_email: string;
  act_id: string | null;
  status: LinkStatus;
  invited_at: string;
  accepted_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The shared fields copied into a proposal. Absent keys were not shared. */
export interface ProposalPayload {
  show_date: string;
  venue_name?: string;
  venue_city?: string;
  venue_state?: string;
  venue_address?: string;
  venue_website?: string;
  venue_capacity?: number;
  load_in_time?: string;
  door_time?: string;
  set_time?: string;
  set_length_min?: number;
  deal_type?: string;
  fee?: number | string;
  deal_notes?: string;
  commission_pct?: number | string;
  commission_amount?: number | string;
}

/** A booker_proposals row as the agent sees it. */
export interface BandProposal {
  id: string;
  booker_id: string;
  link_id: string;
  show_id: string;
  kind: 'add_show';
  payload: ProposalPayload;
  status: ProposalStatus;
  decision_note: string | null;
  decided_at: string | null;
  resulting_booking_id: string | null;
  created_at: string;
  updated_at: string;
}

/** One date from the linked band's own calendar (booker_band_calendar). */
export interface BandCalendarEntry {
  show_date: string;
  status: string;
  venue_name: string | null;
  venue_city: string | null;
  venue_state: string | null;
  from_agent: boolean;
}

/** An agent link as the Band Admin sees it (booker_my_band_links). */
export interface MyAgentLink extends ShareSettings {
  link_id: string;
  status: LinkStatus;
  agency_name: string | null;
  agent_name: string | null;
  agent_email: string | null;
  agent_phone: string | null;
  invited_at: string;
  accepted_at: string | null;
}

/** A show the agent sent, as the Band Admin sees it (booker_my_band_proposals). */
export interface AgentRequest {
  proposal_id: string;
  status: ProposalStatus;
  payload: ProposalPayload;
  agency_name: string | null;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  resulting_booking_id: string | null;
  /** The band already has a live show that date */
  conflict: boolean;
}

const LINK_RANK: Record<LinkStatus, number> = { active: 0, invited: 1, declined: 2, revoked: 3 };

/**
 * The link that describes a roster band right now: the active one, else the
 * open invite, else the most recent ended or declined one (so the page can
 * say what happened). Null when the agent never invited the band.
 */
export function currentLink<T extends Pick<BandLink, 'roster_id' | 'status' | 'updated_at'>>(links: readonly T[], rosterId: string): T | null {
  const mine = links.filter(l => l.roster_id === rosterId);
  if (mine.length === 0) return null;
  return [...mine].sort((a, b) => LINK_RANK[a.status] - LINK_RANK[b.status] || b.updated_at.localeCompare(a.updated_at))[0];
}

/** The most recent proposal per show. */
export function latestProposalByShow<T extends Pick<BandProposal, 'show_id' | 'created_at'>>(proposals: readonly T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const p of proposals) {
    const prev = out.get(p.show_id);
    if (!prev || p.created_at > prev.created_at) out.set(p.show_id, p);
  }
  return out;
}

/** Short label for a show row, or null when there is nothing to say. */
export function handoffChip(p: Pick<BandProposal, 'status'> | undefined): { text: string; badge: string } | null {
  if (!p) return null;
  switch (p.status) {
    case 'pending':
      return { text: 'Waiting on band', badge: 'badge-advancing' };
    case 'accepted':
      return { text: 'On band calendar', badge: 'badge-confirmed' };
    case 'declined':
      return { text: 'Band declined', badge: 'badge-cancelled' };
    default:
      return null;
  }
}

/**
 * Confirmed, upcoming shows for this band that are not already waiting on the
 * band or on its calendar — the ones the agent can send now. A declined or
 * withdrawn show can be sent again.
 */
export function sendableShows<S extends Pick<BookerShow, 'id' | 'roster_id' | 'status' | 'show_date' | 'deleted_at'>>(
  shows: readonly S[],
  rosterId: string,
  latest: ReadonlyMap<string, Pick<BandProposal, 'status'>>,
  today: string,
): S[] {
  return shows
    .filter(s => s.roster_id === rosterId && !s.deleted_at && s.status === 'confirmed' && s.show_date >= today)
    .filter(s => {
      const p = latest.get(s.id);
      return !p || p.status === 'declined' || p.status === 'withdrawn';
    })
    .sort((a, b) => a.show_date.localeCompare(b.show_date));
}

/** Plain-language list of what the band will see, for the sharing panel. */
export function sharingSummary(s: ShareSettings): string {
  const parts = ['date, venue and town'];
  if (s.share_times) parts.push('times');
  if (s.share_deal) parts.push('deal and fee');
  if (s.share_deal_notes) parts.push('deal notes');
  if (s.share_commission) parts.push('your commission');
  const last = parts.pop();
  return parts.length ? `${parts.join(', ')} and ${last}` : (last ?? '');
}

/** Basic email shape check for the invite form; the database checks again. */
export function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim()) && value.trim().length <= 254;
}

const DEAL_LABEL: Record<string, string> = {
  guarantee: 'Guarantee',
  door: 'Door deal',
  percentage: 'Percentage',
  guarantee_plus: 'Guarantee plus percentage',
  other: 'Other deal',
};

/** "Guarantee · $1,000" style deal line for a proposal, or null when the deal was not shared. */
export function dealLine(p: ProposalPayload, money: (n: number) => string): string | null {
  const type = p.deal_type ? (DEAL_LABEL[p.deal_type] ?? 'Deal') : null;
  const fee = p.fee !== undefined && p.fee !== null && Number.isFinite(Number(p.fee)) ? money(Number(p.fee)) : null;
  if (!type && !fee) return null;
  return [type, fee].filter(Boolean).join(' · ');
}
