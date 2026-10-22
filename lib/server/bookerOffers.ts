// lib/server/bookerOffers.ts
// Server-side lookups for offers and deal memos. The routes that use these run
// with the service role, which bypasses RLS, so every query here is scoped to
// the caller's bookerId (from requireBooker), never to anything in the request.

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../apiError';
import type { BookerOffer } from '../booker/offers';
import type { OfferPdfAgency } from './offerPdf';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The offer id from the URL, checked to be a UUID. @throws AppError 400 */
export function offerIdFrom(raw: unknown): string {
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id !== 'string' || !UUID.test(id)) throw new AppError(400, 'That offer link is not valid.');
  return id;
}

/**
 * One of the caller's live offers.
 *
 * @throws AppError 404 when it doesn't exist, is archived, or belongs to another agent
 */
export async function loadOwnedOffer(service: SupabaseClient, bookerId: string, offerId: string): Promise<BookerOffer> {
  const { data, error } = await service
    .from('booker_offers')
    .select('*')
    .eq('id', offerId)
    .eq('booker_id', bookerId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new AppError(500, 'Could not load the offer', false);
  if (!data) throw new AppError(404, 'That offer was not found. It may have been archived.');
  return data as BookerOffer;
}

/** Who the document is from, for the PDF header and footer. @throws AppError 500 */
export async function loadOfferAgency(service: SupabaseClient, bookerId: string): Promise<OfferPdfAgency> {
  const { data, error } = await service
    .from('booker_profiles')
    .select('agency_name, contact_name, contact_email, contact_phone')
    .eq('id', bookerId)
    .maybeSingle();
  if (error || !data) throw new AppError(500, 'Could not load your agent profile', false);
  return {
    agencyName: String(data.agency_name),
    contactName: (data.contact_name as string | null) ?? null,
    contactEmail: (data.contact_email as string | null) ?? null,
    contactPhone: (data.contact_phone as string | null) ?? null,
  };
}
