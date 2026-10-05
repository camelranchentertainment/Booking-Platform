import {
  buildVoiceSystemPrompt,
  relationshipFor,
  voiceGuide,
} from '../../lib/emailVoice';
import { hasPlayedVenue } from '../../lib/server/venueHistory';

describe('relationshipFor', () => {
  it('uses the new-venue voice for cold pitches and follow-ups to venues with no history', () => {
    expect(relationshipFor('target', false)).toBe('new');
    expect(relationshipFor('follow_up_1', false)).toBe('new');
    expect(relationshipFor('follow_up_2', false)).toBe('new');
  });

  it('uses the familiar voice once the act has played the venue, whatever the category', () => {
    expect(relationshipFor('target', true)).toBe('familiar');
    expect(relationshipFor('follow_up_1', true)).toBe('familiar');
  });

  it('uses the familiar voice for categories that only happen mid-conversation', () => {
    for (const c of ['reply', 'reply_suggestion', 'confirmation', 'decline', 'advance', 'thank_you']) {
      expect(relationshipFor(c, false)).toBe('familiar');
    }
  });
});

describe('voiceGuide', () => {
  it('differs between new and familiar venues but shares the core voice', () => {
    const fresh = voiceGuide('new');
    const known = voiceGuide('familiar');
    expect(fresh).not.toBe(known);
    expect(fresh).toContain('working musician');
    expect(known).toContain('working musician');
    expect(fresh).toContain('NEW TO THE ACT');
    expect(known).toContain('ALREADY KNOWN');
  });

  it('bans corporate filler and em dashes', () => {
    const g = voiceGuide('new');
    expect(g).toContain('I hope this email finds you well');
    expect(g).toContain('No em dashes');
    expect(g).toContain('Best regards');
  });

  it('never uses an em dash in its own example wording', () => {
    expect(voiceGuide('new')).not.toMatch(/—/);
    expect(voiceGuide('familiar')).not.toMatch(/—/);
  });

  it('stays act-agnostic: no real acts, venues or people are named', () => {
    const all = voiceGuide('new') + voiceGuide('familiar');
    for (const name of ['Stringer', 'Better Than Nothin', 'Luckenbach', 'Kaw Valley', 'Jamie Glover', 'Scott']) {
      expect(all).not.toContain(name);
    }
  });
});

describe('buildVoiceSystemPrompt', () => {
  it('puts the task first, the voice guide in the middle and the output contract last', () => {
    const out = buildVoiceSystemPrompt({
      task: 'TASK_LINE',
      relationship: 'new',
      outputSpec: 'OUTPUT_SPEC {"subject":"..."}',
    });
    expect(out.startsWith('TASK_LINE')).toBe(true);
    expect(out.endsWith('OUTPUT_SPEC {"subject":"..."}')).toBe(true);
    expect(out.indexOf('working musician')).toBeGreaterThan(out.indexOf('TASK_LINE'));
    expect(out.indexOf('working musician')).toBeLessThan(out.indexOf('OUTPUT_SPEC'));
  });
});

describe('hasPlayedVenue', () => {
  function clientReturning(result: { data: unknown; error: { message: string } | null } | Error) {
    const calls: Array<[string, ...unknown[]]> = [];
    const chain: any = {};
    for (const m of ['select', 'eq', 'neq', 'limit']) {
      chain[m] = jest.fn((...args: unknown[]) => { calls.push([m, ...args]); return chain; });
    }
    chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      result instanceof Error ? reject(result) : resolve(result);
    return { client: { from: jest.fn(() => chain) } as any, calls };
  }

  it('is false without an act or venue and never queries', async () => {
    const { client } = clientReturning({ data: [], error: null });
    expect(await hasPlayedVenue(client, null, 'v1')).toBe(false);
    expect(await hasPlayedVenue(client, 'a1', undefined)).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('is true when a completed booking exists, and excludes the current booking', async () => {
    const { client, calls } = clientReturning({ data: [{ id: 'b0' }], error: null });
    expect(await hasPlayedVenue(client, 'a1', 'v1', 'b-current')).toBe(true);
    expect(calls).toContainEqual(['eq', 'status', 'completed']);
    expect(calls).toContainEqual(['neq', 'id', 'b-current']);
  });

  it('is false when nothing has been played', async () => {
    const { client } = clientReturning({ data: [], error: null });
    expect(await hasPlayedVenue(client, 'a1', 'v1')).toBe(false);
  });

  it('fails soft to false on a query error or a thrown error', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await hasPlayedVenue(clientReturning({ data: null, error: { message: 'boom' } }).client, 'a1', 'v1')).toBe(false);
    expect(await hasPlayedVenue(clientReturning(new Error('net down')).client, 'a1', 'v1')).toBe(false);
    spy.mockRestore();
  });
});
