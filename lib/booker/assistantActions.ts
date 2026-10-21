// lib/booker/assistantActions.ts
// What the agent's AI assistant may *propose*. The assistant never writes
// anything: each proposal is shown as a card, and only the agent's Approve
// click performs it, through the normal RLS-scoped workspace calls (so a
// proposal can never touch another agent's data).
//
// Powers mirror the band-side assistant's policy: the assistant can propose
// almost anything in the agent's own workspace — shows (holds, offers,
// confirmations, cancellations, marking played), bands, venues, contacts,
// follow-ups and emails — EXCEPT money and deletion:
//   * no commission payments, amounts received, commission rates or overrides
//   * no archiving/deleting bands, venues, contacts or shows
//   * never shares a contact with bands (only the agent ticks that box)
// Cancelling a show is a status change, not a deletion, so it is allowed.
//
// Shared by the server (validating model output) and the page (re-validating
// against the rows actually loaded before showing a card).

import { z } from 'zod';
import { isIsoDate } from './dates';
import { DEAL_TYPES, ROSTER_STATUSES, VENUE_KINDS } from './types';

const uuid = z.uuid();
const isoDate = z.string().refine(isIsoDate, 'Invalid date');
const shortText = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).nullable().optional();
const optTime = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/)
  .nullable()
  .optional();
const optMoney = z.number().min(0).max(99_999_999).nullable().optional();
const optEmail = z.email().max(254).nullable().optional();
const reason = shortText(300);

/** Statuses the assistant may give a NEW show. */
const NEW_SHOW_STATUSES = ['hold', 'pending', 'confirmed'] as const;
/** Statuses the assistant may move an EXISTING show to. */
const SHOW_STATUS_CHANGES = ['hold', 'pending', 'confirmed', 'played', 'cancelled'] as const;

// ── Shows ───────────────────────────────────────────────────────────────────
const ShowFields = {
  venue_id: uuid.nullable().optional(),
  venue_name: optText(160),
  venue_city: optText(100),
  fee: optMoney,
  deal_type: z.enum(DEAL_TYPES).nullable().optional(),
  load_in_time: optTime,
  door_time: optTime,
  set_time: optTime,
  set_length_min: z.number().int().min(1).max(600).nullable().optional(),
  deal_notes: optText(5000),
  followup_on: isoDate.nullable().optional(),
};

/** Put a new date on the calendar for one band: a hold, a pending offer or a confirmed show. */
export const AddShowAction = z.object({
  type: z.literal('add_show'),
  roster_id: uuid,
  show_date: isoDate,
  status: z.enum(NEW_SHOW_STATUSES).default('hold'),
  ...ShowFields,
  reason,
});

/** Legacy shape from earlier conversations; treated as add_show with status hold. */
export const AddHoldAction = z.object({
  type: z.literal('add_hold'),
  roster_id: uuid,
  show_date: isoDate,
  venue_id: uuid.nullable().optional(),
  venue_name: optText(160),
  venue_city: optText(100),
  reason,
});

/** Change an existing show: status, date, venue, times, deal terms, notes. */
export const UpdateShowAction = z.object({
  type: z.literal('update_show'),
  show_id: uuid,
  changes: z
    .object({
      status: z.enum(SHOW_STATUS_CHANGES).optional(),
      show_date: isoDate.optional(),
      ...ShowFields,
    })
    .refine(c => Object.keys(c).length > 0, 'No changes'),
  reason,
});

/** Set (or move) the follow-up date on an existing show. */
export const SetFollowupAction = z.object({
  type: z.literal('set_followup'),
  show_id: uuid,
  followup_on: isoDate,
  reason,
});

// ── Bands ───────────────────────────────────────────────────────────────────
const BandFields = {
  genre: optText(80),
  home_city: optText(100),
  home_state: optText(100),
  contact_name: optText(120),
  contact_email: optEmail,
  contact_phone: optText(40),
  notes: optText(5000),
};

/** Add a band to the roster. The commission rate is left for the agent to set. */
export const AddBandAction = z.object({
  type: z.literal('add_band'),
  band_name: shortText(120),
  ...BandFields,
  reason,
});

