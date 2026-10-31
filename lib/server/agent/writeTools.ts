// lib/server/agent/writeTools.ts
//
// Tools that PROPOSE changes. None of them writes the band's data: each one
// validates, checks the target belongs to the band, and stages a pending
// ai_staged_actions row — exactly what the classic agent does — then adds it
// to this turn's ProposalCollector. When the turn ends, everything staged goes
// to the browser as ONE approval card; nothing is saved until the user clicks
// Confirm, which runs /api/help/actions/execute.
//
// Every tool reuses the classic agent's validators and staging functions, so
// both agents enforce identical rules (money definitions, what may be
// deleted, no financial records removed, member-only invites, etc.).
//
// Limits replace the classic per-reply caps (4 shows, 8 venues, one action):
// up to MAX_STAGED_PER_TURN items of any mix per turn, on one card.

import { z } from 'zod';
import {
  execStageTourInsert,
  execStagePaymentSettle,
  execStageEmail,
  execStageEmailTemplate,
  execStagePersonnelUpsert,
  execStageCalendarSettingsUpdate,
} from '../../aiAgentTools';
import { StageItemSchema, describeStagedItems } from '../../agentStagingHelpers';
import { FEATURES } from '../../featureFlags';
import { stageAction } from '../agentStage';
import { tourUpdateSchema, buildTourUpdatePayload } from '../agentTourActions';
import { venueUpsertSchema, contactUpsertSchema, buildContactUpsertPayload } from '../agentVenueActions';
import { stageVenueBatch, VENUE_BATCH_CAP } from '../agentVenueBatch';
import { wrapupSchema, expenseUpdateSchema, buildWrapupPayload, buildExpenseUpdatePayload } from '../agentMoneyActions';
import { deleteRequestSchema, buildDeletePayload } from '../agentDeletes';
import {
  emailDraftSchema,
  noteSchema,
  socialDraftSchema,
  buildEmailArchivePayload,
  buildEmailDraftPayload,
  buildMemberInvitePayload,
  buildNotePayload,
  buildSocialDraftPayload,
} from '../agentOfficeActions';
import { resolveStageItems } from './stageItems';
import { resolveTourOutreach } from './tourOutreach';
import { parseOutreachStage, parseAgreedDraft } from '../../domain/tourOutreach';
import {
  defineTool,
  type AgentTool,
  type AgentToolContext,
  type AgentToolResult,
  type ProposalCollector,
  type StagedCardItem,
} from './types';

/** Most changes one turn may stage. The card and the execute route both handle this comfortably. */
export const MAX_STAGED_PER_TURN = 40;
/** Most show/travel/notes/expense items in one stage_shows call. */
export const MAX_ITEMS_PER_CALL = 25;
/** Most venues in one save_venues call (staged internally in VENUE_BATCH_CAP chunks). */
export const MAX_VENUES_PER_CALL = 40;

const uuid = (msg: string) => z.string().uuid(msg);

/** Creates an empty collector for one turn. */
export function newProposalCollector(recent: ProposalCollector['dedup']['recent'] = []): ProposalCollector {
  return { staged: [], errors: [], outreach: null, dedup: { pending: [], recent } };
}

function collectorOf(ctx: AgentToolContext): ProposalCollector {
  if (!ctx.proposals) throw new Error('Proposals are not available on this route.');
  return ctx.proposals;
}

/** How many more items this turn may stage. */
function room(c: ProposalCollector): number {
  return MAX_STAGED_PER_TURN - c.staged.length;
}

/** Refuses a new staged change when the turn is already carrying a bulk-outreach card. */
function assertNoOutreach(c: ProposalCollector): void {
  if (c.outreach) {
    throw new Error('A bulk outreach card is already waiting in this reply. Stage other changes in your next message, after the user decides on the outreach.');
  }
}

/**
 * Adds staged items to the turn and describes them for the model. Items are
 * also recorded as pending for dedup, so a later call in the same turn can't
 * stage the same thing again.
 */
function record(c: ProposalCollector, items: StagedCardItem[], errors: string[] = []): AgentToolResult {
  for (const item of items) {
    c.staged.push(item);
    c.dedup.pending.push({ action_type: item.action_type, payload: { ...(item.proposal as Record<string, unknown>) } });
  }
  c.errors.push(...errors);
  const parts: string[] = [];
  if (items.length) parts.push(`${describeStagedItems(items)}\n(${c.staged.length} change${c.staged.length === 1 ? '' : 's'} on the card so far; the user confirms them together. Nothing is saved yet.)`);
  if (errors.length) parts.push(`Not staged:\n${errors.map(e => `- ${e}`).join('\n')}`);
  return { content: parts.join('\n\n') || 'Nothing was staged.', isError: items.length === 0 && errors.length > 0 };
}

