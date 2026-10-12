// lib/server/bookerMessages.ts
// Server-side rules for email sent from the Booking Agent workspace. Used by
// /api/booker/messages/send, which runs with the service role and therefore
// bypasses RLS: every lookup here is scoped to the caller's bookerId.

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../apiError';
import type { MessageSendInput } from '../booker/schemas';

/** Sends allowed per agent in a rolling hour / day. Generous for real booking work, low enough to stop abuse. */
export const SEND_LIMITS = { perHour: 40, perDay: 250 } as const;

export interface ResolvedLinks {
  roster_id: string | null;
  venue_id: string | null;
  contact_id: string | null;
  show_id: string | null;
}

type Lookup = Record<string, unknown> | null;

async function ownedRow(service: SupabaseClient, table: string, columns: string, id: string, bookerId: string): Promise<Lookup> {
  const { data, error } = await service.from(table).select(columns).eq('id', id).eq('booker_id', bookerId).is('deleted_at', null).maybeSingle();
  if (error) throw new AppError(500, 'Could not check what this email is about', false);
  return (data as Lookup) ?? null;
}

/**
 * Confirms every referenced band, venue, contact and show belongs to the agent,
 * and fills in the obvious links (a contact's venue; a show's band and venue)
 * so the message appears in every relevant history.
 *
 * @throws AppError 400 when a reference is missing, archived, another agent's, or inconsistent
 */
export async function resolveLinks(service: SupabaseClient, bookerId: string, input: Pick<MessageSendInput, 'roster_id' | 'venue_id' | 'contact_id' | 'show_id'>): Promise<ResolvedLinks> {
  const out: ResolvedLinks = { roster_id: input.roster_id, venue_id: input.venue_id, contact_id: input.contact_id, show_id: input.show_id };

  if (out.show_id) {
    const show = await ownedRow(service, 'booker_shows', 'id, roster_id, venue_id', out.show_id, bookerId);
    if (!show) throw new AppError(400, 'That show no longer exists. Refresh and try again.');
    if (out.roster_id && out.roster_id !== show.roster_id) throw new AppError(400, 'That show belongs to a different band.');
    out.roster_id = String(show.roster_id);
    if (!out.venue_id && show.venue_id) out.venue_id = String(show.venue_id);
  }
  if (out.contact_id) {
    const contact = await ownedRow(service, 'booker_contacts', 'id, venue_id', out.contact_id, bookerId);
    if (!contact) throw new AppError(400, 'That contact no longer exists. Refresh and try again.');
    if (contact.venue_id) {
      if (out.venue_id && out.venue_id !== contact.venue_id) throw new AppError(400, 'That contact is at a different venue.');
      out.venue_id = String(contact.venue_id);
    }
  }
  if (out.venue_id && !(await ownedRow(service, 'booker_venues', 'id', out.venue_id, bookerId))) {
    throw new AppError(400, 'That venue no longer exists. Refresh and try again.');
  }
  if (out.roster_id && !(await ownedRow(service, 'booker_roster', 'id', out.roster_id, bookerId))) {
    throw new AppError(400, 'That band no longer exists. Refresh and try again.');
  }
  return out;
}

async function countSince(service: SupabaseClient, bookerId: string, sinceIso: string): Promise<number> {
  const { count, error } = await service
    .from('booker_messages')
    .select('id', { count: 'exact', head: true })
    .eq('booker_id', bookerId)
    .gte('created_at', sinceIso);
  if (error) throw new AppError(500, 'Could not check your sending limit', false);
  return count ?? 0;
}

/**
 * Enforces SEND_LIMITS (failed attempts count too, so retries cannot loop).
 *
 * @throws AppError 429 with a plain-language wait message
 */
export async function assertWithinSendLimit(service: SupabaseClient, bookerId: string, now: Date = new Date()): Promise<void> {
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  if ((await countSince(service, bookerId, hourAgo)) >= SEND_LIMITS.perHour) {
    throw new AppError(429, `You've sent ${SEND_LIMITS.perHour} emails in the last hour. Wait a little and try again.`);
  }
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  if ((await countSince(service, bookerId, dayAgo)) >= SEND_LIMITS.perDay) {
    throw new AppError(429, `You've reached today's limit of ${SEND_LIMITS.perDay} emails. It resets over the next 24 hours.`);
  }
}

/**
 * The agency name shown as the sender's display name.
 *
 * @throws AppError 500 when the agent profile cannot be read
 */
export async function loadAgencyName(service: SupabaseClient, bookerId: string): Promise<string> {
  const { data, error } = await service.from('booker_profiles').select('agency_name').eq('id', bookerId).maybeSingle();
  if (error || !data) throw new AppError(500, 'Could not load your agent profile', false);
  return String(data.agency_name);
}
