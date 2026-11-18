// lib/agentConversationDays.ts
// Rules for the band assistant's day-by-day chat history (agent_conversations).
// Shared by the API route and its tests; nothing here touches the database.

/** One chat line as stored in agent_conversations.messages. */
export type StoredMessage = { role: 'user' | 'assistant'; content: string };

/** One past day as shown in the History list. */
export type ConversationDaySummary = {
  day: string;
  preview: string;
  messageCount: number;
  updatedAt: string | null;
};

/** Saved history per day stays bounded, same discipline as before the split. */
export const MAX_STORED_MESSAGES = 40;

/** How many past days the History list returns. */
export const HISTORY_DAYS_LIMIT = 60;

const PREVIEW_MAX = 90;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/**
 * True when `value` is a real calendar date written as YYYY-MM-DD.
 * Rejects impossible dates such as 2026-02-30 by round-tripping through UTC.
 */
export function isValidDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * Whether a chat for `day` may still be written.
 *
 * The browser sends its own local day. Every real time zone (UTC-12 to UTC+14)
 * is within one calendar day of the server's UTC date, so anything further away
 * is either a past day (read-only history) or a bad clock. This is what keeps
 * archived days from being rewritten.
 *
 * @param day   a value that already passed isValidDay
 * @param now   injectable clock for tests
 */
export function isWritableDay(day: string, now: Date = new Date()): boolean {
  const [y, m, d] = day.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = (target - utcToday) / MS_PER_DAY;
  return diffDays >= -1 && diffDays <= 1;
}

/**
 * Keeps only well-formed chat lines and the most recent MAX_STORED_MESSAGES.
 *
 * @returns the cleaned list, or null when `input` is not an array at all
 */
export function sanitizeMessages(input: unknown): StoredMessage[] | null {
  if (!Array.isArray(input)) return null;
  const clean: StoredMessage[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const { role, content } = item as { role?: unknown; content?: unknown };
    if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
      clean.push({ role, content });
    }
  }
  return clean.slice(-MAX_STORED_MESSAGES);
}

/**
 * A one-line label for a past day: the first thing the user asked, on one
 * line and cut to PREVIEW_MAX characters. Empty when the user never typed.
 */
export function previewOf(messages: unknown): string {
  const list = sanitizeMessages(messages) ?? [];
  const first = list.find(m => m.role === 'user' && m.content.trim().length > 0);
  if (!first) return '';
  const oneLine = first.content.replace(/\s+/g, ' ').trim();
  return oneLine.length > PREVIEW_MAX ? `${oneLine.slice(0, PREVIEW_MAX - 1).trimEnd()}…` : oneLine;
}

/** Counts only the lines the user would see as a conversation. */
export function countMessages(messages: unknown): number {
  return (sanitizeMessages(messages) ?? []).length;
}

// ── Pending approval card ─────────────────────────────────────────────────────

/**
 * The approval card waiting on screen, saved with the day's chat so it
 * survives popping the agent out, docking it back, or a reload.
 *
 * Nothing here is trusted on approval: the execute and bulk-send routes
 * re-check every id against the caller's band. This only has to be a sane,
 * bounded shape the panel can draw.
 */
export type PendingCard = {
  /** The card itself, as the agent produced it (stage_items, tour_outreach or city_search). */
  action: { type: PendingCardType } & Record<string, unknown>;
  /** Outreach email subject as the user has edited it. */
  draftSubject: string;
  /** Outreach email body as the user has edited it. */
  draftBody: string;
  /** Venue rows still ticked on an outreach card. */
  selectedIds: string[];
};

export type PendingCardType = 'stage_items' | 'tour_outreach' | 'city_search';

/** Serialized size cap. Matches the DB check (128 KB) with room to spare, and
 *  keeps a dock/pop-out flush under the browser's 64 KB keepalive limit in practice. */
export const PENDING_CARD_MAX_CHARS = 60_000;
const MAX_SELECTED_IDS = 500;
const MAX_DRAFT_CHARS = 20_000;

/** Whether `action` has the minimum shape for its card type. */
function isCardAction(action: unknown): action is PendingCard['action'] {
  if (!action || typeof action !== 'object' || Array.isArray(action)) return false;
  const a = action as Record<string, unknown>;
  if (a.type === 'stage_items') return Array.isArray(a.staged);
  if (a.type === 'tour_outreach') {
    return Array.isArray(a.venues) && typeof a.tourId === 'string'
      && !!a.draft && typeof a.draft === 'object' && !Array.isArray(a.draft);
  }
  if (a.type === 'city_search') return Array.isArray(a.venues);
  return false;
}

/**
 * Validates a pending card from the browser or the database.
 *
 * @returns `{ ok: true, card }` with `card` null for "no card", or `{ ok: false }`
 *          when the input is the wrong shape or too large.
 */
export function sanitizePendingCard(input: unknown): { ok: true; card: PendingCard | null } | { ok: false } {
  if (input === null || input === undefined) return { ok: true, card: null };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false };
  const raw = input as Record<string, unknown>;
  if (!isCardAction(raw.action)) return { ok: false };

  const draftSubject = typeof raw.draftSubject === 'string' ? raw.draftSubject : '';
  const draftBody = typeof raw.draftBody === 'string' ? raw.draftBody : '';
  if (draftSubject.length > MAX_DRAFT_CHARS || draftBody.length > MAX_DRAFT_CHARS) return { ok: false };

  const ids = Array.isArray(raw.selectedIds) ? raw.selectedIds : [];
  if (ids.length > MAX_SELECTED_IDS || !ids.every(id => typeof id === 'string' && id.length <= 64)) return { ok: false };

  const card: PendingCard = { action: raw.action, draftSubject, draftBody, selectedIds: ids as string[] };
  let size: number;
  try {
    size = JSON.stringify(card).length;
  } catch {
    return { ok: false }; // circular or otherwise unserializable
  }
  if (size > PENDING_CARD_MAX_CHARS) return { ok: false };
  return { ok: true, card };
}
