import type Anthropic from '@anthropic-ai/sdk';
import {
  appendSources,
  extractFinalAnswer,
  isWebSearchUnavailableError,
} from '../../lib/server/agentWebSearch';

// Minimal block builders — only the fields extractFinalAnswer reads.
const text = (t: string, urls: Array<[string, string]> = []): Anthropic.ContentBlock => ({
  type: 'text',
  text: t,
  citations: urls.length
    ? urls.map(([url, title]) => ({ type: 'web_search_result_location', url, title, cited_text: '', encrypted_index: '' }))
    : null,
} as unknown as Anthropic.ContentBlock);
const search = (): Anthropic.ContentBlock => ({ type: 'server_tool_use', id: 's1', name: 'web_search', input: {} } as unknown as Anthropic.ContentBlock);
const result = (): Anthropic.ContentBlock => ({ type: 'web_search_tool_result', tool_use_id: 's1', content: [] } as unknown as Anthropic.ContentBlock);

describe('extractFinalAnswer', () => {
  it('returns plain text unchanged when no search ran', () => {
    expect(extractFinalAnswer([text('Your next show is Nov 6.')])).toEqual({ text: 'Your next show is Nov 6.', sources: [] });
  });

  it('drops narration before the last search and joins the cited answer', () => {
    const out = extractFinalAnswer([
      text('Let me look that up.'),
      search(),
      result(),
      text("Kobi's books bands through ", [['https://kobis.bar/contact', "Kobi's — Contact"]]),
      text('their website contact form.', [['https://kobis.bar/contact', "Kobi's — Contact"]]),
    ]);
    expect(out.text).toBe("Kobi's books bands through their website contact form.");
    expect(out.sources).toEqual([{ title: "Kobi's — Contact", url: 'https://kobis.bar/contact' }]);
  });

  it('keeps a JSON action intact when it follows a search', () => {
    const json = '{"reply":"Found it","action":{"type":"venue_upsert","venue_id":"v1","email":"book@x.com"}}';
    expect(extractFinalAnswer([search(), result(), text(json)]).text).toBe(json);
  });
});

describe('appendSources', () => {
  it('adds a sources list to plain replies', () => {
    expect(appendSources('Found it.', [{ title: 'Site', url: 'https://x.com' }])).toBe('Found it.\n\nSources:\n• Site — https://x.com');
  });

  it('leaves the reply alone when nothing was cited', () => {
    expect(appendSources('Hi', [])).toBe('Hi');
  });
});

describe('isWebSearchUnavailableError', () => {
  it('recognises a rejected web search tool', () => {
    expect(isWebSearchUnavailableError({ status: 400, message: 'web_search is not enabled for this organization' })).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isWebSearchUnavailableError({ status: 400, message: 'max_tokens too large' })).toBe(false);
    expect(isWebSearchUnavailableError({ status: 500, message: 'web_search failed' })).toBe(false);
    expect(isWebSearchUnavailableError(null)).toBe(false);
  });
});