/** Wraps a single-item staging call in the common checks. */
async function stageOne(ctx: AgentToolContext, kind: string, stage: () => Promise<Omit<StagedCardItem, 'kind'>>): Promise<AgentToolResult> {
  const c = collectorOf(ctx);
  assertNoOutreach(c);
  if (room(c) < 1) return { content: `This reply already has ${MAX_STAGED_PER_TURN} changes on its card — the most one card takes. Ask the user to confirm these first.`, isError: true };
  const result = await stage();
  return record(c, [{ kind, ...result }]);
}

// ── Shows, travel days, tour notes, expenses ──────────────────────────────────

export const stageShowsTool = defineTool({
  name: 'stage_shows',
  kind: 'write',
  description:
    'Proposes adding or updating shows, travel days, tour notes and projected expenses, several at once. '
    + 'New show at a saved venue: venueName (+ venueCity) and date. New show at a venue that isn\'t saved yet: also venueState and any '
    + 'venueAddress/venueZip/venuePhone/venueEmail/venueWebsite — the card saves the venue and the show together. '
    + 'Update or cancel an existing show: booking_id from get_shows plus only the fields that change (status "cancelled" to cancel). '
    + 'Link a standalone show to a tour: booking_id with tour_name. Status defaults to confirmed for new shows. '
    + 'Times are HH:MM (24h). Leave tour_name out for standalone shows; never attach a show to a tour the user didn\'t name. '
    + 'Check get_shows first so you update an existing booking instead of duplicating it. '
    + 'Money for a show (fee, deal, payment received) is NOT set here — use record_payment.',
  schema: z.object({
    tour_name: z.string().trim().max(200).optional().describe('The tour these items belong to. Omit for standalone shows. Required for tour notes and expenses.'),
    items: z.array(StageItemSchema).min(1).max(MAX_ITEMS_PER_CALL),
  }).strict(),
  status: i => `Staging ${i.items.length} item${i.items.length === 1 ? '' : 's'}${i.tour_name ? ` on ${i.tour_name}` : ''}…`,
  run: async (ctx, input) => {
    const c = collectorOf(ctx);
    assertNoOutreach(c);
    const allowed = input.items.slice(0, Math.max(0, room(c)));
    const skipped = input.items.length - allowed.length;
    if (!allowed.length) return { content: `The card is full (${MAX_STAGED_PER_TURN} changes). Ask the user to confirm these first.`, isError: true };
    const { staged, errors } = await resolveStageItems(ctx.actId, ctx.userId, input.tour_name ?? '', allowed, ctx.service, c.dedup);
    if (skipped) errors.push(`${skipped} more item${skipped === 1 ? '' : 's'} didn't fit on this card (max ${MAX_STAGED_PER_TURN}); stage them after the user confirms.`);
    return record(c, staged as StagedCardItem[], errors);
  },
});

// ── Tours ─────────────────────────────────────────────────────────────────────

export const createTourTool = defineTool({
  name: 'create_tour',
  kind: 'write',
  description: 'Proposes a brand-new tour. After the user confirms it, shows can be added to it by name with stage_shows (in a later message).',
  schema: z.object({
    name: z.string().trim().min(1).max(200),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    description: z.string().trim().max(5000).optional(),
  }).strict(),
  status: i => `Setting up the ${i.name} tour…`,
  run: (ctx, input) => stageOne(ctx, 'tour_create', () => execStageTourInsert(ctx.actId, ctx.userId, input)),
});

export const updateTourTool = defineTool({
  name: 'update_tour',
  kind: 'write',
  description:
    'Proposes changes to a tour itself: rename, new dates, description, or status (planning, active, completed, cancelled). '
    + 'Include only the fields that change. Cancelling a tour leaves its shows as they are; cancel shows separately with stage_shows. '
    + 'Tour notes go through stage_shows (kind "tour_notes").',
  schema: tourUpdateSchema.strict(),
  status: () => 'Preparing the tour change…',
  run: (ctx, input) => stageOne(ctx, 'tour_update', async () => {
    const payload = await buildTourUpdatePayload(ctx.service, ctx.actId, input);
    return stageAction(ctx.service, ctx.actId, ctx.userId, 'tour_update', payload);
  }),
});

