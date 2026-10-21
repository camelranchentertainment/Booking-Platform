// lib/booker/handoffData.ts
// Browser-side calls for the agent ↔ band hand-off, used by both sides.
//
// Every call runs under the signed-in user's own Supabase session. The
// browser can only read the agent's own link and proposal rows (RLS); every
// change goes through a SECURITY DEFINER database function that checks the
// caller from auth.uid(). Nothing here uses the service role, and no call
// passes a user ID or the band's act — the database takes those from the
// caller's profile.

import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { BookerDataError } from './data';
import type { AgentRequest, BandCalendarEntry, BandLink, BandProposal, MyAgentLink, ShareSettings } from './handoff';

/**
 * Error codes our database functions raise with a message written for people
 * (see the migration). Anything else gets a generic message; the raw text is
 * only logged.
 */
const FRIENDLY_CODES = new Set(['P0002', '22023', '54000', '23505', '23P01', '42501']);

export function toHandoffError(err: PostgrestError, action: string): BookerDataError {
  console.error(`[handoff] ${action} failed`, { code: err.code, message: err.message });
  if (err.code && FRIENDLY_CODES.has(err.code) && !/permission denied/i.test(err.message)) {
    return new BookerDataError(err.message, err.code);
  }
  if (err.code === '42501' || err.code === '42883') {
    return new BookerDataError('You do not have access to that. Try signing out and back in.', err.code);
  }
  return new BookerDataError(`Could not ${action}. Check your connection and try again.`, err.code ?? null);
}

async function rpc<T>(fn: string, args: Record<string, unknown>, action: string): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toHandoffError(error, action);
  return data as T;
}

// ── Agent side ──────────────────────────────────────────────────────────────

/** The agent's links (all bands, all states). RLS limits rows to the agent. */
export async function listBandLinks(): Promise<BandLink[]> {
  const { data, error } = await supabase.from('booker_links').select('*').order('updated_at', { ascending: false });
  if (error) throw toHandoffError(error, 'load band links');
  return (data ?? []) as BandLink[];
}

/** The agent's proposals, optionally for one roster band's link ids. */
export async function listBandProposals(linkIds?: readonly string[]): Promise<BandProposal[]> {
  if (linkIds && linkIds.length === 0) return [];
  let q = supabase.from('booker_proposals').select('*').order('created_at', { ascending: false });
  if (linkIds) q = q.in('link_id', [...linkIds]);
  const { data, error } = await q;
  if (error) throw toHandoffError(error, 'load shows sent to bands');
  return (data ?? []) as BandProposal[];
}

/** Invite the band's admin, by email, to link. Returns the new link id. */
export const inviteBand = (rosterId: string, email: string) =>
  rpc<string>('booker_link_invite', { p_roster_id: rosterId, p_email: email.trim() }, 'send the invite');

/** Withdraw an invite or end an active link from the agent side. */
export const cancelBandLink = (linkId: string) => rpc<null>('booker_link_cancel', { p_link_id: linkId }, 'end the link');

export const setBandSharing = (linkId: string, s: ShareSettings) =>
  rpc<null>(
    'booker_link_set_sharing',
    { p_link_id: linkId, p_times: s.share_times, p_deal: s.share_deal, p_deal_notes: s.share_deal_notes, p_commission: s.share_commission },
    'save what the band sees',
  );

/** The linked band's own calendar, dates/status/venue only. Empty when not linked. */
export const bandCalendar = (rosterId: string, from: string, to: string) =>
  rpc<BandCalendarEntry[]>('booker_band_calendar', { p_roster_id: rosterId, p_from: from, p_to: to }, "load the band's calendar").then(r => r ?? []);

/** Send a confirmed show to the linked band. Returns the proposal id. */
export const sendShowToBand = (showId: string) => rpc<string>('booker_proposal_send', { p_show_id: showId }, 'send the show');

export const withdrawShowFromBand = (proposalId: string) => rpc<null>('booker_proposal_withdraw', { p_proposal_id: proposalId }, 'take the show back');

// ── Band side (Band Admin) ──────────────────────────────────────────────────

/** The band's agent links and any invites sent to this admin's email. */
export const listMyAgentLinks = () => rpc<MyAgentLink[]>('booker_my_band_links', {}, 'load your booking agent').then(r => r ?? []);

export const answerAgentInvite = (linkId: string, accept: boolean) =>
  rpc<null>('booker_link_respond', { p_link_id: linkId, p_accept: accept }, accept ? 'accept the invite' : 'decline the invite');

export const endAgentLink = (linkId: string) => rpc<null>('booker_link_revoke', { p_link_id: linkId }, 'end the link');

/** Shows the agent sent: pending ones, plus answers from the last 30 days. */
export const listAgentRequests = () => rpc<AgentRequest[]>('booker_my_band_proposals', {}, 'load requests from your agent').then(r => r ?? []);

/** Accept: adds the show to the band's calendar. Returns the new booking id. */
export const acceptAgentRequest = (proposalId: string) => rpc<string>('booker_proposal_accept', { p_proposal_id: proposalId }, 'add the show');

export const declineAgentRequest = (proposalId: string, note: string) =>
  rpc<null>('booker_proposal_decline', { p_proposal_id: proposalId, p_note: note.trim() || null }, 'decline the show');
