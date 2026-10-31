// __tests__/lib/agentEngine.test.ts
//
// Drives the agent loop with a scripted model: each test lists what the model
// "says" on each step and checks what the engine does with it.

import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  MAX_STEPS,
  MAX_TOOL_RESULT_CHARS,
  capResult,
  runAgentTurn,
  withCacheBreakpoint,
  type StreamFn,
} from '../../lib/server/agent/engine';
import { defineTool, toApiTool, type AgentStreamEvent, type AgentTool, type AgentToolContext } from '../../lib/server/agent/types';

const ctx: AgentToolContext = { service: {} as AgentToolContext['service'], actId: 'act-1', userId: 'user-1', today: '2026-10-30' };

function msg(content: Anthropic.ContentBlock[], stop: Anthropic.Message['stop_reason']): Anthropic.Message {
  return {
    id: 'm', type: 'message', role: 'assistant', model: 'test', content, stop_reason: stop, stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 } as Anthropic.Usage,
  } as Anthropic.Message;
}
const text = (t: string) => ({ type: 'text', text: t, citations: null }) as unknown as Anthropic.ContentBlock;
const toolUse = (id: string, name: string, input: unknown) => ({ type: 'tool_use', id, name, input }) as unknown as Anthropic.ContentBlock;

/** A StreamFn that plays back scripted responses and records every request. */
function scripted(responses: Anthropic.Message[]) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const fn: StreamFn = async (params, onText) => {
    // Snapshot: the engine keeps appending to its message list after this call.
    calls.push(JSON.parse(JSON.stringify(params)));
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    for (const b of next.content) if (b.type === 'text') onText(b.text);
    return next;
  };
  return { fn, calls };
}

const echoTool = defineTool({
  name: 'get_shows',
  description: 'test',
  schema: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict(),
  status: i => `Checking from ${i.from}…`,
  run: async (c, i) => ({ content: `shows for ${c.actId} from ${i.from}` }),
});
const failingTool = defineTool({
  name: 'get_money',
  description: 'test',
  schema: z.object({}).strict(),
  status: () => 'Checking the books…',
  run: async () => { throw new Error('db down'); },
});

function run(responses: Anthropic.Message[], tools: AgentTool[] = [echoTool as AgentTool, failingTool as AgentTool]) {
  const { fn, calls } = scripted(responses);
  const events: AgentStreamEvent[] = [];
  const log = jest.fn();
  const promise = runAgentTurn({
    stream: fn, model: 'claude-sonnet-5-5', system: [{ type: 'text', text: 'sys' }],
    messages: [{ role: 'user', content: 'what is coming up?' }], tools, ctx, onEvent: e => events.push(e), log,
  });
  return { promise, calls, events, log };
}

const toolResultsOf = (call: Anthropic.MessageCreateParamsNonStreaming) => {
  const last = call.messages[call.messages.length - 1];
  return (last.content as Anthropic.ToolResultBlockParam[]);
};