// ── Money ─────────────────────────────────────────────────────────────────────

export const recordPaymentTool = defineTool({
  name: 'record_payment',
  kind: 'write',
  description:
    'Proposes the money on one show. Two different things — get this right:\n'
    + '(a) agreed_amount = the contracted fee / deal ("it pays 2500", "the fee is 800"). Use this when the show hasn\'t been played '
    + 'or nothing says money arrived. Do not set received or payment_status for this.\n'
    + '(b) actual_amount_received + payment_status "received" = money that actually came in ("got paid", "deposit came in", '
    + '"they sent us $X"). Deciding factor is the language, not the date.\n'
    + 'If it is ambiguous and the show is upcoming, use (a). If the show already happened and it\'s ambiguous, ask. '
    + 'To correct a wrong entry, set the fields that no longer apply to null. booking_id must come from get_shows.',
  schema: z.object({
    booking_id: uuid('Use a booking_id from get_shows.'),
    agreed_amount: z.number().min(0).max(10_000_000).nullable().optional(),
    actual_amount_received: z.number().min(0).max(10_000_000).nullable().optional(),
    payment_status: z.string().trim().max(40).nullable().optional(),
  }).strict(),
  status: () => 'Preparing the payment update…',
  run: (ctx, input) => stageOne(ctx, 'payment_settle', () =>
    // The staging function treats undefined as "no change" and passes null through as "clear it".
    execStagePaymentSettle(ctx.actId, ctx.userId, input as Parameters<typeof execStagePaymentSettle>[2])),
});

export const updateExpenseTool = defineTool({
  name: 'update_expense',
  kind: 'write',
  description: 'Proposes edits to an expense already logged (expense_id from get_money); only changed fields. Expenses can never be archived or deleted by you — the user does that on the Financials page. New expenses go through stage_shows (kind "expense").',
  schema: expenseUpdateSchema.strict(),
  status: () => 'Preparing the expense change…',
  run: (ctx, input) => stageOne(ctx, 'expense_update', async () => {
    const payload = await buildExpenseUpdatePayload(ctx.service, ctx.actId, input);
    return stageAction(ctx.service, ctx.actId, ctx.userId, 'expense_update', payload);
  }),
});

export const logWrapupTool = defineTool({
  name: 'log_show_wrapup',
  kind: 'write',
  description: 'Proposes a post-show wrap-up for a show that already happened: attendance, 1–5 rating, would return, rebook flag, venue feedback, show notes, and mark_completed when it isn\'t completed yet. Money received is record_payment, not this.',
  schema: wrapupSchema.strict(),
  status: () => 'Preparing the show wrap-up…',
  run: (ctx, input) => stageOne(ctx, 'booking_wrapup', async () => {
    const payload = await buildWrapupPayload(ctx.service, ctx.actId, input, ctx.today);
    return stageAction(ctx.service, ctx.actId, ctx.userId, 'booking_wrapup', payload);
  }),
});

// ── Venues and contacts ───────────────────────────────────────────────────────

export const saveVenuesTool = defineTool({
  name: 'save_venues',
  kind: 'write',
  description:
    'Proposes adding or editing one or more saved venues. Edit: venue_id (from find_venues) plus ONLY the fields that change. '
    + 'New: name, city and state (plus anything else known). Put all changes for one venue in one entry. Use web_search to find '
    + 'missing details first; never guess an email or phone. To add a show at a new venue, use stage_shows instead (it saves both). '
    + 'A field you send that already has that exact value is left off the card: it is already saved, not a failure, so say so '
    + 'plainly ("already on file") and never tell the user it may not have saved.',
  schema: z.object({
    venues: z.array(venueUpsertSchema).min(1).max(MAX_VENUES_PER_CALL),
  }).strict(),
  status: i => (i.venues.length === 1 ? `Preparing ${i.venues[0].name ?? 'the venue'}…` : `Preparing ${i.venues.length} venues…`),
  run: async (ctx, input) => {
    const c = collectorOf(ctx);
    assertNoOutreach(c);
    const allowed = input.venues.slice(0, Math.max(0, room(c)));
    const skipped = input.venues.length - allowed.length;
    if (!allowed.length) return { content: `The card is full (${MAX_STAGED_PER_TURN} changes). Ask the user to confirm these first.`, isError: true };
    const staged: StagedCardItem[] = [];
    const errors: string[] = [];
    // The shared batch stager caps each call; feeding it chunks lifts the per-reply cap without changing its checks.
    for (let i = 0; i < allowed.length; i += VENUE_BATCH_CAP) {
      const result = await stageVenueBatch(ctx.service, ctx.actId, ctx.userId, allowed.slice(i, i + VENUE_BATCH_CAP));
      staged.push(...(result.staged as StagedCardItem[]));
      errors.push(...result.errors);
    }
    if (skipped) errors.push(`${skipped} more venue${skipped === 1 ? '' : 's'} didn't fit on this card; stage them after the user confirms.`);
    return record(c, staged, errors);
  },
});

