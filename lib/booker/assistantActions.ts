// lib/booker/assistantActions.ts
// What the agent's AI assistant may *propose*. The assistant never writes
// anything: each proposal is shown as a card, and only the agent's Approve
// click performs it, through the normal RLS-scoped workspace calls (so a
// proposal can never touch another agent's data).
//
// Shared by the server (validating model output) and the page (re-validating
// against the rows actually loaded before showing a card).

import { z } from 'zod';
import { isIsoDate } from './dates';

const uuid = z.uuid();
const isoDate = z.string().refine(isIsoDate, 'Invalid date');
const shortText = (max: number) => z.string().trim().min(1).max(max);

/** Pencil in a hold for a band. */
export const AddHoldAction = z.object({
  type: z.literal('add_hold'),
  roster_id: uuid,
  show_date: isoDate,
  /** A venue from the book, or a free-text venue name */
  venue_id: uuid.nullable().optional(),
  venue_name: shortText(160).nullable().optional(),
  venue_city: shortText(100).nullable().optional(),
  /** One line on why, shown on the card */
  reason: shortText(300),
});

/** Set (or move) the follow-up date on an existing show. */
export const SetFollowupAction = z.object({
  type: z.literal('set_followup'),
  show_id: uuid,
  followup_on: isoDate,
  reason: shortText(300),
});

/** A ready-to-send email for the agent to review in the email dialog. */
export const DraftEmailAction = z.object({
  type: z.literal('draft_email'),
  venue_id: uuid.nullable().optional(),
  roster_id: uuid.nullable().optional(),
  subject: shortText(200),
  body: shortText(5000),
  reason: shortText(300),
});

export const AssistantAction = z.discriminatedUnion('type', [AddHoldAction, SetFollowupAction, DraftEmailAction]);
export type AssistantAction = z.infer<typeof AssistantAction>;

export const AssistantReply = z.object({
  reply: z.string().trim().min(1).max(6000),
  actions: z.array(z.unknown()).max(5).default([]),
});

export interface KnownIds {
  bands: ReadonlySet<string>;
  venues: ReadonlySet<string>;
  /** Shows the agent can still change (not cancelled) */
  shows: ReadonlySet<string>;
}

/**
 * Keeps only well-formed proposals that point at the agent's own rows.
 * Anything malformed, or naming an id the agent doesn't have, is dropped
 * silently rather than shown as a broken card.
 */
export function validActions(raw: readonly unknown[], known: KnownIds, today: string): AssistantAction[] {
  const out: AssistantAction[] = [];
  for (const r of raw) {
    const p = AssistantAction.safeParse(r);
    if (!p.success) continue;
    const a = p.data;
    if (a.type === 'add_hold') {
      if (!known.bands.has(a.roster_id)) continue;
      if (a.venue_id && !known.venues.has(a.venue_id)) continue;
      if (!a.venue_id && !a.venue_name) continue;
      if (a.show_date < today) continue;
    } else if (a.type === 'set_followup') {
      if (!known.shows.has(a.show_id) || a.followup_on < today) continue;
    } else {
      if (a.venue_id && !known.venues.has(a.venue_id)) continue;
      if (a.roster_id && !known.bands.has(a.roster_id)) continue;
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
  'How much commission is still owed to me this year?',
] as const;
