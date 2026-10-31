// __tests__/lib/agentStream.test.ts
import { isAgentStreamEvent, parseSseBuffer } from '../../lib/agent/agentStream';

describe('isAgentStreamEvent', () => {
  it('accepts each well-formed event', () => {
    expect(isAgentStreamEvent({ type: 'text', delta: 'Hi' })).toBe(true);
    expect(isAgentStreamEvent({ type: 'reset' })).toBe(true);
    expect(isAgentStreamEvent({ type: 'status', text: 'Checking…' })).toBe(true);
    expect(isAgentStreamEvent({ type: 'done', reply: 'All set' })).toBe(true);
    expect(isAgentStreamEvent({ type: 'error', message: 'Busy' })).toBe(true);
  });

  it('accepts a done event carrying an approval card, and rejects a malformed card', () => {
    expect(isAgentStreamEvent({ type: 'done', reply: 'Here is the card', action: { type: 'stage_items', staged: [] } })).toBe(true);
    expect(isAgentStreamEvent({ type: 'done', reply: 'x', action: 'stage_items' })).toBe(false);
    expect(isAgentStreamEvent({ type: 'done', reply: 'x', action: [] })).toBe(false);
  });

  it('rejects unknown types and missing fields', () => {
    expect(isAgentStreamEvent({ type: 'text' })).toBe(false);
    expect(isAgentStreamEvent({ type: 'done', reply: 5 })).toBe(false);
    expect(isAgentStreamEvent({ type: 'shell', cmd: 'rm' })).toBe(false);
    expect(isAgentStreamEvent(null)).toBe(false);
    expect(isAgentStreamEvent('text')).toBe(false);
  });
});

describe('parseSseBuffer', () => {
  it('parses complete events and keeps the partial remainder', () => {
    const buf = 'data: {"type":"text","delta":"Hel"}\n\ndata: {"type":"text","delta":"lo"}\n\ndata: {"type":"do';
    const { events, rest } = parseSseBuffer(buf);
    expect(events).toEqual([{ type: 'text', delta: 'Hel' }, { type: 'text', delta: 'lo' }]);
    expect(rest).toBe('data: {"type":"do');
  });

  it('completes an event split across chunks', () => {
    const first = parseSseBuffer('data: {"type":"done",');
    expect(first.events).toEqual([]);
    const second = parseSseBuffer(`${first.rest}"reply":"Booked"}\n\n`);
    expect(second.events).toEqual([{ type: 'done', reply: 'Booked' }]);
    expect(second.rest).toBe('');
  });

  it('skips keep-alive comments and malformed JSON', () => {
    const { events } = parseSseBuffer(': keep-alive\n\ndata: {not json}\n\ndata: {"type":"reset"}\n\n');
    expect(events).toEqual([{ type: 'reset' }]);
  });

  it('handles CRLF line endings', () => {
    const { events } = parseSseBuffer('data: {"type":"status","text":"Looking up Wire Road…"}\r\n\r\n');
    expect(events).toEqual([{ type: 'status', text: 'Looking up Wire Road…' }]);
  });

  it('ignores well-formed JSON that is not an agent event', () => {
    expect(parseSseBuffer('data: {"type":"exec","cmd":"x"}\n\n').events).toEqual([]);
  });
});
