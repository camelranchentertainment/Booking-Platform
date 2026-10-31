// __tests__/lib/agentSuggestions.test.ts
import type Anthropic from '@anthropic-ai/sdk';
import {
  MAX_SUGGESTIONS,
  MAX_SUGGESTION_CHARS,
  SUGGESTIONS_MODEL,
  generateSuggestions,
  parseSuggestions,
} from '../../lib/server/agent/suggestions';

const reply = (text: string) => ({ content: [{ type: 'text', text }] }) as unknown as Anthropic.Message;

describe('parseSuggestions', () => {
  it('reads a JSON array, even with text around it', () => {
    expect(parseSuggestions('Sure:\n["Draft the follow-up to Cain\'s", "Add Tulsa to the fall run"]')).toEqual([
      'Draft the follow-up to Cain\'s', 'Add Tulsa to the fall run',
    ]);
  });

  it('caps the count, drops duplicates, blanks, non-strings and over-long labels', () => {
    const long = 'x'.repeat(MAX_SUGGESTION_CHARS + 1);
    const out = parseSuggestions(JSON.stringify(['One', 'one', '', 7, long, 'Two', 'Three', 'Four', 'Five']));
    expect(out).toEqual(['One', 'Two', 'Three', 'Four']);
    expect(out.length).toBe(MAX_SUGGESTIONS);
  });

  it('flattens line breaks and strips wrapping quotes', () => {
    expect(parseSuggestions('["\\"What pays\\nbest?\\""]')).toEqual(['What pays best?']);
  });

  it('returns nothing for unusable output', () => {
    expect(parseSuggestions('no list here')).toEqual([]);
    expect(parseSuggestions('[not json')).toEqual([]);
    expect(parseSuggestions('{"a": 1}')).toEqual([]);
  });
});

describe('generateSuggestions', () => {
  const input = { userMessage: 'lets remove brickyard from the outreach', reply: 'Here\'s the card.', cardWaiting: true };

  it('asks the small model with the turn and returns clean labels', async () => {
    const create = jest.fn().mockResolvedValue(reply('["Show HIGH PLAINS targets", "Draft the follow-ups"]'));
    await expect(generateSuggestions(create, input)).resolves.toEqual(['Show HIGH PLAINS targets', 'Draft the follow-ups']);
    const [params, options] = create.mock.calls[0];
    expect(params.model).toBe(SUGGESTIONS_MODEL);
    expect(params.messages[0].content).toMatch(/Approval card waiting: yes/);
    expect(options.signal).toBeDefined();
  });

  it('never throws: a failed call means no suggestions', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const create = jest.fn().mockRejectedValue(new Error('overloaded'));
    await expect(generateSuggestions(create, input)).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('passes the request\'s abort through, and stays quiet when the user cancelled', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const controller = new AbortController();
    const create = jest.fn((_p: unknown, options?: { signal?: AbortSignal }) => new Promise<Anthropic.Message>((_, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const pending = generateSuggestions(create, input, controller.signal);
    controller.abort();
    await expect(pending).resolves.toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
