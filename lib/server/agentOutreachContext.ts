// lib/server/agentOutreachContext.ts
//
// Gives the /band agent the same outreach picture the Email page's Outreach
// tab shows: every venue being pitched on an open tour, in every stage
// (Target, Follow up, Confirmed, Declined, Thank you), with when it was last
// contacted, whether it is overdue, how many emails went to it and when it
// last replied, plus the emails the band actually sent.
//
// Before this the agent saw only received emails, so it told users it
// couldn't read their sent outreach and couldn't write the follow-up to it.
//
// Read-only. Sent emails are written by the band, received ones are not:
// this section carries no received email text (that stays in the Inbox
// section, inside its untrusted-content markers).

import type { SupabaseClient } from '@supabase/supabase-js';
import { matchTour } from '../domain/tourOutreach';
import { cleanEmailBody } from './agentInboxContext';
import { daysSince, isOverdueFollowUp, lastTouch, stageLabel, BOOKING_STAGE_LABELS } from '../domain/emailPipeline';

/** How far back sent emails are listed. */
export const OUTREACH_LOOKBACK_DAYS = 60;
/** Most sent emails read (newest first) before grouping. */
const MAX_SENT_EMAILS = 400;
/** Most venue lines listed across all tours. */
const MAX_TARGET_LINES = 150;
/** Most sent-email groups listed. */
const MAX_SENT_GROUPS = 20;
/** Characters of each group's email body shown. */
const SENT_BODY_CHARS = 700;

export interface OutreachTarget {
  id: string;
  tour_id: string;
  status: string;
  booking_date: string | null;
  last_contacted_at: string | null;
  pitched_at: string | null;
  updated_at: string | null;
  venue: { id: string; name: string | null; city: string | null; state: string | null; email: string | null } | null;
}

export interface SentEmail {
  id: string;
  sent_at: string | null;
  recipient: string | null;
  subject: string | null;
  body: string | null;
  category: string | null;
  tour_venue_id: string | null;
  venue_id: string | null;
  venue: { name: string | null } | { name: string | null }[] | null;
}

