// pages/api/agent-stream.ts
//
// The tool-based booking agent (beta). Same caller rules as /api/agent — band
// admins only, the band comes from the caller's profile — but the model works
// in a loop with look-up tools and the reply streams to the browser as it's
// written (server-sent events).
//
// Nothing here writes the band's data. Write tools STAGE proposals (pending
// ai_staged_actions rows, the same ones the classic agent creates); the turn's
// proposals reach the browser as one approval card, and the user's Confirm
// click runs /api/help/actions/execute.
//
// Event stream (one JSON object per `data:` line, see AgentStreamEvent):
//   status → text… → reset (model used a tool; drop the draft) → … → done (+ approval card) | error

import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/nextjs';
import { getServiceClient } from '../../lib/supabase';
import { requireBandAdmin } from '../../lib/server/requireBandAdmin';
import { AppError } from '../../lib/apiError';
import { getSetting } from '../../lib/platformSettings';
import { FEATURES } from '../../lib/featureFlags';
import { HELP_SYSTEM_PROMPT } from '../../lib/helpSystemPrompt';
import { AGENT_CONTENT_RULES, CONTENT_REFUSAL, screenRequest } from '../../lib/server/agentContentGuard';
import { AGENT_WEB_SEARCH_TOOL, isWebSearchUnavailableError } from '../../lib/server/agentWebSearch';
import { AGENT_SYSTEM_PROMPT } from '../../lib/server/agent/systemPrompt';
import { buildAgentSnapshot } from '../../lib/server/agent/snapshot';
import { READ_TOOLS } from '../../lib/server/agent/readTools';
import { writeTools, newProposalCollector, buildApprovalAction } from '../../lib/server/agent/writeTools';
import { formatPendingContextSummary, withStagedSummaries } from '../../lib/agentStagingHelpers';
import { runAgentTurn, sdkStreamFn } from '../../lib/server/agent/engine';
import { agentStreamBodySchema, resolveAgentModel, trimHistory } from '../../lib/server/agent/request';
import type { AgentStreamEvent, AgentToolContext } from '../../lib/server/agent/types';

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
  // A multi-step turn with web search can take a while; the default would cut it off.
  maxDuration: 120,
};

/** Comment line sent while tools run so proxies don't close a quiet connection. */
const HEARTBEAT_MS = 15_000;

