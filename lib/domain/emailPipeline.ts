// lib/domain/emailPipeline.ts
//
// Pure helpers behind the Email page (pages/email/index.tsx): the outreach
// stages, "what to do next" for a booking's email thread, days-since-contact
// with its urgency, pipeline sorting, archive search and the header numbers.
// Colours are expressed as tones ('ok' | 'due' | 'late' | 'done' | 'new'),
// which the page maps to design tokens. Unit-tested in
// __tests__/lib/domain/emailPipeline.test.ts.

import { parseLocalDate } from '../formatDate';

export type Tone = 'ok' | 'due' | 'late' | 'done' | 'new';

/** Tour-target outreach stages (tour_venues.status), in pipeline order. */
export const PIPELINE_STAGES = [
  { key: 'target', label: 'Target' },
  { key: 'follow_up', label: 'Follow up' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'declined', label: 'Declined' },
  { key: 'thank_you', label: 'Thank you' },
] as const;

export type StageKey = typeof PIPELINE_STAGES[number]['key'];

export const stageLabel = (key: string): string =>
  PIPELINE_STAGES.find(s => s.key === key)?.label ?? key;

/** Booking email-thread stages (bookings.email_stage). */
export const BOOKING_STAGE_LABELS: Readonly<Record<string, string>> = {
  target: 'Cold pitch', follow_up_1: 'Follow up 1', follow_up_2: 'Follow up 2',
  confirmation: 'Confirmation', decline: 'Decline', advance: 'Advance', thank_you: 'Thank you', cold: 'Cold',
};

const MS_DAY = 86_400_000;

/** Whole days from `iso` (date or timestamp) to `now`; null when there is no date. */
export function daysSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = parseLocalDate(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / MS_DAY));
}

/** Urgency of a days-since-contact number: under a week is fine, two weeks is due, longer is late. */
export function contactTone(days: number | null): Tone {
  if (days === null) return 'done';
  if (days <= 7) return 'ok';
  if (days <= 14) return 'due';
  return 'late';
}

export interface ThreadBooking {
  status: string;
  show_date: string | null;
  email_stage: string | null;
  last_contact_date: string | null;
}

export interface NextAction {
  label: string;
  tone: Tone;
  /** The email category to send next, or null when nothing is due. */
  next: string | null;
}

/**
 * What to do next on a booking's email thread, based on its stage, days since
 * last contact and days until the show. Same rules the page has always used.
 */
export function nextAction(b: ThreadBooking, now: number = Date.now()): NextAction {
  const stage = b.email_stage;
  const since = daysSince(b.last_contact_date, now) ?? 999;
  const until = b.show_date ? Math.floor((parseLocalDate(b.show_date).getTime() - now) / MS_DAY) : 999;
  const waiting = (n: number, next: string | null): NextAction => ({ label: `Awaiting reply (${n}d)`, tone: 'ok', next });
  switch (stage) {
    case null:
    case undefined:
    case '':
      return ['completed', 'cancelled'].includes(b.status)
        ? { label: 'Archived', tone: 'done', next: null }
        : { label: 'Send cold pitch', tone: 'new', next: 'target' };
    case 'target':
      if (since < 7) return waiting(since, 'follow_up_1');
      if (since < 11) return { label: 'Follow up due', tone: 'due', next: 'follow_up_1' };
      return { label: `Overdue (${since}d)`, tone: 'late', next: 'follow_up_1' };
    case 'follow_up_1':
      if (since < 7) return waiting(since, 'follow_up_2');
      if (since < 11) return { label: 'Follow up 2 due', tone: 'due', next: 'follow_up_2' };
      return { label: `Overdue (${since}d)`, tone: 'late', next: 'follow_up_2' };
    case 'follow_up_2':
      if (since < 14) return waiting(since, null);
      return { label: 'No response — mark cold?', tone: 'late', next: null };
    case 'confirmation':
      if (until > 14) return { label: `Advance in ${until - 14}d`, tone: 'ok', next: 'advance' };
      if (until >= 0) return { label: 'Send advance now', tone: until < 7 ? 'late' : 'due', next: 'advance' };
      return { label: 'Show passed', tone: 'done', next: 'thank_you' };
    case 'advance':
      if (until > 0) return { label: `Show in ${until}d`, tone: 'ok', next: null };
      if (since < 7) return { label: 'Show just ended', tone: 'due', next: 'thank_you' };
      return { label: 'Send thank you', tone: 'late', next: 'thank_you' };
    case 'thank_you': return { label: 'Complete', tone: 'done', next: null };
    case 'decline': return { label: 'Declined', tone: 'done', next: null };
    case 'cold': return { label: 'Cold', tone: 'done', next: null };
    default: return { label: stage, tone: 'done', next: null };
  }
}