export interface ReceivedStamp { venue_id: string | null; sent_at: string | null }

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const day = (iso: string | null | undefined): string => (iso ?? '').slice(0, 10) || 'no date';
const line = (v: string | null | undefined, max = 120): string => {
  const s = (v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
};
const categoryLabel = (c: string | null): string => (c ? BOOKING_STAGE_LABELS[c] ?? c : 'Email');

const STAGE_ORDER = ['follow_up', 'target', 'confirmed', 'declined', 'thank_you'];

/** Venues per get_outreach page. Sized so a page always fits under the agent's tool result cap. */
export const OUTREACH_VENUES_PER_PAGE = 35;
/** Sent-email groups per get_outreach page; each carries a body, so fewer fit. */
export const OUTREACH_SENT_PER_PAGE = 10;

/** Sent emails by tour target, newest first as given. */
function emailsByTargetOf(sent: SentEmail[]): Map<string, SentEmail[]> {
  const out = new Map<string, SentEmail[]>();
  for (const e of sent) {
    if (!e.tour_venue_id) continue;
    const list = out.get(e.tour_venue_id) ?? [];
    list.push(e);
    out.set(e.tour_venue_id, list);
  }
  return out;
}

/** Each venue's most recent reply date. */
function lastReplyByVenueOf(replies: ReceivedStamp[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of replies) {
    if (!r.venue_id || !r.sent_at) continue;
    const prev = out.get(r.venue_id);
    if (!prev || r.sent_at > prev) out.set(r.venue_id, r.sent_at);
  }
  return out;
}

/** "3 Follow up, 12 Target · 2 OVERDUE" for one tour's rows. */
function tourCounts(rows: OutreachTarget[], now: number): string {
  const counts = STAGE_ORDER
    .map(s => [s, rows.filter(r => r.status === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${stageLabel(s)}`);
  const overdue = rows.filter(r => isOverdueFollowUp(r, now)).length;
  return `${counts.join(', ') || 'none'}${overdue ? ` · ${overdue} OVERDUE` : ''}`;
}

/** Rows in board order: by stage, then venue name. */
function boardOrder(rows: OutreachTarget[]): OutreachTarget[] {
  return [...rows].sort((a, b) =>
    STAGE_ORDER.indexOf(a.status) - STAGE_ORDER.indexOf(b.status)
    || (a.venue?.name ?? '').localeCompare(b.venue?.name ?? ''));
}

/** One venue's board line. */
function targetLine(r: OutreachTarget, emailsByTarget: Map<string, SentEmail[]>, lastReply: Map<string, string>, now: number): string {
  const v = r.venue;
  const place = v ? `${line(v.name, 80) || 'Unnamed venue'}${v.city ? `, ${line(v.city, 40)}` : ''}${v.state ? ` ${v.state}` : ''}` : 'Unknown venue';
  const touched = lastTouch(r);
  const days = daysSince(touched, now);
  const emails = emailsByTarget.get(r.id) ?? [];
  const latest = emails[0];
  const reply = v ? lastReply.get(v.id) : undefined;
  const parts = [
    stageLabel(r.status),
    touched ? `last contact ${day(touched)} (${days}d ago)` : 'never contacted',
    isOverdueFollowUp(r, now) ? 'OVERDUE' : null,
    emails.length ? `${emails.length} email${emails.length === 1 ? '' : 's'} sent, last "${line(latest?.subject, 70)}" ${day(latest?.sent_at)}` : 'no emails sent',
    reply ? `replied ${day(reply)}` : null,
    r.booking_date ? `for ${day(r.booking_date)}` : null,
    v?.email?.trim() ? null : 'NO EMAIL ON FILE',
  ].filter(Boolean);
  return `    - ${place} [${parts.join(' · ')}] tour_venue_id=${r.id}${v ? ` venue_id=${v.id}` : ''}`;
}

/** Same day, tour and subject grouped, so a 17-venue blast is one entry. */
function sentGroups(sent: SentEmail[], tourOfTarget: Map<string, string | null>): SentEmail[][] {
  const groups = new Map<string, SentEmail[]>();
  for (const e of sent) {
    const tour = e.tour_venue_id ? tourOfTarget.get(e.tour_venue_id) ?? '' : '';
    const key = `${day(e.sent_at)}|${tour}|${line(e.subject, 200).toLowerCase()}|${e.category ?? ''}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }
  return [...groups.values()];
}

/** One group's two lines: who it went to, then the shared body. */
function sentGroupLines(list: SentEmail[], tourOfTarget: Map<string, string | null>): string[] {
  const first = list[0];
  const tour = first.tour_venue_id ? tourOfTarget.get(first.tour_venue_id) : null;
  const names = list.map(e => line(one(e.venue)?.name ?? e.recipient, 40)).filter(Boolean);
  const to = list.length === 1
    ? `to ${names[0] || 'unknown'}`
    : `to ${list.length} venues: ${names.slice(0, 8).join(', ')}${names.length > 8 ? `, +${names.length - 8} more` : ''}`;
  return [
    `  - email_id=${first.id} ${day(first.sent_at)}${tour ? ` · ${tour}` : ''} · ${categoryLabel(first.category)} · "${line(first.subject, 100) || '(no subject)'}" ${to}`,
    `    Body: ${cleanEmailBody(first.body, SENT_BODY_CHARS) || '(not stored)'}`,
  ];
}

/**
 * Formats the "Outreach" section. Exported for tests.
 *
 * @param tours   open tours, by id
 * @param targets every tour_venues row on those tours
 * @param sent    sent emails, newest first
 * @param replies received emails' venue and date (any archive state)
 */
export function formatOutreachContext(
  tours: Map<string, string>,
  targets: OutreachTarget[],
  sent: SentEmail[],
  replies: ReceivedStamp[],
  now: number = Date.now(),
): string {
  const emailsByTarget = emailsByTargetOf(sent);
  const lastReplyByVenue = lastReplyByVenueOf(replies);

  const lines: string[] = [
    'Outreach — the Email page\'s Outreach tab: venues being pitched on open tours, in every stage, and the emails sent to them.',
    'Stages: Target (not emailed yet or first pitch only) → Follow up (pitched, waiting on an answer) → Confirmed / Declined / Thank you.',
    'A Follow up venue is OVERDUE when it has had no contact for 7+ days.',
  ];

  if (targets.length === 0) {
    lines.push('  (no venues are being pitched on any open tour)');
  }

  let listed = 0;
  const byTour = new Map<string, OutreachTarget[]>();
  for (const t of targets) {
    const list = byTour.get(t.tour_id) ?? [];
    list.push(t);
    byTour.set(t.tour_id, list);
  }
  for (const [tourId, rows] of byTour) {
    lines.push(`  ${tours.get(tourId) ?? 'Tour'} (tour id=${tourId}): ${tourCounts(rows, now)}`);

    for (const r of boardOrder(rows)) {
      if (listed >= MAX_TARGET_LINES) break;
      listed++;
      lines.push(targetLine(r, emailsByTarget, lastReplyByVenue, now));
    }
  }
  if (targets.length > listed) lines.push(`    …and ${targets.length - listed} more venues not listed`);

  const tourOfTarget = new Map(targets.map(t => [t.id, tours.get(t.tour_id) ?? null]));
  const groups = sentGroups(sent, tourOfTarget);

  lines.push('', `Sent emails, last ${OUTREACH_LOOKBACK_DAYS} days (${sent.length}), newest first — same day, tour and subject grouped, archived ones included:`);
  if (sent.length === 0) lines.push('  (none)');
  let shown = 0;
  for (const list of groups) {
    if (shown >= MAX_SENT_GROUPS) break;
    shown++;
    lines.push(...sentGroupLines(list, tourOfTarget));
  }
  if (groups.length > shown) lines.push(`  …and ${groups.length - shown} older sends not listed`);

  return lines.join('\n');
}

interface OutreachData {
  tours: Map<string, string>;
  targets: OutreachTarget[];
  sent: SentEmail[];
  replies: ReceivedStamp[];
}

const UNAVAILABLE = 'Outreach: (could not be loaded right now — tell the user to check the Email page\'s Outreach tab directly; do not guess)';

/**
 * Loads the band's open tours, their targets, sent emails and reply dates.
 *
 * @param service service-role client — the act filter is the only scoping
 * @param actId   the caller's band, from their profile
 * @returns the data, or null when any query failed (already logged)
 */
async function loadOutreachData(service: SupabaseClient, actId: string, now: Date): Promise<OutreachData | null> {
  const since = new Date(now.getTime() - OUTREACH_LOOKBACK_DAYS * 86_400_000).toISOString();
  const [toursRes, sentRes, repliesRes] = await Promise.all([
    service.from('tours').select('id, name').eq('act_id', actId).not('status', 'in', '(cancelled,completed)'),
    service.from('email_log')
      .select('id, sent_at, recipient, subject, body, category, tour_venue_id, venue_id, venue:venues(name)')
      .eq('act_id', actId).eq('direction', 'sent')
      .or('is_draft.is.null,is_draft.eq.false')
      .gte('sent_at', since)
      .order('sent_at', { ascending: false })
      .limit(MAX_SENT_EMAILS),
    service.from('email_log').select('venue_id, sent_at')
      .eq('act_id', actId).eq('direction', 'received').not('venue_id', 'is', null)
      .order('sent_at', { ascending: false }).limit(500),
  ]);
  const firstErr = toursRes.error ?? sentRes.error ?? repliesRes.error;
  if (firstErr) {
    console.error('[agent] outreach context load failed:', firstErr.message);
    return null;
  }

  const tours = new Map(((toursRes.data ?? []) as { id: string; name: string }[]).map(t => [t.id, t.name]));
  let targets: OutreachTarget[] = [];
  if (tours.size) {
    const tv = await service.from('tour_venues')
      .select('id, tour_id, status, booking_date, last_contacted_at, pitched_at, updated_at, venue:venues(id, name, city, state, email)')
      .in('tour_id', [...tours.keys()])
      .limit(1000);
    if (tv.error) {
      console.error('[agent] outreach targets load failed:', tv.error.message);
      return null;
    }
    // PostgREST returns the joined venue as an object for a many-to-one join.
    targets = ((tv.data ?? []) as unknown as OutreachTarget[]).map(t => ({ ...t, venue: one(t.venue) }));
  }
  return {
    tours,
    targets,
    sent: (sentRes.data ?? []) as unknown as SentEmail[],
    replies: (repliesRes.data ?? []) as ReceivedStamp[],
  };
}

/**
 * Loads the band's outreach and formats it for the classic agent. Fails soft: on a
 * query error the agent still works and says it can't see outreach right now.
 *
 * @param service service-role client — the act filter is the only scoping
 * @param actId   the caller's band, from their profile
 */
export async function buildOutreachContext(service: SupabaseClient, actId: string, now: Date = new Date()): Promise<string> {
  try {
    const data = await loadOutreachData(service, actId, now);
    if (!data) return UNAVAILABLE;
    return formatOutreachContext(data.tours, data.targets, data.sent, data.replies, now.getTime());
  } catch (err) {
    console.error('[agent] outreach context threw:', err instanceof Error ? err.message : err);
    return UNAVAILABLE;
  }
}

export interface OutreachPageOptions {
  /** 'venues' lists the board; 'sent_emails' lists what was sent, with bodies. */
  view: 'venues' | 'sent_emails';
  tourName?: string;
  stage?: string;
  /** How many entries to skip, from the previous page's note. */
  offset: number;
}

/**
 * Formats one page of the outreach board. The whole board doesn't fit in one
 * tool result, so every page states the full counts and exactly how to get the
 * next page. Exported for tests.
 *
 * @param data    the band's outreach
 * @param options view, filters and offset
 * @param now     current time in ms
 */
export function formatOutreachPage(data: OutreachData, options: OutreachPageOptions, now: number = Date.now()): string {
  const { tours, targets, sent, replies } = data;
  const { view, tourName, stage, offset } = options;

  const openTours = [...tours].map(([id, name]) => ({ id, name }));
  const tour = tourName ? matchTour(openTours, tourName) : null;
  if (tourName && !tour) {
    return `No single open tour matches "${tourName}". Open tours: ${openTours.map(t => t.name).join(', ') || 'none'}.`;
  }

  const lines = ['Outreach, from the Email page\'s Outreach tab. Stages: Target → Follow up (pitched, waiting on an answer) → Confirmed / Declined / Thank you. A Follow up venue is OVERDUE after 7+ days with no contact.'];
  for (const [id, name] of tours) {
    lines.push(`  ${name} (tour id=${id}): ${tourCounts(targets.filter(t => t.tour_id === id), now)}`);
  }
  if (!tours.size) lines.push('  (no open tours)');
  lines.push('');

  const nextPage = (from: number, total: number, shown: number, noun: string) => {
    const end = from + shown;
    if (!total) return `No ${noun} match.`;
    if (from >= total) return `That offset is past the end: there are ${total} ${noun}.`;
    return end < total
      ? `Showing ${from + 1}–${end} of ${total} ${noun}. THIS IS NOT ALL OF THEM: call get_outreach again with the same filters and offset=${end} before answering about the rest.`
      : `Showing ${from + 1}–${end} of ${total} ${noun}. That is all of them.`;
  };

  if (view === 'sent_emails') {
    const tourOfTarget = new Map(targets.map(t => [t.id, tours.get(t.tour_id) ?? null]));
    const onTour = tour ? new Set(targets.filter(t => t.tour_id === tour.id).map(t => t.id)) : null;
    const scoped = onTour ? sent.filter(e => e.tour_venue_id && onTour.has(e.tour_venue_id)) : sent;
    const groups = sentGroups(scoped, tourOfTarget);
    const page = groups.slice(offset, offset + OUTREACH_SENT_PER_PAGE);
    lines.push(`Sent emails, last ${OUTREACH_LOOKBACK_DAYS} days, newest first. Same day, tour and subject are one entry:`);
    for (const list of page) lines.push(...sentGroupLines(list, tourOfTarget));
    lines.push(nextPage(offset, groups.length, page.length, 'sent email groups'));
    return lines.join('\n');
  }

  const scoped = targets.filter(t => (!tour || t.tour_id === tour.id) && (!stage || t.status === stage));
  const ordered = (tour ? [tour.id] : [...tours.keys()])
    .flatMap(id => boardOrder(scoped.filter(t => t.tour_id === id)));
  const page = ordered.slice(offset, offset + OUTREACH_VENUES_PER_PAGE);
  const emailsByTarget = emailsByTargetOf(sent);
  const lastReply = lastReplyByVenueOf(replies);
  let currentTour: string | null = null;
  for (const r of page) {
    if (r.tour_id !== currentTour) {
      currentTour = r.tour_id;
      lines.push(`  ${tours.get(r.tour_id) ?? 'Tour'}:`);
    }
    lines.push(targetLine(r, emailsByTarget, lastReply, now));
  }
  lines.push(nextPage(offset, ordered.length, page.length, 'venues'));
  return lines.join('\n');
}

/**
 * Loads the band's outreach and returns one page for the agent's get_outreach
 * tool. Fails soft like buildOutreachContext.
 *
 * @param service service-role client — the act filter is the only scoping
 * @param actId   the caller's band, from their profile
 * @param options view, filters and offset
 */
export async function buildOutreachPage(service: SupabaseClient, actId: string, options: OutreachPageOptions, now: Date = new Date()): Promise<string> {
  try {
    const data = await loadOutreachData(service, actId, now);
    return data ? formatOutreachPage(data, options, now.getTime()) : UNAVAILABLE;
  } catch (err) {
    console.error('[agent] outreach page threw:', err instanceof Error ? err.message : err);
    return UNAVAILABLE;
  }
}
