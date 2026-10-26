// __tests__/lib/importExtract.test.ts
// Chunked AI extraction for the import wizard. The model is faked: each call
// returns the venue names found in its chunk, so the tests can check that the
// whole file is read, nothing is dropped silently, and a cut-off answer is
// retried in smaller pieces.

import {
  chunkText, parseModelJson, extractWithModel, MAX_CHUNKS, CHUNK_CHARS, type CallModel,
} from '../../lib/server/importExtract';

/** "Venue 1, Austin" … one row per line. */
const rows = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => `Venue ${from + i}, Austin, TX, booking${from + i}@example.com`).join('\n');

/** Fake model: echoes every "Venue N" line in the prompt's document as a venue. */
const echoModel = (opts: { truncateWhenOver?: number } = {}): jest.MockedFunction<CallModel> =>
  jest.fn<ReturnType<CallModel>, Parameters<CallModel>>(async (prompt: string) => {
    const doc = prompt.split('Document content:\n')[1]?.split('\n\nReturn ONLY')[0] ?? '';
    const names = [...doc.matchAll(/^(Venue \d+), (\w+)/gm)].map(m => ({ name: m[1], city: m[2], state: 'TX' }));
    if (opts.truncateWhenOver && names.length > opts.truncateWhenOver) {
      return { text: '{"venues":[{"name":"Venue 1"', truncated: true };
    }
    return { text: '```json\n' + JSON.stringify({ venues: names, warnings: [] }) + '\n```', truncated: false };
  });

describe('chunkText', () => {
  it('keeps short text in one chunk', () => {
    expect(chunkText('a\nb\nc', 100)).toEqual(['a\nb\nc']);
  });
  it('breaks between lines so a row is never split', () => {
    const chunks = chunkText(rows(50), 500);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(500);
      for (const line of c.split('\n')) expect(line).toMatch(/^Venue \d+, Austin, TX, booking\d+@example\.com$/);
    }
    expect(chunks.join('\n')).toBe(rows(50));
  });
  it('cuts a single line longer than the chunk size', () => {
    expect(chunkText('x'.repeat(25), 10)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
  });
});

describe('parseModelJson', () => {
  it('reads JSON inside code fences or with stray text', () => {
    expect(parseModelJson('Here you go:\n```json\n{"venues":[]}\n```')).toEqual({ venues: [] });
  });
  it('returns null for a cut-off answer', () => {
    expect(parseModelJson('{"venues":[{"name":"A"')).toBeNull();
  });
});

describe('extractWithModel', () => {
  it('reads every row of a list far longer than the old 12,000-character limit', async () => {
    const text = rows(400); // ~20,000 characters
    expect(text.length).toBeGreaterThan(12_000);
    const model = echoModel();
    const { records, warnings } = await extractWithModel('venues', text, model);
    expect(records).toHaveLength(400);
    expect(model.mock.calls.length).toBeGreaterThan(1);
    expect(warnings).toEqual([]);
  });

  it('splits and retries a chunk whose answer was cut off, so nothing is lost', async () => {
    const model = echoModel({ truncateWhenOver: 60 });
    const { records } = await extractWithModel('venues', rows(150), model);
    expect(records).toHaveLength(150);
  });

  it('removes a venue that appears in two chunks', async () => {
    const text = `${rows(200)}\n${rows(1)}`; // Venue 1 again at the end
    const { records } = await extractWithModel('venues', text, echoModel());
    expect(records.filter(r => r.name === 'Venue 1')).toHaveLength(1);
  });

  it('says plainly when a very long file was only partly read', async () => {
    const text = rows(Math.ceil(((MAX_CHUNKS + 2) * CHUNK_CHARS) / 40));
    const model = echoModel();
    const { warnings } = await extractWithModel('venues', text, model);
    expect(model).toHaveBeenCalledTimes(MAX_CHUNKS);
    expect(warnings[0]).toMatch(/only the first \d+% of it was read/);
  });

  it('warns about a section it could not read but keeps the rest', async () => {
    const good = echoModel();
    // Any piece containing Venue 1 always fails, even after being split smaller.
    const model: CallModel = async (prompt, max) =>
      /^Venue 1, /m.test(prompt) ? { text: 'sorry', truncated: false } : good(prompt, max);
    const { records, warnings } = await extractWithModel('venues', rows(400), model);
    expect(records.length).toBeGreaterThan(300);
    expect(records.length).toBeLessThan(400);
    expect(records.some(r => r.name === 'Venue 1')).toBe(false);
    expect(warnings).toEqual([expect.stringMatching(/Part of this file couldn't be read \(1 of \d+ sections\)/)]);
  });

  it('stops starting new sections when time runs out and says how much was read', async () => {
    let clock = 0;
    const slow = echoModel();
    // Each call "takes" 20 seconds on a fake clock; the budget is 45.
    const model: CallModel = async (p, m) => { clock += 20_000; return slow(p, m); };
    const { records, warnings } = await extractWithModel('venues', rows(800), model, { now: () => clock });
    expect(records.length).toBeGreaterThan(0);
    expect(records.length).toBeLessThan(800);
    expect(warnings).toEqual(expect.arrayContaining([expect.stringMatching(/took too long .* only the first \d+% was read/)]));
  });

  it('throws a plain message when nothing in the file could be read', async () => {
    const model: CallModel = async () => ({ text: 'I cannot help with that.', truncated: false });
    await expect(extractWithModel('venues', 'hello', model)).rejects.toThrow(/Could not pick out any venues/);
  });
});
