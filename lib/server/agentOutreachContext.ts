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
  const emailsByTarget = new Map<string, SentEmail[]>();
  for (const e of sent) {
    if (!e.tour_venue_id) continue;
    const list = emailsByTarget.get(e.tour_venue_id) ?? [];
    list.push(e);
    emailsByTarget.set(e.tour_venue_id, list);
  }
  const lastReplyByVenue = new Map<string, string>();
  for (const r of replies) {
    if (!r.venue_id || !r.sent_at) continue;
    const prev = lastReplyByVenue.get(r.venue_id);
    if (!prev || r.sent_at > prev) lastReplyByVenue.set(r.venue_id, r.sent_at);
  }

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
    const counts = STAGE_ORDER
      .map(s => [s, rows.filter(r => r.status === s).length] as const)
      .filter(([, n]) => n > 0)
      .map(([s, n]) => `${n} ${stageLabel(s)}`);
    const overdue = rows.filter(r => isOverdueFollowUp(r, now)).length;
    lines.push(`  ${tours.get(tourId) ?? 'Tour'} (tour id=${tourId}): ${counts.join(', ') || 'none'}${overdue ? ` · ${overdue} OVERDUE` : ''}`);

    const sorted = [...rows].sort((a, b) =>
      STAGE_ORDER.indexOf(a.status) - STAGE_ORDER.indexOf(b.status)
      || (a.venue?.name ?? '').localeCompare(b.venue?.name ?? ''));
    for (const r of sorted) {
      if (listed >= MAX_TARGET_LINES) break;
      listed++;
      const v = r.venue;
      const place = v ? `${line(v.name, 80) || 'Unnamed venue'}${v.city ? `, ${line(v.city, 40)}` : ''}${v.state ? ` ${v.state}` : ''}` : 'Unknown venue';
      const touched = lastTouch(r);
      const days = daysSince(touched, now);
      const emails = emailsByTarget.get(r.id) ?? [];
      const latest = emails[0];
      const reply = v ? lastReplyByVenue.get(v.id) : undefined;
      const parts = [
        stageLabel(r.status),
        touched ? `last contact ${day(touched)} (${days}d ago)` : 'never contacted',
        isOverdueFollowUp(r, now) ? 'OVERDUE' : null,
        emails.length ? `${emails.length} email${emails.length === 1 ? '' : 's'} sent, last "${line(latest?.subject, 70)}" ${day(latest?.sent_at)}` : 'no emails sent',
        reply ? `replied ${day(reply)}` : null,
        r.booking_date ? `for ${day(r.booking_date)}` : null,
        v?.email?.trim() ? null : 'NO EMAIL ON FILE',
      ].filter(Boolean);
      lines.push(`    - ${place} [${parts.join(' · ')}] tour_venue_id=${r.id}${v ? ` venue_id=${v.id}` : ''}`);
    }
  }
  if (targets.length > listed) lines.push(`    …and ${targets.length - listed} more venues not listed`);

  // Sent emails grouped by day + tour + subject, so a 17-venue blast is one entry.
  const tourOfTarget = new Map(targets.map(t => [t.id, tours.get(t.tour_id) ?? null]));
  const groups = new Map<string, SentEmail[]>();
  for (const e of sent) {
    const tour = e.tour_venue_id ? tourOfTarget.get(e.tour_venue_id) ?? '' : '';
    const key = `${day(e.sent_at)}|${tour}|${line(e.subject, 200).toLowerCase()}|${e.category ?? ''}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  lines.push('', `Sent emails, last ${OUTREACH_LOOKBACK_DAYS} days (${sent.length}), newest first — same day, tour and subject grouped, archived ones included:`);
  if (sent.length === 0) lines.push('  (none)');
  let shown = 0;
  for (const list of groups.values()) {
    if (shown >= MAX_SENT_GROUPS) break;
    shown++;
    const first = list[0];
    const tour = first.tour_venue_id ? tourOfTarget.get(first.tour_venue_id) : null;
    const names = list.map(e => line(one(e.venue)?.name ?? e.recipient, 40)).filter(Boolean);
    const to = list.length === 1
      ? `to ${names[0] || 'unknown'}`
      : `to ${list.length} venues: ${names.slice(0, 8).join(', ')}${names.length > 8 ? `, +${names.length - 8} more` : ''}`;
    lines.push(
      `  - email_id=${first.id} ${day(first.sent_at)}${tour ? ` · ${tour}` : ''} · ${categoryLabel(first.category)} · "${line(first.subject, 100) || '(no subject)'}" ${to}`,
      `    Body: ${cleanEmailBody(first.body, SENT_BODY_CHARS) || '(not stored)'}`,
    );
  }
  if (groups.size > shown) lines.push(`  …and ${groups.size - shown} older sends not listed`);

  return lines.join('\n');
}

/**
 * Loads the band's outreach and formats it for the agent. Fails soft: on a
 * query error the agent still works and says it can't see outreach right now.
 *
 * @param service service-role client — the act filter is the only scoping
 * @param actId   the caller's band, from their profile
 */
export async function buildOutreachContext(service: SupabaseClient, actId: string, now: Date = new Date()): Promise<string> {
  const unavailable = 'Outreach: (could not be loaded right now — tell the user to check the Email page\'s Outreach tab directly; do not guess)';
  try {
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
      return unavailable;
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
        return unavailable;
      }
      // PostgREST returns the joined venue as an object for a many-to-one join.
      targets = ((tv.data ?? []) as unknown as OutreachTarget[]).map(t => ({ ...t, venue: one(t.venue) }));
    }

    return formatOutreachContext(
      tours,
      targets,
      (sentRes.data ?? []) as unknown as SentEmail[],
      (repliesRes.data ?? []) as ReceivedStamp[],
      now.getTime(),
    );
  } catch (err) {
    console.error('[agent] outreach context threw:', err instanceof Error ? err.message : err);
    return unavailable;
  }
}
