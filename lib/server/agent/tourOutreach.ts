// lib/server/agent/tourOutreach.ts
//
// Builds the bulk-outreach approval card for one tour: the venues in the
// requested stage and one shared draft. Moved out of pages/api/agent.ts
// unchanged so the classic agent and the tool-based agent share it.

import Anthropic from '@anthropic-ai/sdk';
import type { getServiceClient } from '../../supabase';
import { formatShowDate } from '../../formatDate';
import { buildVoiceSystemPrompt, relationshipFor } from '../../emailVoice';
import { cleanEmailBody } from '../agentInboxContext';
import {
  matchTour,
  buildOutreachVenues,
  selectOutreachRows,
  emptyOutreachMessage,
  type AgreedDraft,
  type OutreachStage,
  type StageRow,
  type TargetRow,
  type VenueContact,
} from '../../domain/tourOutreach';

/**
 * Builds the bulk-outreach card for one tour: the venues in the requested
 * stage (first pitch to Target, or follow-up to Follow up) and one shared
 * draft. A follow-up draft is written from the last email those venues got.
 */
export async function resolveTourOutreach(
  service: ReturnType<typeof getServiceClient>,
  actId: string,
  tourName: string,
  anthropicKey: string,
  stage: OutreachStage,
  overdueOnly: boolean,
  agreedDraft: AgreedDraft | null,
): Promise<{ tourId: string; tourName: string; stage: OutreachStage; venues: any[]; draft: { subject: string; body: string }; draftSource: 'agreed' | 'generated' } | { error: string }> {
  // Find the tour the user named. No silent fallback to "some tour": emailing
  // the wrong tour's venues is worse than asking.
  const { data: tours, error: toursErr } = await service.from('tours')
    .select('id, name, start_date, end_date, routing_notes')
    .eq('act_id', actId).not('status', 'in', '(cancelled,completed)');
  if (toursErr) {
    console.error('[agent] tour outreach: tours load failed', { actId, message: toursErr.message });
    return { error: 'I couldn’t load your tours just now. Please try again in a moment.' };
  }

  const tour = matchTour((tours || []) as Array<{ id: string; name: string; start_date: string | null; end_date: string | null; routing_notes: string | null }>, tourName);
  if (!tour) return { error: `I couldn’t tell which tour you mean by "${tourName}". Your open tours: ${(tours || []).map((t: any) => t.name).join(', ') || 'none'}.` };

  // Every venue on the tour, so an empty stage can say where the venues are.
  // Contacts hang off the venue (not the target), so they are loaded below.
  const { data: tvRows, error: tvErr } = await service
    .from('tour_venues')
    .select('id, tour_id, status, booking_date, last_contacted_at, pitched_at, updated_at, venue:venues(id, name, city, state, email)')
    .eq('tour_id', tour.id)
    .in('status', ['target', 'follow_up']);
  if (tvErr) {
    // Previously this error was swallowed and read as "no targets".
    console.error('[agent] tour outreach: targets load failed', { actId, tourId: tour.id, message: tvErr.message });
    return { error: `I couldn’t load the venues on "${tour.name}" just now. Please try again in a moment.` };
  }

  const allRows = ((tvRows || []) as unknown as (TargetRow & StageRow)[]).filter(r => r.venue);
  const rows = selectOutreachRows(allRows, stage, overdueOnly);
  if (!rows.length) return { error: emptyOutreachMessage(tour.name, allRows, stage, overdueOnly) };

  // Saved contacts for those venues. Service role bypasses RLS, so act_id scopes
  // this to the caller's band — another band's contacts at the same venue never leak.
  const venueIds = rows.map(r => (r.venue as NonNullable<TargetRow['venue']>).id);
  const { data: contactRows, error: contactErr } = await service.from('contacts')
    .select('venue_id, first_name, last_name, email, status')
    .eq('act_id', actId)
    .in('venue_id', venueIds);
  if (contactErr) {
    // Not fatal: venue emails still work; the greeting just falls back to a generic one.
    console.error('[agent] tour outreach: contacts load failed', { actId, tourId: tour.id, message: contactErr.message });
  }
  const venues = buildOutreachVenues(rows, (contactRows || []) as VenueContact[]);

  // The last email these venues were sent — what a follow-up follows up on.
  let lastSent: { subject: string | null; body: string | null; sent_at: string | null } | null = null;
  if (stage === 'follow_up') {
    const { data: prior, error: priorErr } = await service.from('email_log')
      .select('subject, body, sent_at')
      .eq('act_id', actId).eq('direction', 'sent')
      .in('tour_venue_id', rows.map(r => r.id))
      .order('sent_at', { ascending: false }).limit(1).maybeSingle();
    if (priorErr) console.error('[agent] tour outreach: last email load failed', { actId, tourId: tour.id, message: priorErr.message });
    lastSent = prior ?? null;
  }

  // Fetch act for draft
  const { data: act } = await service.from('acts').select('act_name, genre, bio, website, spotify, instagram').eq('id', actId).single();

  // Generate one shared draft email via AI
  const fmt = (d: string) => formatShowDate(d, { month: 'long', day: 'numeric', year: 'numeric' });
  const dateRange = tour.start_date
    ? `${fmt(tour.start_date)}${tour.end_date ? ` through ${fmt(tour.end_date)}` : ''}`
    : '[dates TBD]';

  const facts = `Act: ${act?.act_name}
Genre: ${act?.genre || 'N/A'}
Bio: ${act?.bio || 'Solid regional act with a growing following'}
Website: ${act?.website || ''}
Tour: ${tour.name} — ${dateRange}
Routing notes: ${tour.routing_notes || 'N/A'}`;

  const fallback = stage === 'follow_up'
    ? { subject: lastSent?.subject ? `Re: ${lastSent.subject}` : `Following up - ${act?.act_name}`, body: `{contact_name},\n\nFollowing up on my email about ${act?.act_name} at {venue_name} during our ${tour.name} run (${dateRange}). Do any of those dates work?\n\nThanks,` }
    : { subject: `Booking - ${act?.act_name}`, body: `{contact_name},\n\nI'm looking to get ${act?.act_name} booked at {venue_name} during our ${tour.name} run (${dateRange}). Do you have any of those dates open?\n\nThanks,\nCamel Ranch Booking` };

  // The user already approved this exact email in chat: send that, not a rewrite.
  if (agreedDraft) {
    return {
      tourId: tour.id,
      tourName: tour.name,
      stage,
      venues,
      draft: { subject: agreedDraft.subject ?? fallback.subject, body: agreedDraft.body },
      draftSource: 'agreed',
    };
  }

  const draftPrompt = stage === 'follow_up'
    ? `Write a short follow-up to a booking email these venues have not answered. Use {venue_name} and {contact_name} as placeholders that will be personalized per recipient.

${facts}

The email they were sent${lastSent?.sent_at ? ` on ${fmt(lastSent.sent_at.slice(0, 10))}` : ''}:
Subject: ${lastSent?.subject || '(unknown)'}
${cleanEmailBody(lastSent?.body, 1500) || '(the original text was not stored — write a follow-up that stands on its own)'}

Refer back to that email in one line, restate the dates and the ask, and keep it to two or three sentences. Use "Re: " plus the original subject as the subject when there is one.

Output ONLY valid JSON: { "subject": "...", "body": "..." }`
    : `Write a cold pitch booking email for the following act. Use {venue_name} and {contact_name} as placeholders that will be personalized per recipient.

${facts}

Lead with the dates and the ask. Keep it to a few sentences.

Output ONLY valid JSON: { "subject": "...", "body": "..." }`;

  const client = new Anthropic({ apiKey: anthropicKey });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: buildVoiceSystemPrompt({
      task: stage === 'follow_up'
        ? `You draft one short follow-up booking email, sent to many venues that haven't answered a pitch, for a working band's booking team. Write as a person from the band's side, not a booking firm.`
        : `You draft one cold pitch booking email, sent to many venues, for a working band's booking team. Write as a person from the band's side, not a booking firm.`,
      relationship: relationshipFor(stage === 'follow_up' ? 'follow_up_1' : 'target', false),
      outputSpec: 'Output ONLY valid JSON: { "subject": "...", "body": "..." }',
    }),
    messages: [{ role: 'user', content: draftPrompt }],
  });
  const raw = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  let draft = fallback;
  if (jsonMatch) {
    try { draft = JSON.parse(jsonMatch[0]); } catch { /* malformed draft: use the fallback text */ }
  }

  return {
    tourId: tour.id,
    tourName: tour.name,
    stage,
    venues,
    draft,
    draftSource: 'generated',
  };
}