/** Change a band's details or move it between active and inactive. */
export const UpdateBandAction = z.object({
  type: z.literal('update_band'),
  roster_id: uuid,
  changes: z
    .object({ band_name: shortText(120).optional(), status: z.enum(ROSTER_STATUSES).optional(), ...BandFields })
    .refine(c => Object.keys(c).length > 0, 'No changes'),
  reason,
});

// ── Venues ──────────────────────────────────────────────────────────────────
const VenueFields = {
  kind: z.enum(VENUE_KINDS).optional(),
  address: optText(200),
  city: optText(100),
  state: optText(100),
  postal_code: optText(20),
  capacity: z.number().int().min(0).max(200_000).nullable().optional(),
  website: optText(300),
  email: optEmail,
  phone: optText(40),
  notes: optText(5000),
};

/** Add a venue (or festival, fair, promoter, private event) to the book. */
export const AddVenueAction = z.object({
  type: z.literal('add_venue'),
  name: shortText(160),
  ...VenueFields,
  reason,
});

/** Change a venue already in the book. */
export const UpdateVenueAction = z.object({
  type: z.literal('update_venue'),
  venue_id: uuid,
  changes: z
    .object({ name: shortText(160).optional(), ...VenueFields })
    .refine(c => Object.keys(c).length > 0, 'No changes'),
  reason,
});

// ── Contacts ────────────────────────────────────────────────────────────────
const ContactFields = {
  title: optText(80),
  email: optEmail,
  phone: optText(40),
  notes: optText(5000),
};

/** Add a person (talent buyer, booker, owner) to a venue. Never shared with bands. */
export const AddContactAction = z.object({
  type: z.literal('add_contact'),
  venue_id: uuid,
  name: shortText(120),
  ...ContactFields,
  reason,
});

/** Change a contact's details. Sharing with bands is never changed here. */
export const UpdateContactAction = z.object({
  type: z.literal('update_contact'),
  contact_id: uuid,
  changes: z
    .object({ name: shortText(120).optional(), ...ContactFields })
    .refine(c => Object.keys(c).length > 0, 'No changes'),
  reason,
});

// ── Email ───────────────────────────────────────────────────────────────────
/** A ready-to-send email for the agent to review in the email dialog. */
export const DraftEmailAction = z.object({
  type: z.literal('draft_email'),
  venue_id: uuid.nullable().optional(),
  roster_id: uuid.nullable().optional(),
  subject: shortText(200),
  body: shortText(5000),
  reason,
});

export const AssistantAction = z.discriminatedUnion('type', [
  AddShowAction,
  AddHoldAction,
  UpdateShowAction,
  SetFollowupAction,
  AddBandAction,
  UpdateBandAction,
  AddVenueAction,
  UpdateVenueAction,
  AddContactAction,
  UpdateContactAction,
  DraftEmailAction,
]);
export type AssistantAction = z.infer<typeof AssistantAction>;
export type AssistantActionType = AssistantAction['type'];

/** Most proposals the assistant may return in one reply. */
export const MAX_ACTIONS = 10;

export const AssistantReply = z.object({
  reply: z.string().trim().min(1).max(6000),
  actions: z.array(z.unknown()).max(MAX_ACTIONS).default([]),
});

export interface KnownIds {
  bands: ReadonlySet<string>;
  venues: ReadonlySet<string>;
  /** Shows the agent can still change (not cancelled) */
  shows: ReadonlySet<string>;
  /** The agent's own contacts */
  contacts: ReadonlySet<string>;
}

const UPDATE_TYPES = new Set(['update_show', 'update_band', 'update_venue', 'update_contact']);
/** Keys that identify an update's target or describe it, never a field to change. */
const UPDATE_META = new Set(['type', 'reason', 'changes', 'show_id', 'roster_id', 'venue_id', 'contact_id']);