describe('runAgentTurn', () => {
  it('returns a direct answer in one step', async () => {
    const { promise, events } = run([msg([text('You have **3 shows** next week.')], 'end_turn')]);
    const result = await promise;
    expect(result).toEqual({ reply: 'You have **3 shows** next week.', steps: 1, toolCalls: 0, truncated: false });
    expect(events).toEqual([{ type: 'text', delta: 'You have **3 shows** next week.' }]);
  });

  it('runs a tool, feeds the result back, then answers', async () => {
    const { promise, calls, events } = run([
      msg([text('Let me check.'), toolUse('t1', 'get_shows', { from: '2026-11-01' })], 'tool_use'),
      msg([text('November has 2 shows.')], 'end_turn'),
    ]);
    const result = await promise;
    expect(result.reply).toBe('November has 2 shows.');
    expect(result.toolCalls).toBe(1);
    // The narration before the tool call is discarded, and the user sees what's being looked up.
    expect(events).toEqual([
      { type: 'text', delta: 'Let me check.' },
      { type: 'reset' },
      { type: 'status', text: 'Checking from 2026-11-01…' },
      { type: 'text', delta: 'November has 2 shows.' },
    ]);
    // The tool ran for the caller's band, and its result went back to the model.
    expect(toolResultsOf(calls[1])).toEqual([
      expect.objectContaining({ type: 'tool_result', tool_use_id: 't1', content: 'shows for act-1 from 2026-11-01' }),
    ]);
  });

  it('runs several tool calls from one step', async () => {
    const { promise, calls } = run([
      msg([toolUse('a', 'get_shows', { from: '2026-11-01' }), toolUse('b', 'get_shows', { from: '2026-12-01' })], 'tool_use'),
      msg([text('Done.')], 'end_turn'),
    ]);
    await promise;
    expect(toolResultsOf(calls[1]).map(r => r.tool_use_id)).toEqual(['a', 'b']);
  });

  it('returns invalid input to the model as an error instead of running the tool', async () => {
    const { promise, calls } = run([
      msg([toolUse('t1', 'get_shows', { from: 'next tuesday', act_id: 'someone-else' })], 'tool_use'),
      msg([text('Sorry, which date?')], 'end_turn'),
    ]);
    await promise;
    const [result] = toolResultsOf(calls[1]);
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toMatch(/Invalid input/);
  });

  it('reports an unknown tool as an error', async () => {
    const { promise, calls } = run([
      msg([toolUse('t1', 'delete_everything', {})], 'tool_use'),
      msg([text('I can\'t do that.')], 'end_turn'),
    ]);
    await promise;
    expect(toolResultsOf(calls[1])[0]).toMatchObject({ is_error: true, content: 'There is no tool called "delete_everything".' });
  });

  it('turns a tool that throws into an error result and keeps going', async () => {
    const { promise, calls, log } = run([
      msg([toolUse('t1', 'get_money', {})], 'tool_use'),
      msg([text('I couldn\'t load the money right now.')], 'end_turn'),
    ]);
    const result = await promise;
    expect(result.reply).toBe('I couldn\'t load the money right now.');
    expect(toolResultsOf(calls[1])[0]).toMatchObject({ is_error: true });
    expect(String(toolResultsOf(calls[1])[0].content)).toMatch(/db down/);
    expect(log).toHaveBeenCalledWith('tool_error', expect.objectContaining({ tool: 'get_money', message: 'db down' }));
  });

  it('forces an answer on the last step', async () => {
    const loop = msg([toolUse('t', 'get_shows', { from: '2026-11-01' })], 'tool_use');
    const { promise, calls } = run([...Array(MAX_STEPS - 1).fill(loop), msg([text('Here is what I found.')], 'end_turn')]);
    const result = await promise;
    expect(result.steps).toBe(MAX_STEPS);
    expect(calls[MAX_STEPS - 1].tool_choice).toEqual({ type: 'none' });
    expect(calls[0].tool_choice).toBeUndefined();
  });

  it('resumes a paused web-search turn', async () => {
    const { promise, calls, events } = run([
      msg([text('Searching')], 'pause_turn'),
      msg([text('Wire Road books through booking@wireroad.beer.')], 'end_turn'),
    ]);
    const result = await promise;
    expect(result.reply).toBe('Wire Road books through booking@wireroad.beer.');
    expect(calls[1].messages).toHaveLength(2); // the paused assistant turn was handed back
    expect(events).toContainEqual({ type: 'reset' });
  });

  it('flags a reply cut off by the output limit', async () => {
    const { promise } = run([msg([text('Here are all 40 venues: …')], 'max_tokens')]);
    const result = await promise;
    expect(result.truncated).toBe(true);
    expect(result.reply).toMatch(/cut off/);
  });

  it('never returns an empty reply', async () => {
    const { promise } = run([msg([], 'end_turn')]);
    expect((await promise).reply).toMatch(/couldn't put an answer together/);
  });

  it('marks the tool list for prompt caching', async () => {
    const { promise, calls } = run([msg([text('ok')], 'end_turn')]);
    await promise;
    const tools = calls[0].tools as Anthropic.Tool[];
    expect(tools[tools.length - 1].cache_control).toEqual({ type: 'ephemeral' });
    expect(tools[0].cache_control).toBeUndefined();
  });
});

describe('toApiTool', () => {
  it('sends the zod schema as JSON Schema without the draft marker', () => {
    const api = toApiTool(echoTool as AgentTool);
    expect(api.name).toBe('get_shows');
    expect(api.input_schema).toMatchObject({ type: 'object', required: ['from'], additionalProperties: false });
    expect((api.input_schema as Record<string, unknown>).$schema).toBeUndefined();
  });
});

describe('capResult', () => {
  it('leaves short results alone', () => {
    expect(capResult('short')).toBe('short');
  });

  it('cuts long results at a line and says so', () => {
    const long = Array.from({ length: 2000 }, (_, i) => `line ${i} ${'x'.repeat(20)}`).join('\n');
    const capped = capResult(long);
    expect(capped.length).toBeLessThan(MAX_TOOL_RESULT_CHARS + 100);
    expect(capped).toMatch(/result cut off/);
    expect(capped.split('\n').slice(-2, -1)[0]).toMatch(/^line \d+ x+$/);
  });
});

describe('withCacheBreakpoint', () => {
  it('marks the last block without mutating the input', () => {
    const input: Anthropic.MessageParam[] = [{ role: 'user', content: 'hi' }];
    const out = withCacheBreakpoint(input);
    expect(out[0].content).toEqual([{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } }]);
    expect(input[0].content).toBe('hi');
  });

  it('leaves a server-tool tail alone', () => {
    const input: Anthropic.MessageParam[] = [{ role: 'assistant', content: [{ type: 'server_tool_use', id: 's', name: 'web_search', input: {} } as unknown as Anthropic.ContentBlockParam] }];
    expect(withCacheBreakpoint(input)).toBe(input);
  });
});
