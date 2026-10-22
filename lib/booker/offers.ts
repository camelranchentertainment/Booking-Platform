// lib/booker/offers.ts
// Offers and deal memos for the Booking Agent workspace (build list item 4).
// Types plus pure rules: filling a template, drafting an offer from a show,
// labels and the per-venue history. No I/O; unit-tested.
//
// No e-sign: the document goes out as a PDF by email and the agent records
// the buyer's answer. Source of truth for the table:
// supabase/migrations/20261021210000_booker_offers.sql

import { addDays, formatShowDate, formatTime } from './dates';
import { formatMoney, toAmount } from './commission';
import { DEAL_TYPE_LABEL, type BookerContact, type BookerShow, type BookerVenue, type DealType, type RosterBand } from './types';

export { DEAL_TYPE_LABEL };

export const OFFER_KINDS = ['offer', 'deal_memo'] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];
export const OFFER_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'withdrawn'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_KIND_LABEL: Record<OfferKind, string> = { offer: 'Offer', deal_memo: 'Deal memo' };
export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};
/** Badge classes from styles/globals.css. */
export const OFFER_STATUS_BADGE: Record<OfferStatus, string> = {
  draft: 'badge-pitch',
  sent: 'badge-advancing',
  accepted: 'badge-confirmed',
  declined: 'badge-cancelled',
  withdrawn: 'badge-completed',
};

/** Days an offer stands by default before it lapses. */
export const DEFAULT_OFFER_DAYS = 7;

export interface OfferTemplate {
  id: string;
  booker_id: string;
  name: string;
  terms: string;
  hospitality: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** The editable terms of an offer: what the form edits and the PDF prints. */
export interface OfferTerms {
  kind: OfferKind;
  template_id: string | null;
  band_name: string;
  venue_name: string;
  venue_city: string | null;
  venue_state: string | null;
  show_date: string;
  load_in_time: string | null;
  door_time: string | null;
  set_time: string | null;
  set_length_min: number | null;
  deal_type: DealType | null;
  fee: number | null;
  deal_terms: string | null;
  deposit_amount: number | null;
  deposit_due_on: string | null;
  hospitality: string | null;
  terms: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  expires_on: string | null;
}

/** A booker_offers row. */
export interface BookerOffer extends OfferTerms {
  id: string;
  booker_id: string;
  show_id: string;
  doc_number: number;
  status: OfferStatus;
  sent_at: string | null;
  sent_to: string | null;
  message_id: string | null;
  responded_at: string | null;
  response_note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Placeholders a template can use, with what each becomes. */
export const TEMPLATE_PLACEHOLDERS = [
  ['band', 'Band name'],
  ['venue', 'Venue name'],
  ['city', 'Venue town'],
  ['date', 'Show date, e.g. Saturday, November 14, 2026'],
  ['load_in', 'Load-in time'],
  ['doors', 'Door time'],
  ['set_time', 'Set time'],
  ['set_length', 'Set length, e.g. 90 minutes'],
  ['deal', 'Deal type'],
  ['fee', 'Fee, e.g. $1,500.00'],
  ['deposit', 'Deposit amount'],
  ['deposit_due', 'Deposit due date'],
  ['buyer', 'Talent buyer name'],
  ['agency', 'Your agency name'],
] as const;
export type PlaceholderKey = (typeof TEMPLATE_PLACEHOLDERS)[number][0];

const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' };

/** "Saturday, November 14, 2026" for an ISO date (no time-zone drift). */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', LONG_DATE);
}

/** The values the placeholders are filled with for these terms. Blank when unknown. */
export function placeholderValues(t: OfferTerms, agencyName: string | null): Record<PlaceholderKey, string> {
  const fee = toAmount(t.fee);
  const deposit = toAmount(t.deposit_amount);
  return {
    band: t.band_name,
    venue: t.venue_name,
    city: [t.venue_city, t.venue_state].filter(Boolean).join(', '),
    date: longDate(t.show_date),
    load_in: formatTime(t.load_in_time) ?? '',
    doors: formatTime(t.door_time) ?? '',
    set_time: formatTime(t.set_time) ?? '',
    set_length: t.set_length_min ? `${t.set_length_min} minutes` : '',
    deal: t.deal_type ? DEAL_TYPE_LABEL[t.deal_type] : '',
    fee: fee === null ? '' : formatMoney(fee),
    deposit: deposit === null ? '' : formatMoney(deposit),
    deposit_due: longDate(t.deposit_due_on),
    buyer: t.buyer_name ?? '',
    agency: agencyName ?? '',
  };
}

/**
 * Replaces {{placeholder}} tokens (spaces inside the braces allowed, any case).
 * Unknown tokens are left as written so a typo is visible rather than silently
 * dropped; known tokens with no value become "TBD".
 */
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, raw: string) => {
    const key = raw.toLowerCase();
    if (!(key in values)) return whole;
    return values[key] || 'TBD';
  });
}