/**
 * POST /api/agent-stream
 * Body: { message: string, history?: {role, content}[], saveNote?: boolean }
 * Responds with text/event-stream; validation and auth failures respond with
 * JSON and a 4xx/5xx status before the stream starts.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } });
  }
  if (!FEATURES.agentToolEngine) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The new agent isn\'t switched on.' } });
  }

  const service = getServiceClient();
  let caller: Awaited<ReturnType<typeof requireBandAdmin>>;
  try {
    caller = await requireBandAdmin(req, service);
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 401;
    return res.status(status).json({ error: { code: status === 403 ? 'FORBIDDEN' : 'UNAUTHORIZED', message: err instanceof Error ? err.message : 'Unauthorized' } });
  }

  const parsed = agentStreamBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid request', details: parsed.error.issues } });
  }
  const { message, history, saveNote } = parsed.data;

  const anthropicKey = await getSetting('anthropic_api_key');
  if (!anthropicKey) {
    return res.status(503).json({ error: { code: 'AI_NOT_CONFIGURED', message: 'AI isn\'t configured yet. Add the Anthropic API key in Settings.' } });
  }

  // ── From here on, everything goes down the event stream ─────────────────────
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    // Makes Next's built-in gzip skip this response; compressing would hold text back until the turn ends.
    'Content-Encoding': 'none',
  });
  res.flushHeaders();
  const send = (event: AgentStreamEvent) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(': keep-alive\n\n'); }, HEARTBEAT_MS);
  // Stop paying for model calls the moment the user closes the tab or hits Stop.
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  const finish = () => { clearInterval(heartbeat); if (!res.writableEnded) res.end(); };

  const actId = caller.actId;

  // Off-limits topics are refused before the model (or its web search) runs.
  const blocked = screenRequest(message);
  if (blocked) {
    console.warn('[agent-stream] refused off-limits request', { actId, category: blocked });
    send({ type: 'done', reply: CONTENT_REFUSAL });
    return finish();
  }

  const today = new Date().toISOString().slice(0, 10);
  // Recently confirmed actions: staging the same thing again within 10 minutes is refused as a duplicate.
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const ctx: AgentToolContext = {
    service, actId, userId: caller.userId, today, anthropicKey,
    proposals: newProposalCollector(),
  };

  try {
    const [snapshot, modelSetting, recentRes, pendingRes] = await Promise.all([
      buildAgentSnapshot(service, actId, today),
      getSetting('agent_model'),
      service.from('ai_staged_actions').select('action_type, payload')
        .eq('act_id', actId).eq('status', 'executed').gt('executed_at', tenMinutesAgo),
      service.from('ai_staged_actions').select('id, action_type, payload, created_at')
        .eq('act_id', actId).eq('created_by', caller.userId).eq('status', 'pending').gt('expires_at', new Date().toISOString()),
    ]);
    if (ctx.proposals) ctx.proposals.dedup.recent = (recentRes.data ?? []) as typeof ctx.proposals.dedup.recent;

    // A card left unconfirmed when the user sends a new message is cleared, as in the classic
    // agent; the model is told what it was so it can offer it again.
    const pendingRows = pendingRes.data ?? [];
    if (pendingRows.length) {
      const { error: cancelErr } = await service.from('ai_staged_actions').update({ status: 'cancelled' })
        .eq('act_id', actId).eq('created_by', caller.userId).eq('status', 'pending');
      if (cancelErr) console.error('[agent-stream] clearing unconfirmed proposals failed', { actId, message: cancelErr.message });
    }
    const pendingNote = pendingRows.length
      ? `\n\nUNCONFIRMED FROM THE LAST MESSAGE (now cleared — offer to stage them again if the user still wants them):\n${formatPendingContextSummary(pendingRows)}`
      : '';
    const model = resolveAgentModel(modelSetting);

    // Stable blocks first and cached; the per-band snapshot changes, so it comes last, uncached.
    const system: Anthropic.TextBlockParam[] = [
      { type: 'text', text: `${AGENT_SYSTEM_PROMPT}\n\n${AGENT_CONTENT_RULES}\n\n═══ PLATFORM DOCUMENTATION ═══\n\n${HELP_SYSTEM_PROMPT}`, cache_control: { type: 'ephemeral' } },
      ...(FEATURES.socials ? [] : [{ type: 'text' as const, text: 'Socials is switched off right now: don\'t offer or draft social posts; if asked, say the feature is being finished.' }]),
      { type: 'text', text: `SNAPSHOT (live from the database; use tools for anything more):\n\n${snapshot}${pendingNote}` },
    ];

    const client = new Anthropic({ apiKey: anthropicKey });
    const messages: Anthropic.MessageParam[] = [...trimHistory(history), { role: 'user', content: message }];
    const turnInput = {
      stream: sdkStreamFn(client),
      model,
      system,
      messages,
      tools: [...READ_TOOLS, ...writeTools()],
      ctx,
      onEvent: send,
      signal: abort.signal,
    };

    const started = Date.now();
    let result;
    try {
      result = await runAgentTurn({ ...turnInput, serverTools: [AGENT_WEB_SEARCH_TOOL] });
    } catch (err) {
      // Web search is an org-level switch in the Anthropic Console; answer without it rather than fail.
      if (!isWebSearchUnavailableError(err)) throw err;
      console.warn('[agent-stream] web search unavailable for this Anthropic org; answering without it', { actId });
      send({ type: 'reset' });
      result = await runAgentTurn(turnInput);
    }
    console.info('[agent-stream] turn', { actId, model, steps: result.steps, toolCalls: result.toolCalls, truncated: result.truncated, ms: Date.now() - started });

    if (saveNote) await saveConversationNote(ctx, history, message, result.reply);
    const action = ctx.proposals ? buildApprovalAction(ctx.proposals) : undefined;
    if (action) console.info('[agent-stream] proposals staged', { actId, type: action.type, count: Array.isArray(action.staged) ? action.staged.length : 1 });
    // withStagedSummaries adds the per-item summary/caution text the phone app shows, same as /api/agent.
    send({ type: 'done', reply: result.reply, ...(action ? { action: withStagedSummaries(action) } : {}) });
  } catch (err) {
    if (abort.signal.aborted) {
      console.info('[agent-stream] turn cancelled by the client', { actId });
    } else {
      console.error('[agent-stream] turn failed', { actId, error: describeError(err) });
      // Busy/overloaded API responses are expected weather, not bugs; everything else gets reported.
      if (!(err instanceof Anthropic.RateLimitError)) Sentry.captureException(err, { tags: { route: 'agent-stream' }, extra: { actId } });
      send({ type: 'error', message: userFacingError(err) });
    }
  } finally {
    finish();
  }
}

/**
 * Saves today's Q&A thread to the user's daily note, matching the classic
 * agent's "save to notes" behaviour. A failure is logged, never fatal: the
 * user still gets their answer.
 */
async function saveConversationNote(
  ctx: AgentToolContext,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  message: string,
  reply: string,
): Promise<void> {
  const thread = [...history.map(m => `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}`), `Q: ${message}`, `A: ${reply}`].join('\n');
  const { error } = await ctx.service.from('daily_notes').upsert(
    { user_id: ctx.userId, note_date: ctx.today, content: thread, act_id: ctx.actId, visibility: 'admin_only', updated_at: new Date().toISOString() },
    { onConflict: 'user_id,note_date' },
  );
  if (error) console.error('[agent-stream] save note failed', { actId: ctx.actId, message: error.message });
}

/** A message safe to show the user: no stack traces, keys or internals. */
export function userFacingError(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) return 'The AI is busy right now. Give it a few seconds and try again.';
  if (err instanceof Anthropic.AuthenticationError) return 'The AI key isn\'t working. Check the Anthropic API key in Settings.';
  if (err instanceof Anthropic.APIConnectionError) return 'Couldn\'t reach the AI. Check your connection and try again.';
  if (err instanceof Anthropic.APIError && (err.status === 529 || err.status === 503)) return 'The AI is overloaded right now. Try again in a minute.';
  return 'Something went wrong on our side answering that. Try again, and if it keeps happening, switch the beta off for now.';
}

/** Log-safe description of an error (no request bodies or keys). */
function describeError(err: unknown): Record<string, unknown> {
  if (err instanceof Anthropic.APIError) return { kind: 'anthropic', status: err.status, message: err.message };
  if (err instanceof Error) return { kind: err.name, message: err.message };
  return { kind: typeof err };
}
