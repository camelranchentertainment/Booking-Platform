// __tests__/lib/agentLookup.test.ts
import { formatMultiVenueLookup, formatVenueLookup, lookupFeedback, lookupKey, parseAgentResponse, LOOKUP_RESULT_PREFIX } from '../../lib/server/agentLookup';

describe('parseAgentResponse', () => {
  it('parses bare JSON', () => {
    expect(parseAgentResponse('{"reply":"x","action":{"type":"find_venue"}}')).toEqual({ reply: 'x', action: { type: 'find_venue' } });
  });
  it('strips a ```json fence and stray text', () => {
    expect(parseAgentResponse('```json\n{"reply":"x"}\n```')).toEqual({ reply: 'x' });
    expect(parseAgentResponse('Sure! {"reply":"x"}')).toEqual({ reply: 'x' });
  });
  it('is null for plain text and malformed (e.g. cut-off) JSON', () => {
    expect(parseAgentResponse('You have two tours.')).toBeNull();
    expect(parseAgentResponse('{"reply":"Adding')).toBeNull();
  });
  it('finds an object wherever it sits in the text, as the route always has', () => {
    expect(parseAgentResponse('[{"a":1}]')).toEqual({ a: 1 });
  });
});

describe('formatVenueLookup', () => {
  const pond = { id: 'v-1', name: 'The Pond', city: 'Franklin', state: 'TN', email: null, phone: '(615) 790-1491', bookings: [], contacts: [] };
  it('lists one venue with its id and missing email', () => {
    expect(formatVenueLookup({ name: 'The Pond' }, [pond])).toBe('Found it:\n- The Pond (Franklin, TN) — id: v-1, email: none on file, phone: (615) 790-1491');
  });
  it('lists contacts and show dates, and asks which when several match', () => {
    const out = formatVenueLookup({ name: 'Pond' }, [
      { ...pond, bookings: [{ show_date: '2026-11-01' }], contacts: [{ id: 'c-1', first_name: 'Ann', last_name: 'Lee', title: 'Booker', email: 'ann@x.com' }] },
      { ...pond, id: 'v-2', city: null },
    ]);
    expect(out).toMatch(/^Found 2 matches — which one\?/);
    expect(out).toContain('show date(s): 2026-11-01');
    expect(out).toContain('· contact_id: c-1 Ann Lee (Booker) <ann@x.com>');
    expect(out).toContain('- The Pond — id: v-2');
  });
  it('says plainly when nothing matched', () => {
    expect(formatVenueLookup({ name: 'Nope' }, [])).toMatch(/^No venue found matching "Nope"/);
  });
});

describe('lookupKey / lookupFeedback', () => {
  it('treats case and spacing differences as the same lookup', () => {
    expect(lookupKey({ name: ' The Pond ', city: 'FRANKLIN' })).toBe(lookupKey({ name: 'the pond', city: 'franklin' }));
    expect(lookupKey({ name: 'The Pond' })).not.toBe(lookupKey({ name: 'The Pond', city: 'Franklin' }));
  });
  it('labels the result as from the database and tells the model to finish the request', () => {
    const msg = lookupFeedback('Found it:\n- The Pond — id: v-1');
    expect(msg.startsWith(LOOKUP_RESULT_PREFIX)).toBe(true);
    expect(msg).toContain('id: v-1');
    expect(msg).toMatch(/venue_upsert/);
    expect(msg).toMatch(/Do not look up the same venue again/);
  });
});

describe('multi-venue lookup', () => {
  const v = (id: string, name: string) => ({ id, name, city: 'Fayetteville', state: 'AR', email: null, bookings: [], contacts: [] });
  it('gives one section per name and counts exact matches', () => {
    const out = formatMultiVenueLookup([
      { name: 'Aggie', venues: [v('a', 'Aggie Lounge')] },
      { name: 'Ghost', venues: [] },
    ]);
    expect(out).toMatch(/^Looked up 2 venues — 1 matched exactly once\./);
    expect(out).toContain('"Aggie":\nFound it:');
    expect(out).toContain('id: a');
    expect(out).toContain('"Ghost":\nNo venue found matching "Ghost"');
  });
  it('treats the same names in any order as the same lookup', () => {
    expect(lookupKey({ names: ['B', ' a '] })).toBe(lookupKey({ names: ['A', 'b'] }));
    expect(lookupKey({ names: ['A'] })).not.toBe(lookupKey({ names: ['A', 'B'] }));
  });
});