/** Placeholder names in a template that aren't recognised (to warn while editing). */
export function unknownPlaceholders(text: string): string[] {
  const known = new Set<string>(TEMPLATE_PLACEHOLDERS.map(p => p[0]));
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) {
    const key = m[1].toLowerCase();
    if (!known.has(key)) out.add(m[1]);
  }
  return [...out];
}

const trimTime = (t: string | null) => (t ? t.slice(0, 5) : null);

/**
 * A new offer (or deal memo) drafted from a show: band, venue, date, times
 * and deal come from the show; terms and hospitality from the template with
 * placeholders filled; the buyer from the chosen contact. An offer stands for
 * DEFAULT_OFFER_DAYS; a deal memo records agreed terms so it doesn't lapse.
 */
export function draftFromShow(args: {
  show: BookerShow;
  band: Pick<RosterBand, 'band_name'>;
  venue: Pick<BookerVenue, 'name' | 'city' | 'state'> | null;
  contact: Pick<BookerContact, 'name' | 'email'> | null;
  template: Pick<OfferTemplate, 'id' | 'terms' | 'hospitality'> | null;
  kind: OfferKind;
  agencyName: string | null;
  today: string;
}): OfferTerms {
  const { show, band, venue, contact, template, kind, agencyName, today } = args;
  const base: OfferTerms = {
    kind,
    template_id: template?.id ?? null,
    band_name: band.band_name,
    venue_name: venue?.name ?? show.venue_name ?? 'Venue',
    venue_city: venue?.city ?? show.venue_city ?? null,
    venue_state: venue?.state ?? null,
    show_date: show.show_date,
    load_in_time: trimTime(show.load_in_time),
    door_time: trimTime(show.door_time),
    set_time: trimTime(show.set_time),
    set_length_min: show.set_length_min,
    deal_type: show.deal_type,
    fee: toAmount(show.fee),
    deal_terms: show.deal_type === 'door' || show.deal_type === 'percentage' || show.deal_type === 'guarantee_plus' ? (show.deal_notes?.slice(0, 1000) ?? null) : null,
    deposit_amount: null,
    deposit_due_on: null,
    hospitality: null,
    terms: null,
    buyer_name: contact?.name ?? null,
    buyer_email: contact?.email ?? null,
    expires_on: kind === 'offer' ? addDays(today, DEFAULT_OFFER_DAYS) : null,
  };
  if (!template) return base;
  const values = placeholderValues(base, agencyName);
  return {
    ...base,
    terms: fillTemplate(template.terms, values).slice(0, 8000),
    hospitality: template.hospitality ? fillTemplate(template.hospitality, values).slice(0, 2000) : null,
  };
}

/** "Offer #14" / "Deal memo #15". */
export function offerLabel(o: Pick<BookerOffer, 'kind' | 'doc_number'>): string {
  return `${OFFER_KIND_LABEL[o.kind]} #${o.doc_number}`;
}

