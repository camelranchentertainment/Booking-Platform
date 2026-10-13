// lib/server/agentLookup.ts
// Read-only lookups the Booking Agent makes *inside* a turn.
//
// Why: the agent answers with one JSON action per model response. A lookup
// (find_venue) used to end the user's turn with a canned "Found it" reply, so
// "add The Pond's email" became lookup → wait for the user → hopefully the
// update. The model's own reply was replaced by the canned text, so the next
// turn ("great") carried no instruction and the model looked the venue up again.
// Now /api/agent runs the lookup, hands the result back to the model in the
// same request, and lets it go on to the action the user actually asked for.

/** Most lookups the model may chain in one user turn before we stop and show what we have. */
export const MAX_LOOKUPS_PER_TURN = 4;

/** Marks lookup results fed back to the model so it cannot mistake them for the user. */
export const LOOKUP_RESULT_PREFIX = '[find_venue result — from the database, not from the user]';

export interface AgentResponse {
  reply?: string;
  action?: { type?: string; [key: string]: unknown };
}

/**
 * Parses a model response that should be either plain text or one JSON object
 * (optionally wrapped in a ```json fence, or with stray text around it).
 *
 * @returns the parsed object, or null for plain text / malformed JSON
 */
export function parseAgentResponse(raw: string): AgentResponse | null {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[0]);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as AgentResponse) : null;
  } catch {
    return null;
  }
}

/** The fields execFindVenue selects; everything optional because rows come from PostgREST untyped. */
export interface FoundVenue {
  id: string;
  name?: string | null;
  city?: string | null;
  state?: string | null;
  email?: string | null;
  phone?: string | null;
  booking_contact?: string | null;
  bookings?: Array<{ show_date?: string | null }> | null;
  contacts?: Array<{ id: string; first_name?: string | null; last_name?: string | null; title?: string | null; email?: string | null }> | null;
}

/**
 * Human-readable lookup result. The same text is shown to the user when a
 * lookup is the last step, and handed back to the model mid-turn, so both see
 * the ids the model needs for venue_upsert / contact_upsert / stage_email.
 */
export function formatVenueLookup(query: { name?: string; city?: string }, venues: FoundVenue[]): string {
  if (venues.length === 0) {
    return `No venue found matching "${query.name || query.city || ''}". Check the spelling, or it may be listed under a different name.`;
  }
  const lines = venues
    .map(v => {
      const where = v.city ? ` (${v.city}${v.state ? `, ${v.state}` : ''})` : '';
      const dates = (v.bookings ?? []).map(b => b.show_date).filter(Boolean).join(', ');
      const contacts = (v.contacts ?? []).map(c => {
        const nm = [c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)';
        return `    · contact_id: ${c.id} ${nm}${c.title ? ` (${c.title})` : ''}${c.email ? ` <${c.email}>` : ''}`;
      });
      return [
        `- ${v.name ?? '(unnamed)'}${where} — id: ${v.id}, email: ${v.email || 'none on file'}${v.phone ? `, phone: ${v.phone}` : ''}${v.booking_contact ? `, booking contact: ${v.booking_contact}` : ''}${dates ? `, show date(s): ${dates}` : ''}`,
        ...contacts,
      ].join('\n');
    })
    .join('\n');
  return venues.length === 1 ? `Found it:\n${lines}` : `Found ${venues.length} matches — which one?\n${lines}`;
}

/** Identity of a lookup, to stop the model asking the same thing twice in a turn. */
export function lookupKey(action: { name?: unknown; city?: unknown }): string {
  const norm = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
  return `${norm(action.name)}|${norm(action.city)}`;
}

/**
 * The message handed back to the model after a lookup. It restates that the
 * job is the user's original request, so a lookup is a step, not the answer.
 */
export function lookupFeedback(resultText: string): string {
  return [
    LOOKUP_RESULT_PREFIX,
    resultText,
    '',
    "Now continue with the user's request using these results, in the same JSON format. " +
      'If they asked you to change something (e.g. add an email), respond with that action now (venue_upsert, contact_upsert, stage_email, …) using the id above. ' +
      'If more than one venue matched and you cannot tell which, ask the user in plain text. ' +
      'If nothing matched, try a different search or tell the user plainly. Do not look up the same venue again.',
  ].join('\n');
}
