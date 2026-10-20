import type Anthropic from '@anthropic-ai/sdk';

/**
 * Web search for the /band agent, run by Anthropic on its side (a "server
 * tool"): the model decides when to search, Anthropic fetches the results and
 * the model writes its answer from them in the same API call. Nothing is
 * fetched from our servers, so no outbound HTTP or scraping code lives here.
 *
 * max_uses caps searches per model call to keep cost and latency bounded.
 */
export const AGENT_WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5,
};

/** How many times a paused (long-running) search turn is resumed before giving up. */
export const MAX_PAUSE_CONTINUATIONS = 3;

export interface WebSource {
  title: string;
  url: string;
}

/**
 * Pulls the model's final answer out of a response that may contain web
 * searches.
 *
 * With web search on, a response is a run of blocks: optional text, a
 * server_tool_use, its web_search_tool_result, more text, and so on. Text
 * written before the last search is the model thinking out loud ("let me look
 * that up"); only the text after the last search result is the answer. A
 * cited answer is also split across several text blocks, so they are joined.
 *
 * @param content - The `content` array of a Messages API response.
 * @returns The answer text and the unique web pages it cited.
 */
export function extractFinalAnswer(content: ReadonlyArray<Anthropic.ContentBlock>): { text: string; sources: WebSource[] } {
  let lastResultIndex = -1;
  content.forEach((block, i) => {
    if (block.type === 'web_search_tool_result') lastResultIndex = i;
  });

  const answerBlocks = content
    .slice(lastResultIndex + 1)
    .filter((b): b is Anthropic.TextBlock => b.type === 'text');

  const seen = new Set<string>();
  const sources: WebSource[] = [];
  for (const block of answerBlocks) {
    for (const c of block.citations ?? []) {
      if (c.type !== 'web_search_result_location' || seen.has(c.url)) continue;
      seen.add(c.url);
      sources.push({ title: c.title ?? c.url, url: c.url });
    }
  }

  return { text: answerBlocks.map(b => b.text).join(''), sources };
}

/**
 * Appends a short plain-text source list to a conversational reply so the user
 * can check where web facts came from. JSON action replies are left alone —
 * the approval card is the place to review those.
 */
export function appendSources(reply: string, sources: ReadonlyArray<WebSource>): string {
  if (sources.length === 0) return reply;
  const list = sources.slice(0, 5).map(s => `• ${s.title} — ${s.url}`).join('\n');
  return `${reply.trimEnd()}\n\nSources:\n${list}`;
}

/**
 * True when the API rejected the request because web search isn't available
 * for this Anthropic organization (it has to be switched on in the Anthropic
 * Console). The agent then answers without search instead of failing.
 */
export function isWebSearchUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status = (err as { status?: unknown }).status;
  const message = String((err as { message?: unknown }).message ?? '');
  return (status === 400 || status === 403) && /web[_ ]search/i.test(message);
}