/** "Offer #14 · The Band at Saxon Pub · Sat, Nov 14" */
export function offerTitle(o: Pick<BookerOffer, 'kind' | 'doc_number' | 'band_name' | 'venue_name' | 'show_date'>, year?: number): string {
  return `${offerLabel(o)} · ${o.band_name} at ${o.venue_name} · ${formatShowDate(o.show_date, year)}`;
}

/** A safe file name: "Offer-14-The-Band-Saxon-Pub-2026-11-14.pdf". */
export function offerFilename(o: Pick<BookerOffer, 'kind' | 'doc_number' | 'band_name' | 'venue_name' | 'show_date'>): string {
  const slug = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .slice(0, 40);
  return `${o.kind === 'deal_memo' ? 'Deal-Memo' : 'Offer'}-${o.doc_number}-${slug(o.band_name)}-${slug(o.venue_name)}-${o.show_date}.pdf`.replace(/-+/g, '-');
}

/** The deal in one line: "Guarantee · $1,500.00", plus door/percentage terms. */
export function dealSummary(t: Pick<OfferTerms, 'deal_type' | 'fee' | 'deal_terms'>): string {
  const fee = toAmount(t.fee);
  const parts = [t.deal_type ? DEAL_TYPE_LABEL[t.deal_type] : null, fee === null ? null : formatMoney(fee), t.deal_terms].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'To be agreed';
}

/** A sent offer whose stand-by date has passed without an answer. */
export function isLapsed(o: Pick<BookerOffer, 'status' | 'expires_on'>, today: string): boolean {
  return o.status === 'sent' && !!o.expires_on && o.expires_on < today;
}

/** Offers that still need something from the agent: drafts, and sent ones awaiting an answer. */
export function openOffers<T extends Pick<BookerOffer, 'status' | 'deleted_at'>>(offers: readonly T[]): T[] {
  return offers.filter(o => !o.deleted_at && (o.status === 'draft' || o.status === 'sent'));
}

/** How a venue has answered this agent's offers: counts plus the accept rate. */
export function venueOfferRecord(offers: readonly Pick<BookerOffer, 'status' | 'kind' | 'deleted_at'>[]): {
  sent: number;
  accepted: number;
  declined: number;
  acceptRate: number | null;
} {
  const live = offers.filter(o => !o.deleted_at && o.kind === 'offer' && o.status !== 'draft' && o.status !== 'withdrawn');
  const accepted = live.filter(o => o.status === 'accepted').length;
  const declined = live.filter(o => o.status === 'declined').length;
  const answered = accepted + declined;
  return { sent: live.length, accepted, declined, acceptRate: answered === 0 ? null : Math.round((accepted / answered) * 100) };
}

/** Default subject and body for the email that carries the PDF. */
export function offerEmail(
  o: Pick<BookerOffer, 'kind' | 'doc_number' | 'band_name' | 'venue_name' | 'show_date' | 'buyer_name' | 'expires_on' | 'deal_type' | 'fee' | 'deal_terms'>,
  agencyName: string | null,
  senderName: string | null,
): { subject: string; body: string } {
  const what = o.kind === 'deal_memo' ? 'deal memo' : 'offer';
  const subject = `${o.kind === 'deal_memo' ? 'Deal memo' : 'Offer'}: ${o.band_name} at ${o.venue_name}, ${longDate(o.show_date)}`;
  const lines = [
    `Hi ${o.buyer_name?.split(' ')[0] || 'there'},`,
    '',
    o.kind === 'deal_memo'
      ? `Attached is the deal memo confirming ${o.band_name} at ${o.venue_name} on ${longDate(o.show_date)}.`
      : `Attached is our ${what} for ${o.band_name} at ${o.venue_name} on ${longDate(o.show_date)}.`,
    `Deal: ${dealSummary(o)}.`,
    o.kind === 'offer' && o.expires_on ? `This offer stands until ${longDate(o.expires_on)}. Reply to this email to accept or to talk terms.` : 'Reply to this email with any questions.',
    '',
    'Thanks,',
    [senderName, agencyName].filter(Boolean).join('\n') || 'Your booking agent',
  ];
  return { subject: subject.slice(0, 200), body: lines.join('\n') };
}
