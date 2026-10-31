// lib/agent/agentStream.ts
//
// Browser side of /api/agent-stream: reads the server-sent event stream and
// hands each event to the caller. The parser is a pure function so it's
// unit-tested without a network (see __tests__/lib/agentStream.test.ts).

/** Mirrors AgentStreamEvent in lib/server/agent/types.ts (kept separate so no server code reaches the browser bundle). */
export type AgentStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'reset' }
  | { type: 'status'; text: string }
  | { type: 'done'; reply: string }
  | { type: 'error'; message: string };

const EVENT_TYPES = new Set(['text', 'reset', 'status', 'done', 'error']);

/** Narrows parsed JSON to a well-formed event; anything else is ignored. */
export function isAgentStreamEvent(value: unknown): value is AgentStreamEvent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.type !== 'string' || !EVENT_TYPES.has(v.type)) return false;
  switch (v.type) {
    case 'text': return typeof v.delta === 'string';
    case 'status': return typeof v.text === 'string';
    case 'done': return typeof v.reply === 'string';
    case 'error': return typeof v.message === 'string';
    default: return true;
  }
}

/**
 * Splits buffered stream text into complete events. Whatever follows the last
 * blank line is an incomplete event and is returned as `rest` to prepend to
 * the next chunk. Comment lines (": keep-alive") and malformed events are skipped.
 *
 * @param buffer - Text received so far that hasn't been parsed yet.
 * @returns Complete events in order, and the unparsed remainder.
 */
export function parseSseBuffer(buffer: string): { events: AgentStreamEvent[]; rest: string } {
  const normalised = buffer.replace(/\r\n?/g, '\n');
  const blocks = normalised.split('\n\n');
  const rest = blocks.pop() ?? '';
  const events: AgentStreamEvent[] = [];
  for (const block of blocks) {
    const data = block.split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) continue;
    try {
      const parsed: unknown = JSON.parse(data);
      if (isAgentStreamEvent(parsed)) events.push(parsed);
    } catch {
      // A malformed event is dropped rather than breaking the whole reply.
    }
  }
  return { events, rest };
}

export class AgentStreamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'AgentStreamError';
  }
}

/**
 * Posts one message to /api/agent-stream and calls `onEvent` for every event
 * until the turn ends.
 *
 * @param body - The message, history and options, as the route expects.
 * @param accessToken - The user's Supabase access token.
 * @param onEvent - Called for each event, in order.
 * @param signal - Aborts the request (the Stop button).
 * @returns The final reply.
 * @throws AgentStreamError when the request is refused, the stream reports an
 *         error, or the connection ends before the reply is complete.
 */
export async function streamAgentTurn(
  body: { message: string; history: Array<{ role: 'user' | 'assistant'; content: string }>; saveNote?: boolean },
  accessToken: string | undefined,
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch('/api/agent-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${accessToken ?? ''}` },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => null) as { error?: string | { message?: string } } | null;
    const message = typeof json?.error === 'string' ? json.error : json?.error?.message;
    throw new AgentStreamError(message || `The agent couldn't answer (error ${res.status}).`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reply: string | null = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    if (done) buffer += decoder.decode() + '\n\n'; // flush a final event that lacks its trailing blank line
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.rest;
    for (const event of parsed.events) {
      onEvent(event);
      if (event.type === 'error') throw new AgentStreamError(event.message);
      if (event.type === 'done') reply = event.reply;
    }
    if (done) break;
  }

  if (reply === null) throw new AgentStreamError('The connection dropped before the answer finished. Try again.');
  return reply;
}
