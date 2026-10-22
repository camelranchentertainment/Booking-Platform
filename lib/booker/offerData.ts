// lib/booker/offerData.ts
// Browser-side calls for offers, deal memos and offer templates.
//
// Reads and edits go through the signed-in agent's own Supabase session, so
// RLS on booker_offers / booker_offer_templates limits them to the agent's
// rows. Sending and the PDF go through /api/booker/offers/*, which check the
// caller server-side. Nothing is ever hard-deleted: "remove" archives.

import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { BookerDataError, callBookerApi, toBookerDataError } from './data';
import type { BookerOffer, OfferTemplate } from './offers';
import type { BookerShow } from './types';
import type { OfferAnswerInput, OfferSendInput, OfferTemplateInput, OfferTermsInput } from './schemas';

async function run<T>(action: string, query: PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw toBookerDataError(error, action);
  if (data === null) throw new BookerDataError(`Could not ${action}.`);
  return data;
}

// ── Offers ──────────────────────────────────────────────────────────────────
export interface OfferFilter {
  showId?: string;
  showIds?: readonly string[];
  limit?: number;
}

/** The agent's live offers, newest first. */
export function listOffers(filter: OfferFilter = {}): Promise<BookerOffer[]> {
  if (filter.showIds && filter.showIds.length === 0) return Promise.resolve([]);
  let q = supabase.from('booker_offers').select('*').is('deleted_at', null);
  if (filter.showId) q = q.eq('show_id', filter.showId);
  if (filter.showIds) q = q.in('show_id', [...filter.showIds]);
  return run<BookerOffer[]>('load offers', q.order('created_at', { ascending: false }).limit(filter.limit ?? 200));
}

/** A new draft for a show. The database sets the running number. */
export function createOffer(bookerId: string, showId: string, terms: OfferTermsInput): Promise<BookerOffer> {
  return run('save the offer', supabase.from('booker_offers').insert({ ...terms, booker_id: bookerId, show_id: showId, status: 'draft' }).select('*').single());
}

/** Edit a draft's terms. Sent or answered offers keep what was sent. */
export function updateOfferTerms(id: string, terms: OfferTermsInput): Promise<BookerOffer> {
  return run('save the offer', supabase.from('booker_offers').update(terms).eq('id', id).eq('status', 'draft').is('deleted_at', null).select('*').single());
}

/** Record the buyer's answer (or withdraw the offer). */
export function answerOffer(id: string, input: OfferAnswerInput): Promise<BookerOffer> {
  const patch = input.status === 'withdrawn' ? { status: input.status, response_note: input.response_note } : { ...input, responded_at: new Date().toISOString() };
  return run('record the answer', supabase.from('booker_offers').update(patch).eq('id', id).is('deleted_at', null).select('*').single());
}

/** Archive (never delete: offers hold money terms). */
export function archiveOffer(id: string): Promise<BookerOffer> {
  return run('remove the offer', supabase.from('booker_offers').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null).select('*').single());
}

export interface OfferSendResult {
  offer: BookerOffer | null;
  warning?: string;
}

/** Email the PDF from the agent's Gmail; the server marks it sent. */
export function sendOffer(id: string, input: OfferSendInput): Promise<OfferSendResult> {
  return callBookerApi<OfferSendResult>(`/api/booker/offers/${encodeURIComponent(id)}/send`, { method: 'POST', body: JSON.stringify(input) }, 'send the offer');
}

/** Downloads the PDF and hands it to the browser as a file. */
export async function downloadOfferPdf(id: string, filename: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new BookerDataError('Your session has expired. Sign in again.');
  let res: Response;
  try {
    res = await fetch(`/api/booker/offers/${encodeURIComponent(id)}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new BookerDataError('Could not download the PDF. Check your connection and try again.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new BookerDataError(body.error ?? 'Could not download the PDF.', String(res.status));
  }
  const url = URL.createObjectURL(await res.blob());
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

// ── Templates ───────────────────────────────────────────────────────────────
export function listOfferTemplates(): Promise<OfferTemplate[]> {
  return run<OfferTemplate[]>('load your standard terms', supabase.from('booker_offer_templates').select('*').is('deleted_at', null).order('name'));
}

/** Clears the default flag on the agent's other templates (one default at a time). */
async function clearDefault(exceptId: string | null): Promise<void> {
  let q = supabase.from('booker_offer_templates').update({ is_default: false }).eq('is_default', true).is('deleted_at', null);
  if (exceptId) q = q.neq('id', exceptId);
  const { error } = await q;
  if (error) throw toBookerDataError(error, 'update the default template');
}

export async function createOfferTemplate(bookerId: string, input: OfferTemplateInput): Promise<OfferTemplate> {
  if (input.is_default) await clearDefault(null);
  return run('save the template', supabase.from('booker_offer_templates').insert({ ...input, booker_id: bookerId }).select('*').single());
}

export async function updateOfferTemplate(id: string, input: OfferTemplateInput): Promise<OfferTemplate> {
  if (input.is_default) await clearDefault(id);
  return run('save the template', supabase.from('booker_offer_templates').update(input).eq('id', id).is('deleted_at', null).select('*').single());
}

export function archiveOfferTemplate(id: string): Promise<OfferTemplate> {
  return run('remove the template', supabase.from('booker_offer_templates').update({ deleted_at: new Date().toISOString(), is_default: false }).eq('id', id).select('*').single());
}

// ── Show ────────────────────────────────────────────────────────────────────
/**
 * The buyer accepted: confirm the show with the offer's deal and fee (when the
 * offer set them) and clear the hold fields, which only apply to holds.
 */
export function confirmShowFromOffer(showId: string, offer: Pick<BookerOffer, 'deal_type' | 'fee'>): Promise<BookerShow> {
  const patch: Record<string, unknown> = { status: 'confirmed', hold_rank: null, hold_expires_on: null, answer_by: null, challenge_note: null };
  if (offer.deal_type) patch.deal_type = offer.deal_type;
  if (offer.fee !== null && offer.fee !== undefined) patch.fee = offer.fee;
  return run('confirm the show', supabase.from('booker_shows').update(patch).eq('id', showId).is('deleted_at', null).select('*').single());
}