/**
 * Tidies raw model proposals before validation.
 *
 * The model sometimes puts an update's fields at the top level instead of in
 * "changes", and sometimes fills every field it was offered with null. For
 * updates, top-level fields are moved into "changes" but nulls are DROPPED:
 * an update only clears a field when it says so inside "changes", so a blank
 * placeholder can never wipe the agent's data. (update_show may legitimately
 * move a show to another venue, so a top-level venue_id there is a change.)
 */
export function normalizeProposals(raw: readonly unknown[]): unknown[] {
  return raw.map(r => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return r;
    const p = r as Record<string, unknown>;
    if (!UPDATE_TYPES.has(String(p.type))) return p;
    const changes: Record<string, unknown> = p.changes && typeof p.changes === 'object' && !Array.isArray(p.changes) ? { ...(p.changes as Record<string, unknown>) } : {};
    const out: Record<string, unknown> = { type: p.type, reason: p.reason };
    for (const [k, v] of Object.entries(p)) {
      if (k === 'changes' || k === 'type' || k === 'reason') continue;
      const isTarget = (p.type === 'update_show' && k === 'show_id') || (p.type === 'update_band' && k === 'roster_id') || (p.type === 'update_venue' && k === 'venue_id') || (p.type === 'update_contact' && k === 'contact_id');
      if (isTarget) out[k] = v;
      else if (v !== null && v !== undefined && !(k in changes) && (!UPDATE_META.has(k) || (p.type === 'update_show' && k === 'venue_id'))) changes[k] = v;
    }
    out.changes = changes;
    return out;
  });
}

/** True when a show proposal names a place: a saved venue or a typed name. */
const hasPlace = (a: { venue_id?: string | null; venue_name?: string | null }): boolean => Boolean(a.venue_id || a.venue_name);

/**
 * Keeps only well-formed proposals that point at the agent's own rows.
 * Anything malformed, or naming an id the agent doesn't have, is dropped
 * silently rather than shown as a broken card. Legacy add_hold proposals
 * are returned as add_show with status hold.
 */
export function validActions(raw: readonly unknown[], known: KnownIds, today: string): AssistantAction[] {
  const out: AssistantAction[] = [];
  const venueOk = (id: string | null | undefined): boolean => !id || known.venues.has(id);
  for (const r of raw.slice(0, MAX_ACTIONS)) {
    const p = AssistantAction.safeParse(r);
    if (!p.success) continue;
    const a = p.data;
    switch (a.type) {
      case 'add_hold':
      case 'add_show': {
        if (!known.bands.has(a.roster_id) || !venueOk(a.venue_id) || !hasPlace(a) || a.show_date < today) continue;
        if (a.type === 'add_show' && a.followup_on && a.followup_on < today) continue;
        out.push(a.type === 'add_hold' ? { ...a, type: 'add_show', status: 'hold' } : a);
        continue;
      }
      case 'update_show':
        if (!known.shows.has(a.show_id) || !venueOk(a.changes.venue_id)) continue;
        if (a.changes.followup_on && a.changes.followup_on < today) continue;
        break;
      case 'set_followup':
        if (!known.shows.has(a.show_id) || a.followup_on < today) continue;
        break;
      case 'update_band':
        if (!known.bands.has(a.roster_id)) continue;
        break;
      case 'update_venue':
        if (!known.venues.has(a.venue_id)) continue;
        break;
      case 'add_contact':
        if (!known.venues.has(a.venue_id)) continue;
        break;
      case 'update_contact':
        if (!known.contacts.has(a.contact_id)) continue;
        break;
      case 'draft_email':
        if (!venueOk(a.venue_id) || (a.roster_id && !known.bands.has(a.roster_id))) continue;
        break;
      case 'add_band':
      case 'add_venue':
        break;
    }
    out.push(a);
  }
  return out;
}

/** Questions to start with on an empty conversation. */
export const STARTER_QUESTIONS = [
  'What needs my attention this week?',
  'Which holds should I follow up on?',
  'Where are the open weekends for each band in the next two months?',
  'Find venues in a new city that would fit one of my bands',
  'How much commission is still owed to me this year?',
] as const;