export const saveContactTool = defineTool({
  name: 'save_venue_contact',
  kind: 'write',
  description: 'Proposes adding or editing a person at a venue (talent buyer, booker, manager). venue_id from find_venues; contact_id only when editing (listed under the venue). Once saved, that person\'s emails start appearing in the inbox.',
  schema: contactUpsertSchema.strict(),
  status: () => 'Preparing the contact…',
  run: (ctx, input) => stageOne(ctx, 'contact_upsert', async () => {
    const payload = await buildContactUpsertPayload(ctx.service, ctx.actId, input);
    return stageAction(ctx.service, ctx.actId, ctx.userId, 'contact_upsert', payload);
  }),
});

// ── Email ─────────────────────────────────────────────────────────────────────

const EMAIL_CATEGORIES = ['target', 'follow_up_1', 'follow_up_2', 'confirmation', 'decline', 'advance', 'thank_you', 'reply'] as const;

export const sendEmailTool = defineTool({
  name: 'send_email',
  kind: 'write',
  description:
    'Proposes sending ONE email to a venue. When the user confirms, it really sends to a real person, so the recipient, subject and '
    + 'body must be exactly right. venue_id must come from find_venues/get_venue/get_outreach; recipient must be an address on file '
    + 'for that venue or one the user gave you. Show the user the full email in your reply. For many venues on a tour at once, '
    + 'use prepare_tour_outreach. To save without sending, use save_email_draft.',
  schema: z.object({
    venue_id: uuid('Use a venue_id from find_venues.'),
    booking_id: uuid('Use a booking_id from get_shows.').optional(),
    recipient: z.string().trim().toLowerCase().email('That recipient address doesn\'t look right'),
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(50_000),
    category: z.enum(EMAIL_CATEGORIES).default('reply'),
  }).strict(),
  status: i => `Drafting the email to ${i.recipient}…`,
  run: (ctx, input) => stageOne(ctx, 'email_send', () => execStageEmail(ctx.actId, ctx.userId, input)),
});

export const saveEmailDraftTool = defineTool({
  name: 'save_email_draft',
  kind: 'write',
  description: 'Proposes saving an email as a draft (not sent) in the Drafts tab of the Email page, for the user to finish and send.',
  schema: emailDraftSchema.strict(),
  status: () => 'Saving the draft…',
  run: (ctx, input) => stageOne(ctx, 'email_draft', async () => {
    const payload = await buildEmailDraftPayload(ctx.service, ctx.actId, input);
    return stageAction(ctx.service, ctx.actId, ctx.userId, 'email_draft', { ...payload });
  }),
});

export const saveEmailTemplateTool = defineTool({
  name: 'save_email_template',
  kind: 'write',
  description: 'Proposes saving a reusable email template. Write the parts that change per venue as bracketed blanks ([Venue Name], [Contact Name], [Date], [City]); nothing is filled in automatically. A template with the same title is replaced.',
  schema: z.object({
    name: z.string().trim().min(1).max(120),
    subject: z.string().trim().max(300).default(''),
    body: z.string().trim().min(1).max(50_000),
  }).strict(),
  status: i => `Preparing the "${i.name}" template…`,
  run: (ctx, input) => stageOne(ctx, 'email_template_upsert', () => execStageEmailTemplate(ctx.actId, ctx.userId, input)),
});

export const archiveEmailsTool = defineTool({
  name: 'archive_emails',
  kind: 'write',
  description: 'Proposes archiving received emails (email_id values from get_inbox), at most 10.',
  schema: z.object({ email_ids: z.array(uuid('Use email_id values from get_inbox.')).min(1).max(10) }).strict(),
  status: i => `Archiving ${i.email_ids.length} email${i.email_ids.length === 1 ? '' : 's'}…`,
  run: (ctx, input) => stageOne(ctx, 'email_archive', async () => {
    const payload = await buildEmailArchivePayload(ctx.service, ctx.actId, input);
    return stageAction(ctx.service, ctx.actId, ctx.userId, 'email_archive', { ...payload });
  }),
});

