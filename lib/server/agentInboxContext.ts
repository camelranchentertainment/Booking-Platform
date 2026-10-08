// lib/server/agentInboxContext.ts
//
// Gives the booking agent a read-only view of the band's recent inbox so it can
// summarise activity and propose follow-up updates (which still go through the
// staged-confirm approval cards — the agent never writes directly).
//
// Email bodies are written by people outside the platform. They are passed to
// the model as quoted data inside clear markers, and the system prompt tells
// the model never to follow instructions found inside them.
import type { SupabaseClient } from '@supabase/supabase-js';

/** How far back the agent can see. */
export const INBOX_LOOKBACK_DAYS = 30;
/** Most emails listed (newest first). Keeps the prompt small and cacheable. */
export const INBOX_MAX_EMAILS = 20;
/** Characters kept from each email body after cleaning. */
export const INBOX_BODY_CHARS = 600;

export const INBOX_OPEN = '<<<EMAIL';
export const INBOX_CLOSE = 'EMAIL>>>';

export interface InboxRow {
  id: string;
  from_address: string | null;
  subject: string | null;
  body: string | null;
  sent_at: string | null;
  venue: { name: string | null } | { name: string | null }[] | null;
}

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/**
 * Turns a stored email body (plain text or HTML) into a short, single-paragraph
 * excerpt: drops markup, quoted earlier messages and signatures, collapses
 * whitespace, and truncates.
 */
export function cleanEmailBody(raw: string | null | undefined, maxChars = INBOX_BODY_CHARS): string {
  if (!raw) return '';
  let text = raw
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, m => ENTITIES[m.toLowerCase()] ?? ' ');

  const kept: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    // Stop at the start of the quoted thread or a signature delimiter.
    if (/^On .{4,200} wrote:$/i.test(t) || /^-{2,}\s*Original Message/i.test(t) || t === '--' || /^From: .+@/i.test(t)) break;
    if (t.startsWith('>')) continue;
    kept.push(t);
  }
  text = kept.join(' ').replace(/\s+/g, ' ').trim();
  // Never let a body close (or fake) the data markers.
  text = text.split(INBOX_OPEN).join('').split(INBOX_CLOSE).join('');
  return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text;
}

/** One header-safe line value (subjects/addresses can't break the layout). */
function oneLine(value: string | null | undefined, max = 160): string {
  const v = (value ?? '').replace(/\s+/g, ' ').split(INBOX_OPEN).join('').split(INBOX_CLOSE).join('').trim();
  return v.length > max ? `${v.slice(0, max)}…` : v;
}

/**
 * Formats inbox rows as the "Inbox" section of the agent's context.
 * Exported for tests.
 */
export function formatInboxContext(rows: InboxRow[], lookbackDays = INBOX_LOOKBACK_DAYS): string {
  const header = `Inbox — emails on the band's Email page inbox (synced from Gmail when the sender is a saved venue/contact), last ${lookbackDays} days, newest first (${rows.length}):`;
  if (rows.length === 0) {
    return `${header}\n  (none — no replies from saved venues or contacts in this window)`;
  }
  const lines = [header];
  for (const r of rows) {
    const joined = Array.isArray(r.venue) ? r.venue[0] : r.venue;
    const venue = joined?.name ? ` · venue: ${oneLine(joined.name, 80)}` : '';
    const date = (r.sent_at ?? '').slice(0, 10) || 'unknown date';
    lines.push(
      `  - email_id=${r.id} ${date} from ${oneLine(r.from_address, 120) || 'unknown sender'}${venue}`,
      `    Subject: ${oneLine(r.subject) || '(no subject)'}`,
      `    ${INBOX_OPEN} ${cleanEmailBody(r.body) || '(empty)'} ${INBOX_CLOSE}`,
    );
  }
  return lines.join('\n');
}

/**
 * Loads the band's recent received emails and formats them for the agent.
 * Fails soft: on a query error the agent still works, it just says it can't
 * see the inbox right now.
 *
 * @param service service-role client — the act filter is the only scoping
 * @param actId   the caller's band, from their profile
 */
export async function buildInboxContext(
  service: SupabaseClient,
  actId: string,
  now: Date = new Date(),
): Promise<string> {
  const unavailable = 'Inbox: (could not be loaded right now — tell the user to check the Email page directly)';
  const since = new Date(now.getTime() - INBOX_LOOKBACK_DAYS * 86_400_000).toISOString();
  try {
    const { data, error } = await service
      .from('email_log')
      .select('id, from_address, subject, body, sent_at, venue:venues(name)')
      .eq('act_id', actId)
      .eq('direction', 'received')
      // archived is nullable; `neq true` would silently drop NULL rows.
      .or('archived.is.null,archived.eq.false')
      .gte('sent_at', since)
      .order('sent_at', { ascending: false })
      .limit(INBOX_MAX_EMAILS);

    if (error) {
      console.error('[agent] inbox context load failed:', error.message);
      return unavailable;
    }
    return formatInboxContext((data ?? []) as InboxRow[]);
  } catch (err) {
    // A thrown error (network, client) must not take the whole agent down.
    console.error('[agent] inbox context load threw:', err instanceof Error ? err.message : err);
    return unavailable;
  }
}