/** Booking threads still worth showing in the outreach list. */
export function isActiveThread(b: ThreadBooking): boolean {
  return !b.email_stage || !['cold', 'decline', 'thank_you', 'cancelled', 'completed'].includes(b.email_stage);
}

export interface TargetRow {
  id: string;
  status: string;
  last_contacted_at: string | null;
  pitched_at?: string | null;
  updated_at: string | null;
  venue: { name: string | null } | null;
  tour: { name: string | null } | null;
}

/** The date a target was last touched: contact, else pitch, else the row's last update. */
export const lastTouch = (t: Pick<TargetRow, 'last_contacted_at' | 'pitched_at' | 'updated_at'>): string | null =>
  t.last_contacted_at || t.pitched_at || t.updated_at || null;

export type SortField = 'venue' | 'tour' | 'status' | 'lastContact';

/** Sorts targets by a column; ties keep their incoming order. Undated rows sort as oldest. */
export function sortTargets<T extends TargetRow>(rows: ReadonlyArray<T>, field: SortField, dir: 'asc' | 'desc'): T[] {
  const key = (r: T): string => {
    if (field === 'venue') return (r.venue?.name ?? '').toLowerCase();
    if (field === 'tour') return (r.tour?.name ?? '').toLowerCase();
    if (field === 'status') return String(PIPELINE_STAGES.findIndex(s => s.key === r.status) + 10);
    return lastTouch(r) ?? '';
  };
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, k: key(r) }))
    .sort((a, b) => (a.k < b.k ? -sign : a.k > b.k ? sign : a.i - b.i))
    .map(x => x.r);
}

/** A follow-up target that has gone a week without contact. */
export function isOverdueFollowUp(t: TargetRow, now: number = Date.now()): boolean {
  const d = daysSince(lastTouch(t), now);
  return t.status === 'follow_up' && d !== null && d >= 7;
}

export interface MailRow { sent_at: string | null; subject: string | null; venue: { name: string | null } | null }

/** Archive search: venue name or subject contains the text; sent date within [start, end] (YYYY-MM-DD, inclusive). */
export function filterArchive<T extends MailRow>(rows: ReadonlyArray<T>, q: { search: string; start: string; end: string }): T[] {
  const needle = q.search.trim().toLowerCase();
  return rows.filter(e => {
    if (needle) {
      const hay = `${e.venue?.name ?? ''} ${e.subject ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    const day = e.sent_at?.slice(0, 10) ?? '';
    if (q.start && day && day < q.start) return false;
    if (q.end && day && day > q.end) return false;
    return true;
  });
}

/** Strips HTML tags for a plain-text preview. Never rendered as HTML. */
export const plainText = (html: string | null | undefined): string =>
  (html ?? '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();

export interface EmailSummary {
  /** Targets on open tours (all stages). */
  targets: number;
  /** Targets in follow-up with no contact for a week or more. */
  overdue: number;
  /** Targets that have confirmed. */
  confirmed: number;
  /** Booking threads whose next step is due or late. */
  threadsDue: number;
}

export function summarizeEmail(
  targets: ReadonlyArray<TargetRow>,
  bookings: ReadonlyArray<ThreadBooking>,
  now: number = Date.now(),
): EmailSummary {
  return {
    targets: targets.length,
    overdue: targets.filter(t => isOverdueFollowUp(t, now)).length,
    confirmed: targets.filter(t => t.status === 'confirmed').length,
    threadsDue: bookings.filter(isActiveThread).filter(b => {
      const a = nextAction(b, now);
      return a.next !== null && (a.tone === 'due' || a.tone === 'late' || a.tone === 'new');
    }).length,
  };
}
