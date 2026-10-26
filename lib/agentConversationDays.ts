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