export const prepareTourOutreachTool = defineTool({
  name: 'prepare_tour_outreach',
  kind: 'write',
  description:
    'Prepares a bulk email to venues on a tour: stage "target" pitches the venues in Target; "follow_up" follows up with venues '
    + 'already pitched (overdue_only for 7+ days with no contact). The user reviews the venue list and the draft on their own card '
    + 'and sends from there. If the user agreed an exact email in this conversation, pass it as draft word for word; otherwise '
    + 'leave draft out and one is written for them to review. This card stands alone: stage other changes in another message.',
  schema: z.object({
    tour_name: z.string().trim().min(1).max(200),
    stage: z.enum(['target', 'follow_up']),
    overdue_only: z.boolean().optional(),
    draft: z.object({ subject: z.string().trim().max(300).optional(), body: z.string().trim().min(1).max(50_000) }).optional(),
  }).strict(),
  status: i => `Lining up ${i.stage === 'follow_up' ? 'follow-ups' : 'pitches'} for ${i.tour_name}…`,
  run: async (ctx, input) => {
    const c = collectorOf(ctx);
    if (c.outreach) return { content: 'There is already an outreach card in this reply. One at a time.', isError: true };
    if (c.staged.length) return { content: 'Other changes are already on this reply\'s card. Prepare the outreach in the next message, after the user confirms those.', isError: true };
    if (!ctx.anthropicKey) throw new Error('Drafting isn\'t available right now.');
    const result = await resolveTourOutreach(
      ctx.service, ctx.actId, input.tour_name, ctx.anthropicKey,
      parseOutreachStage(input.stage), input.overdue_only === true, parseAgreedDraft(input.draft),
    );
    if ('error' in result) return { content: result.error, isError: true };
    c.outreach = { type: 'tour_outreach', ...result };
    const withEmail = result.venues.filter((v: { email?: string | null }) => v.email).length;
    return {
      content: `Outreach card ready for "${result.tourName}": ${result.venues.length} venues (${withEmail} with an email), `
        + `${result.draftSource === 'agreed' ? 'using the agreed email' : 'with a fresh draft for review'}.\n`
        + `Draft subject: ${result.draft.subject}\nDraft body:\n${result.draft.body}\n`
        + 'The user picks venues, edits and sends from the card. Nothing has been sent.',
    };
  },
});

// ── Band admin ────────────────────────────────────────────────────────────────

export const updateRosterTool = defineTool({
  name: 'update_roster',
  kind: 'write',
  description: 'Proposes adding someone to the band roster or updating them (personnel_id to update). Only the fields given. Adding to the roster doesn\'t give them a login — use invite_member for that.',
  schema: z.object({
    personnel_id: uuid('Use a personnel id from the roster.').optional(),
    name: z.string().trim().min(1).max(200).optional(),
    instrument_role: z.string().trim().max(120).optional(),
    default_pay_amount: z.number().min(0).max(1_000_000).optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().email().optional(),
    is_active: z.boolean().optional(),
  }).strict().refine(v => Boolean(v.personnel_id || v.name), { message: 'Give a name for someone new, or personnel_id to update.' }),
  status: i => `Preparing the roster change${i.name ? ` for ${i.name}` : ''}…`,
  run: (ctx, input) => stageOne(ctx, 'personnel_upsert', () => execStagePersonnelUpsert(ctx.actId, ctx.userId, input)),
});

export const inviteMemberTool = defineTool({
  name: 'invite_member',
  kind: 'write',
  description: 'Proposes inviting someone to log in to the band as a MEMBER (they see the schedule, not money). Never an admin — the user adds admins on the Members page. Link personnel_id when they\'re already on the roster.',
  schema: z.object({
    email: z.string().trim().toLowerCase().email('That email address doesn\'t look right'),
    personnel_id: uuid('Use a personnel id from the roster.').optional(),
  }).strict(),
  status: i => `Preparing an invite for ${i.email}…`,
  run: (ctx, input) => stageOne(ctx, 'member_invite', async () => {
    const payload = await buildMemberInvitePayload(ctx.service, ctx.actId, input);
    return stageAction(ctx.service, ctx.actId, ctx.userId, 'member_invite', { ...payload });
  }),
});

