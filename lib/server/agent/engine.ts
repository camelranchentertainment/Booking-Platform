// lib/server/agent/engine.ts
//
// The agent's work loop, built on the Anthropic API's native tool use.
//
// The classic agent (pages/api/agent.ts) got one shot per message: it had to
// answer from a fixed snapshot or emit one JSON action. This engine lets the
// model work the way a person would — look something up, read the result,
// look up the next thing — and answer once it actually knows:
//
//   model ──tool_use──▶ run tools (in parallel) ──tool_result──▶ model ──▶ … ──▶ answer
//
// Bounded on every axis so a confused turn can't run away with cost or time:
// MAX_STEPS model calls, MAX_TOOL_CALLS tool runs, MAX_TOOL_RESULT_CHARS per
// result, and an AbortSignal tied to the browser connection.
//
// Pure orchestration: the model call is injected (StreamFn), so tests drive the
// loop with scripted responses and never touch the network.

import type Anthropic from '@anthropic-ai/sdk';
import { extractFinalAnswer, appendSources, type WebSource } from '../agentWebSearch';
import { toApiTool, type AgentTool, type AgentToolContext, type AgentStreamEvent } from './types';

/** Most model calls in one turn. The last one is forced to answer instead of calling tools. */
export const MAX_STEPS = 10;
/** Most tool runs in one turn, across all steps. */
export const MAX_TOOL_CALLS = 24;
/** Longest tool result handed to the model; longer results are cut with a note. */
export const MAX_TOOL_RESULT_CHARS = 14_000;
/** Output budget per model call — long enough for a full itinerary or a detailed table. */
export const MAX_OUTPUT_TOKENS = 8_000;

/**
 * Makes one streamed model call. `onText` receives text as it's written; the
 * promise resolves with the complete message.
 */
export type StreamFn = (
  params: Anthropic.MessageCreateParamsNonStreaming,
  onText: (delta: string) => void,
  signal?: AbortSignal,
) => Promise<Anthropic.Message>;

/** The production StreamFn, backed by the SDK's streaming helper. */
export function sdkStreamFn(client: Anthropic): StreamFn {
  return async (params, onText, signal) => {
    const stream = client.messages.stream(params, { signal });
    stream.on('text', onText);
    return stream.finalMessage();
  };
}

export interface RunTurnOptions {
  stream: StreamFn;
  model: string;
  system: Anthropic.TextBlockParam[];
  /** Conversation so far, ending with the user's new message. */
  messages: Anthropic.MessageParam[];
  tools: AgentTool[];
  /** Anthropic-hosted tools such as web search; they run on Anthropic's side. */
  serverTools?: Anthropic.ToolUnion[];
  ctx: AgentToolContext;
  onEvent: (event: AgentStreamEvent) => void;
  signal?: AbortSignal;
  /** Structured log sink; defaults to console. Never receives message text. */
  log?: (event: string, data: Record<string, unknown>) => void;
}

export interface TurnResult {
  /** The final answer, with web sources appended when the model cited any. */
  reply: string;
  steps: number;
  toolCalls: number;
  /** True when the last call hit the output limit, so the reply may be cut short. */
  truncated: boolean;
}

const defaultLog = (event: string, data: Record<string, unknown>) => console.info(`[agent-engine] ${event}`, data);

/**
 * Runs one user turn to completion.
 *
 * @param opts - See RunTurnOptions.
 * @returns The final reply and how the turn went.
 * @throws Whatever the model call throws (API errors, aborts); tool failures never throw.
 */
export async function runAgentTurn(opts: RunTurnOptions): Promise<TurnResult> {
  const log = opts.log ?? defaultLog;
  const toolsByName = new Map(opts.tools.map(t => [t.name, t]));
  const apiTools: Anthropic.ToolUnion[] = [...opts.tools.map(toApiTool), ...(opts.serverTools ?? [])];
  // Cache the tool list with the system prompt: it's identical on every step and every turn.
  const lastTool = apiTools[apiTools.length - 1];
  if (lastTool) apiTools[apiTools.length - 1] = { ...lastTool, cache_control: { type: 'ephemeral' } } as Anthropic.ToolUnion;

  const messages: Anthropic.MessageParam[] = [...opts.messages];
  let toolCalls = 0;
  let sources: WebSource[] = [];

  for (let step = 1; step <= MAX_STEPS; step++) {
    const isLastStep = step === MAX_STEPS || toolCalls >= MAX_TOOL_CALLS;
    const started = Date.now();
    const message = await opts.stream(
      {
        model: opts.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: opts.system,
        tools: apiTools,
        // On the last step the model must answer with what it has rather than ask for more.
        ...(isLastStep ? { tool_choice: { type: 'none' } } : {}),
        messages: withCacheBreakpoint(messages),
      },
      delta => opts.onEvent({ type: 'text', delta }),
      opts.signal,
    );
    log('step', {
      actId: opts.ctx.actId, step, stop: message.stop_reason, ms: Date.now() - started,
      inTok: message.usage.input_tokens, outTok: message.usage.output_tokens,
      cacheRead: message.usage.cache_read_input_tokens ?? 0,
    });

    // A long web search can pause mid-turn; hand the partial turn back so it resumes.
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content });
      opts.onEvent({ type: 'reset' });
      continue;
    }

    const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (message.stop_reason === 'tool_use' && toolUses.length && !isLastStep) {
      // Anything written before a tool call was thinking out loud, not the answer.
      opts.onEvent({ type: 'reset' });
      messages.push({ role: 'assistant', content: message.content });
      const allowed = toolUses.slice(0, Math.max(0, MAX_TOOL_CALLS - toolCalls));
      toolCalls += allowed.length;
      const results = await Promise.all(toolUses.map(use =>
        allowed.includes(use)
          ? runTool(use, toolsByName, opts)
          : Promise.resolve(toolResult(use.id, 'Tool budget for this message is used up. Answer with what you have.', true)),
      ));
      messages.push({ role: 'user', content: results });
      continue;
    }

    const { text, sources: cited } = extractFinalAnswer(message.content);
    if (cited.length) sources = cited;
    const truncated = message.stop_reason === 'max_tokens';
    let reply = text.trim();
    if (truncated) reply += '\n\n_(That ran long and got cut off. Ask me to continue.)_';
    if (!reply) reply = 'I couldn\'t put an answer together for that. Try asking it another way?';
    return { reply: appendSources(reply, sources), steps: step, toolCalls, truncated };
  }

  // Only reachable when every step paused (web search); the last step otherwise always answers.
  log('step_limit', { actId: opts.ctx.actId, toolCalls });
  return {
    reply: 'That one took more digging than I can do in one go. Ask me again, a bit narrower?',
    steps: MAX_STEPS,
    toolCalls,
    truncated: false,
  };
}

