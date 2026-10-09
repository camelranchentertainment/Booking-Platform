// lib/server/agentOfficeActions.ts
//
// The agent's "office" tools: inbox housekeeping, saving email drafts,
// inviting band members, band notes, and social post drafts. Each is staged
// for approval and executed by /api/help/actions/execute. Nothing here sends a
// social post, and nothing sends an email except the member invite the admin
// approves.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { buildDraftPayload } from './draftPayload';
import { assertInvitable, createAndSendInvite, InviteError, normalizeInviteEmail } from './memberInvite';

const one = (v: unknown, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD');

// ── Inbox: archive ──────────────────────────────────────────────────────────

export const MAX_ARCHIVE = 10;
export interface EmailArchivePayload { email_ids: string[]; labels: string[] }

/**
 * Validates archiving up to 10 of the band's received, unarchived emails.
 * @throws Error with a user-facing message
 */
export async function buildEmailArchivePayload(service: SupabaseClient, actId: string, raw: unknown): Promise<EmailArchivePayload> {
  const parsed = z.object({ email_ids: z.array(z.string().uuid()).min(1).max(MAX_ARCHIVE) }).safeParse(raw);
  if (!parsed.success) throw new Error(`Pick 1–${MAX_ARCHIVE} emails from the inbox list to archive.`);
  const ids = [...new Set(parsed.data.email_ids)];
  const { data, error } = await service
    .from('email_log')
    .select('id, from_address, subject')
    .eq('act_id', actId).eq('direction', 'received')
    .or('archived.is.null,archived.eq.false')
    .in('id', ids);
  if (error) throw new Error(`Inbox lookup failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; from_address: string | null; subject: string | null }>;
  if (rows.length !== ids.length) throw new Error("Some of those emails aren't in this band's inbox (or are already archived).");
  return { email_ids: rows.map(r => r.id), labels: rows.map(r => `${one(r.from_address, 60)}: ${one(r.subject, 60) || '(no subject)'}`) };
}

/** @throws Error when the write fails */
export async function executeEmailArchive(service: SupabaseClient, actId: string, payload: unknown) {
  const ids = (payload as Partial<EmailArchivePayload> | null)?.email_ids;
  const ok = z.array(z.string().uuid()).min(1).max(MAX_ARCHIVE).safeParse(ids);
  if (!ok.success) throw new Error('This archive request is no longer valid. Ask the assistant again.');
  const { data, error } = await service
    .from('email_log')
    .update({ archived: true, archived_at: new Date().toISOString() })
    .eq('act_id', actId).eq('direction', 'received')
    .in('id', ok.data)
    .select('id');
  if (error) throw new Error(`Could not archive: ${error.message}`);
  return { archived: (data ?? []).length };
}

// ── Email draft (saved, not sent) ───────────────────────────────────────────

export const emailDraftSchema = z.object({
  recipient: z.string().trim().toLowerCase().email("That recipient address doesn't look right"),
  subject: z.string().trim().max(300).default(''),
  body: z.string().trim().min(1, 'The draft is empty').max(50_000),
  venue_id: z.string().uuid().optional(),
  category: z.enum(['target', 'follow_up_1', 'follow_up_2', 'confirmation', 'decline', 'advance', 'thank_you', 'reply']).optional(),
});
export type EmailDraftPayload = z.infer<typeof emailDraftSchema> & { venue_name?: string };

async function ownedVenueName(service: SupabaseClient, actId: string, venueId?: string): Promise<string | undefined> {
  if (!venueId) return undefined;
  const { data, error } = await service.from('venues').select('id, name').eq('id', venueId).eq('act_id', actId).maybeSingle();
  if (error) throw new Error(`Venue lookup failed: ${error.message}`);
  if (!data) throw new Error("That venue wasn't found for this band.");
  return (data as { name: string }).name;
}

/** @throws Error with a user-facing message */
export async function buildEmailDraftPayload(service: SupabaseClient, actId: string, raw: unknown): Promise<EmailDraftPayload> {
  const parsed = emailDraftSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'That draft is not valid.');
  return { ...parsed.data, venue_name: await ownedVenueName(service, actId, parsed.data.venue_id) };
}

/** Saves the approved draft to the band's Drafts (nothing is sent). @throws Error */
export async function executeEmailDraft(service: SupabaseClient, actId: string, userId: string, payload: unknown) {
  const ok = emailDraftSchema.safeParse(payload);
  if (!ok.success) throw new Error('This draft is no longer valid. Ask the assistant again.');
  await ownedVenueName(service, actId, ok.data.venue_id);
  const row = buildDraftPayload(
    { recipient: ok.data.recipient, subject: ok.data.subject, body: ok.data.body, venueId: ok.data.venue_id, category: ok.data.category },
    userId, actId, [],
  );
  const { data, error } = await service.from('email_log').insert(row).select('id').single();
  if (error) throw new Error(`Could not save the draft: ${error.message}`);
  return data;
}

// ── Member invite ───────────────────────────────────────────────────────────

export interface MemberInvitePayload { email: string; personnel_id?: string; personnel_name?: string }

/**
 * Validates inviting someone to log in as a band MEMBER (never an admin from
 * the agent): plausible email, not already on the band, no pending invite,
 * and any roster link belongs to the band.
 * @throws Error with a user-facing message
 */
export async function buildMemberInvitePayload(service: SupabaseClient, actId: string, raw: unknown): Promise<MemberInvitePayload> {
  const r = (raw ?? {}) as { email?: unknown; personnel_id?: unknown };
  const email = normalizeInviteEmail(r.email);
  if (!email) throw new Error("That email address doesn't look right.");
  let personnelName: string | undefined;
  let personnelId: string | undefined;
  if (typeof r.personnel_id === 'string' && r.personnel_id) {
    if (!z.string().uuid().safeParse(r.personnel_id).success) throw new Error('Pick the person from the roster list.');
    const { data, error } = await service.from('act_personnel').select('id, name').eq('id', r.personnel_id).eq('act_id', actId).maybeSingle();
    if (error) throw new Error(`Roster lookup failed: ${error.message}`);
    if (!data) throw new Error("That person isn't on this band's roster.");
    personnelId = (data as { id: string }).id;
    personnelName = (data as { name: string }).name;
  }
  try {
    await assertInvitable(service, actId, email);
  } catch (e) {
    throw new Error(e instanceof InviteError ? e.message : 'Could not check existing members.');
  }
  return { email, ...(personnelId ? { personnel_id: personnelId, personnel_name: personnelName } : {}) };
}

/**
 * Sends the approved invite (member role only).
 * @throws Error with a user-facing message
 */
export async function executeMemberInvite(
  service: SupabaseClient, actId: string, inviter: { id: string; name: string }, payload: unknown,
) {
  const p = payload as Partial<MemberInvitePayload> | null;
  const checked = await buildMemberInvitePayload(service, actId, p);
  try {
    const { emailSent } = await createAndSendInvite(service, {
      actId, inviterId: inviter.id, inviterName: inviter.name, email: checked.email, role: 'member', personnelId: checked.personnel_id ?? null,
    });
    return { email: checked.email, emailSent };
  } catch (e) {
    throw new Error(e instanceof InviteError ? e.message : 'Could not send the invite.');
  }
}

// ── Notes ───────────────────────────────────────────────────────────────────

export const NOTE_VISIBILITY = ['admin_only', 'band_admin', 'all_members'] as const;
export const noteSchema = z.object({
  note_date: isoDate,
  content: z.string().trim().min(1, 'The note is empty').max(20_000),
  mode: z.enum(['append', 'replace']).default('append'),
  visibility: z.enum(NOTE_VISIBILITY).default('admin_only'),
  tour_id: z.string().uuid().nullable().optional(),
});
export type NotePayload = z.infer<typeof noteSchema> & { tour_name?: string; existing_preview?: string };

async function ownedTourName(service: SupabaseClient, actId: string, tourId?: string | null) {
  if (!tourId) return undefined;
  const { data, error } = await service.from('tours').select('id, name').eq('id', tourId).eq('act_id', actId).maybeSingle();
  if (error) throw new Error(`Tour lookup failed: ${error.message}`);
  if (!data) throw new Error("That tour wasn't found for this band.");
  return (data as { name: string }).name;
}

/**
 * Validates adding to (default) or replacing the caller's note for a day.
 * Notes are one per person per day, so "replace" overwrites that day's note;
 * the card shows what's there now.
 * @throws Error with a user-facing message
 */
export async function buildNotePayload(
  service: SupabaseClient, actId: string, userId: string, raw: unknown, today: string,
): Promise<NotePayload> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const parsed = noteSchema.safeParse({ ...r, note_date: r.note_date || today });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'That note is not valid.');
  const tourName = await ownedTourName(service, actId, parsed.data.tour_id);
  const { data: existing, error } = await service
    .from('daily_notes').select('content').eq('user_id', userId).eq('note_date', parsed.data.note_date).maybeSingle();
  if (error) throw new Error(`Note lookup failed: ${error.message}`);
  const prev = (existing as { content?: string } | null)?.content;
  return { ...parsed.data, ...(tourName ? { tour_name: tourName } : {}), ...(prev ? { existing_preview: one(prev, 160) } : {}) };
}

/** Writes the approved note as the approving user. @throws Error */
export async function executeNote(service: SupabaseClient, actId: string, userId: string, payload: unknown) {
  const ok = noteSchema.safeParse(payload);
  if (!ok.success) throw new Error('This note is no longer valid. Ask the assistant again.');
  await ownedTourName(service, actId, ok.data.tour_id);
  let content = ok.data.content;
  if (ok.data.mode === 'append') {
    const { data: existing } = await service
      .from('daily_notes').select('content').eq('user_id', userId).eq('note_date', ok.data.note_date).maybeSingle();
    const prev = (existing as { content?: string } | null)?.content?.trim();
    if (prev) content = `${prev}\n\n${content}`;
  }
  const { data, error } = await service
    .from('daily_notes')
    .upsert({
      user_id: userId, note_date: ok.data.note_date, content, act_id: actId,
      tour_id: ok.data.tour_id ?? null, visibility: ok.data.visibility, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,note_date' })
    .select('id, note_date')
    .single();
  if (error) throw new Error(`Could not save the note: ${error.message}`);
  return data;
}

// ── Social drafts (never posted from here) ──────────────────────────────────

export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const;
export const socialDraftSchema = z.object({
  booking_id: z.string().uuid('Pick the show from your list'),
  platform: z.enum(SOCIAL_PLATFORMS),
  caption: z.string().trim().min(1, 'The caption is empty').max(2200, 'Keep the caption under 2,200 characters (Instagram\'s limit)'),
});
export interface SocialDraftPayload {
  booking_id: string;
  announcement_id: string;
  venue_name: string;
  show_date: string | null;
  platform: (typeof SOCIAL_PLATFORMS)[number];
  caption: string;
  replaces_existing: boolean;
}

async function loadAnnouncement(service: SupabaseClient, actId: string, bookingId: string) {
  const { data, error } = await service
    .from('social_announcements')
    .select('id, status, booking:bookings(show_date, venue:venues(name))')
    .eq('booking_id', bookingId).eq('act_id', actId).maybeSingle();
  if (error) throw new Error(`Social lookup failed: ${error.message}`);
  if (!data) throw new Error('That show has no social card yet — cards appear on the Socials page once a show is confirmed.');
  const a = data as unknown as { id: string; status: string; booking: { show_date: string | null; venue: { name: string } | { name: string }[] | null } | null };
  if (a.status === 'dismissed' || a.status === 'posted') throw new Error(`That show's social card is ${a.status}.`);
  const v = a.booking?.venue;
  return { id: a.id, status: a.status, show_date: a.booking?.show_date ?? null, venue_name: (Array.isArray(v) ? v[0]?.name : v?.name) ?? '' };
}

async function existingPost(service: SupabaseClient, announcementId: string, platform: string) {
  const { data, error } = await service
    .from('social_posts').select('id, status').eq('announcement_id', announcementId).eq('platform', platform).maybeSingle();
  if (error) throw new Error(`Social lookup failed: ${error.message}`);
  return data as { id: string; status: string } | null;
}

/**
 * Validates a caption draft for a confirmed show's social card. Only a draft
 * can be replaced — an approved/scheduled/posted post is left alone.
 * @throws Error with a user-facing message
 */
export async function buildSocialDraftPayload(service: SupabaseClient, actId: string, raw: unknown): Promise<SocialDraftPayload> {
  const parsed = socialDraftSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'That social draft is not valid.');
  const ann = await loadAnnouncement(service, actId, parsed.data.booking_id);
  const post = await existingPost(service, ann.id, parsed.data.platform);
  if (post && post.status !== 'draft') throw new Error(`The ${parsed.data.platform} post for that show is already ${post.status}.`);
  return {
    booking_id: parsed.data.booking_id, announcement_id: ann.id, venue_name: ann.venue_name, show_date: ann.show_date,
    platform: parsed.data.platform, caption: parsed.data.caption, replaces_existing: Boolean(post),
  };
}

/** Saves the approved caption as a DRAFT post (status 'draft'; never posted here). @throws Error */
export async function executeSocialDraft(service: SupabaseClient, actId: string, payload: unknown) {
  const p = payload as Partial<SocialDraftPayload> | null;
  const ok = socialDraftSchema.safeParse({ booking_id: p?.booking_id, platform: p?.platform, caption: p?.caption });
  if (!ok.success) throw new Error('This social draft is no longer valid. Ask the assistant again.');
  const ann = await loadAnnouncement(service, actId, ok.data.booking_id);
  const post = await existingPost(service, ann.id, ok.data.platform);
  const now = new Date().toISOString();

  if (post) {
    if (post.status !== 'draft') throw new Error(`The ${ok.data.platform} post for that show is already ${post.status}.`);
    const { error } = await service.from('social_posts').update({ caption: ok.data.caption, updated_at: now })
      .eq('id', post.id).eq('act_id', actId).eq('status', 'draft');
    if (error) throw new Error(`Could not save the draft: ${error.message}`);
  } else {
    const { error } = await service.from('social_posts').insert({
      announcement_id: ann.id, act_id: actId, platform: ok.data.platform, delivery: 'manual_kit',
      options: {}, caption: ok.data.caption, status: 'draft', created_at: now, updated_at: now,
    });
    if (error) throw new Error(`Could not save the draft: ${error.message}`);
  }
  if (ann.status === 'ready') {
    await service.from('social_announcements').update({ status: 'drafting', updated_at: now }).eq('id', ann.id).eq('act_id', actId);
  }
  return { announcement_id: ann.id, platform: ok.data.platform, status: 'draft' };
}

// ── Read context ────────────────────────────────────────────────────────────

/**
 * Notes visible to this admin (own + band-shared, last 14 days) and the band's
 * open social cards with any draft captions. Fails soft.
 */
export async function buildOfficeContext(service: SupabaseClient, actId: string, userId: string, today: string): Promise<string> {
  try {
    const since = new Date(new Date(`${today}T00:00:00Z`).getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
    const [nRes, sRes] = await Promise.all([
      service.from('daily_notes')
        .select('note_date, content, visibility, user_id')
        .or(`user_id.eq.${userId},and(act_id.eq.${actId},visibility.in.(band_admin,all_members))`)
        .gte('note_date', since).order('note_date', { ascending: false }).limit(20),
      service.from('social_announcements')
        .select('status, booking_id, booking:bookings(show_date, venue:venues(name)), posts:social_posts(platform, status, caption)')
        .eq('act_id', actId).in('status', ['ready', 'drafting']).limit(20),
    ]);
    const lines: string[] = [];
    const notes = (nRes.data ?? []) as Array<{ note_date: string; content: string; visibility: string; user_id: string }>;
    lines.push(`Band notes, last 14 days (${notes.length}):`);
    for (const n of notes) lines.push(`  - ${n.note_date}${n.user_id === userId ? ' (yours)' : ''} [${n.visibility}]: ${one(n.content, 240)}`);
    const cards = (sRes.data ?? []) as unknown as Array<{ status: string; booking_id: string; booking: { show_date: string | null; venue: { name: string } | { name: string }[] | null } | null; posts: Array<{ platform: string; status: string; caption: string }> | null }>;
    lines.push(`Social cards for confirmed shows (${cards.length}):`);
    for (const c of cards) {
      const v = c.booking?.venue;
      const venue = (Array.isArray(v) ? v[0]?.name : v?.name) ?? '';
      lines.push(`  - booking_id=${c.booking_id} ${c.booking?.show_date ?? ''} ${one(venue, 60)} [${c.status}]`);
      for (const p of c.posts ?? []) lines.push(`      · ${p.platform} [${p.status}]: ${one(p.caption, 160)}`);
    }
    return lines.join('\n');
  } catch (err) {
    console.error('[agent] office context failed:', err instanceof Error ? err.message : err);
    return 'Notes/social: (could not be loaded right now)';
  }
}