export const calendarSyncTool = defineTool({
  name: 'update_calendar_sync',
  kind: 'write',
  description: 'Proposes turning Google Calendar sync on or off and/or renaming the synced calendar. Never touches logins or keys.',
  schema: z.object({
    sync_enabled: z.boolean().optional(),
    calendar_name: z.string().trim().min(1).max(120).optional(),
  }).strict().refine(v => v.sync_enabled !== undefined || v.calendar_name !== undefined, { message: 'Say what to change.' }),
  status: () => 'Preparing the calendar setting…',
  run: (ctx, input) => stageOne(ctx, 'calendar_settings_update', () => execStageCalendarSettingsUpdate(ctx.actId, ctx.userId, input)),
});

export const writeNoteTool = defineTool({
  name: 'write_note',
  kind: 'write',
  description: 'Proposes adding to (default) or replacing a band note for a day (default today). Visibility defaults to admin_only; use all_members only when the user says to share it with the band, band_admin for other admins.',
  schema: noteSchema.extend({ note_date: noteSchema.shape.note_date.optional() }).strict(),
  status: () => 'Preparing the note…',
  run: (ctx, input) => stageOne(ctx, 'note_upsert', async () => {
    const payload = await buildNotePayload(ctx.service, ctx.actId, ctx.userId, { ...input, note_date: input.note_date ?? ctx.today }, ctx.today);
    return stageAction(ctx.service, ctx.actId, ctx.userId, 'note_upsert', { ...payload });
  }),
});

export const deleteRecordsTool = defineTool({
  name: 'delete_records',
  kind: 'write',
  description:
    'Proposes deleting up to a few items of ONE kind: upcoming shows (booking_id), a tour (one, and ask first whether its upcoming '
    + 'shows go too: include_shows true/false), roster members (people with history are retired, not erased), notes, or media. '
    + 'Never: past or completed shows, anything with money attached, expenses, payments, emails, venues, contacts, logins, the band. '
    + 'Offer status "cancelled" for shows that can\'t be deleted.',
  schema: deleteRequestSchema,
  status: () => 'Checking what can be deleted…',
  run: (ctx, input) => stageOne(ctx, 'record_delete', async () => {
    const payload = await buildDeletePayload(ctx.service, ctx.actId, ctx.userId, input);
    return stageAction(ctx.service, ctx.actId, ctx.userId, 'record_delete', payload);
  }),
});

export const draftSocialPostTool = defineTool({
  name: 'draft_social_post',
  kind: 'write',
  description: 'Proposes saving a caption draft for a confirmed show\'s social card (one platform). It is never posted — posting always needs the user\'s own click on the Socials page.',
  schema: socialDraftSchema.strict(),
  status: () => 'Drafting the post…',
  run: (ctx, input) => stageOne(ctx, 'social_draft', async () => {
    const payload = await buildSocialDraftPayload(ctx.service, ctx.actId, input);
    return stageAction(ctx.service, ctx.actId, ctx.userId, 'social_draft', { ...payload });
  }),
});

/** Every write tool offered to the model. Social drafting is left out while Socials is switched off. */
export function writeTools(): AgentTool[] {
  return [
    stageShowsTool,
    recordPaymentTool,
    createTourTool,
    updateTourTool,
    saveVenuesTool,
    saveContactTool,
    sendEmailTool,
    saveEmailDraftTool,
    prepareTourOutreachTool,
    saveEmailTemplateTool,
    archiveEmailsTool,
    logWrapupTool,
    updateExpenseTool,
    updateRosterTool,
    inviteMemberTool,
    calendarSyncTool,
    writeNoteTool,
    deleteRecordsTool,
    ...(FEATURES.socials ? [draftSocialPostTool] : []),
  ] as AgentTool[];
}

/**
 * The approval card for the turn, in the shape the panel already renders:
 * a bulk-outreach card, or one stage_items card with every staged change.
 *
 * @param c - The turn's collector.
 * @returns The action for the `done` event, or undefined when nothing was proposed.
 */
export function buildApprovalAction(c: ProposalCollector): Record<string, unknown> | undefined {
  if (c.outreach) return c.outreach;
  if (!c.staged.length) return undefined;
  return { type: 'stage_items', staged: c.staged, errors: c.errors, overflow: 0 };
}