/**
 * Runs one tool call: validate input, run, cap the result. Never throws — a
 * failure becomes an error result the model can read and recover from.
 */
async function runTool(
  use: Anthropic.ToolUseBlock,
  toolsByName: Map<string, AgentTool>,
  opts: RunTurnOptions,
): Promise<Anthropic.ToolResultBlockParam> {
  const log = opts.log ?? defaultLog;
  const tool = toolsByName.get(use.name);
  if (!tool) return toolResult(use.id, `There is no tool called "${use.name}".`, true);

  const parsed = tool.schema.safeParse(use.input);
  if (!parsed.success) {
    const why = parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    log('tool_invalid', { actId: opts.ctx.actId, tool: use.name, why });
    return toolResult(use.id, `Invalid input — ${why}. Fix it and try again.`, true);
  }

  const started = Date.now();
  try {
    opts.onEvent({ type: 'status', text: tool.status(parsed.data) });
    const result = await tool.run(opts.ctx, parsed.data);
    log('tool', { actId: opts.ctx.actId, tool: use.name, ms: Date.now() - started, chars: result.content.length, isError: Boolean(result.isError) });
    return toolResult(use.id, capResult(result.content), result.isError);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('tool_error', { actId: opts.ctx.actId, tool: use.name, ms: Date.now() - started, message });
    return toolResult(use.id, `That lookup failed (${message}). Tell the user plainly if it matters; don't guess the data.`, true);
  }
}

function toolResult(id: string, content: string, isError?: boolean): Anthropic.ToolResultBlockParam {
  return { type: 'tool_result', tool_use_id: id, content, ...(isError ? { is_error: true } : {}) };
}

/**
 * Cuts an oversized tool result at a line boundary and says so, so the model
 * knows to narrow its next lookup rather than assume it saw everything.
 *
 * @param content - Tool output.
 * @returns The output, at most MAX_TOOL_RESULT_CHARS plus a short note.
 */
export function capResult(content: string): string {
  if (content.length <= MAX_TOOL_RESULT_CHARS) return content;
  const cut = content.lastIndexOf('\n', MAX_TOOL_RESULT_CHARS);
  const kept = content.slice(0, cut > MAX_TOOL_RESULT_CHARS / 2 ? cut : MAX_TOOL_RESULT_CHARS);
  return `${kept}\n… (result cut off — narrow the filters to see the rest)`;
}

const CACHEABLE_TAILS = new Set(['text', 'tool_result', 'image', 'document']);

/**
 * Marks the newest message as a prompt-cache breakpoint, so each step of a
 * multi-step turn re-reads the earlier steps from cache instead of paying for
 * them again. Returns a copy; the conversation itself is never mutated.
 *
 * @param messages - The conversation so far.
 * @returns The same conversation with cache_control on the last content block.
 */
export function withCacheBreakpoint(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (!messages.length) return messages;
  const out = messages.slice();
  const last = out[out.length - 1];
  const blocks: Anthropic.ContentBlockParam[] = typeof last.content === 'string'
    ? [{ type: 'text', text: last.content }]
    : last.content.slice();
  const tail = blocks[blocks.length - 1];
  // Only block types that accept cache_control everywhere; after a paused web
  // search the tail can be a server-tool block, which is left as is.
  if (!tail || !CACHEABLE_TAILS.has(tail.type)) return messages;
  blocks[blocks.length - 1] = { ...tail, cache_control: { type: 'ephemeral' } } as Anthropic.ContentBlockParam;
  out[out.length - 1] = { ...last, content: blocks };
  return out;
}
