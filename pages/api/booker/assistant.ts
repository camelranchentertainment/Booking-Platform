// pages/api/booker/assistant.ts
// POST { messages: [{ role, content }] } — one turn with the agent's AI
// assistant. Returns { reply, actions } where actions are *proposals* only;
// nothing is written here. The page re-checks each proposal against the
// agent's own rows and runs it only on an Approve click.
//
//   200 { reply, actions }
//   400 invalid conversation · 401/403 not an agent
//   429 assistant limit reached (or provider busy)
//   501 AI not configured · 502 provider error / unusable output
//
// Service role: the caller is resolved with requireBooker and the snapshot is
// read with booker_id = caller, so the model never sees another agent's data.

import type { NextApiRequest, NextApiResponse } from 'next';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getServiceClient } from '../../../lib/supabase';
import { AppError, withHandler } from '../../../lib/apiError';
import { getSetting } from '../../../lib/platformSettings';
import { requireBooker } from '../../../lib/server/requireBooker';
import { claimAi } from '../../../lib/server/bookerAi';
import { ASSISTANT_LIMITS, ASSISTANT_TOOL, assistantSystemPrompt, loadSnapshot, snapshotText } from '../../../lib/server/bookerAssistant';
import { AssistantReply, validActions } from '../../../lib/booker/assistantActions';
import { todayIso } from '../../../lib/booker/dates';

export const ASSISTANT_MODEL = 'claude-sonnet-4-6';

const ConversationSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(20)
    .refine(m => m[m.length - 1].role === 'user', 'The last message must be from you'),
  /** The browser's local date, so "this weekend" means the agent's weekend. */
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** One assistant turn for the signed-in agent. */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    throw new AppError(405, 'Method not allowed');
  }
  const service = getServiceClient();
  const { bookerId } = await requireBooker(req, service);

  const parsed = ConversationSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check your message and try again');
  const { messages } = parsed.data;
  // Accept the client's date only within a day of the server's (time zones).
  const serverToday = todayIso();
  const today = parsed.data.today && Math.abs(Date.parse(parsed.data.today) - Date.parse(serverToday)) <= 86_400_000 ? parsed.data.today : serverToday;

  const apiKey = await getSetting('anthropic_api_key');
  if (!apiKey) throw new AppError(501, 'The assistant is not set up yet. Ask the platform admin to add the Anthropic key.');

  const snapshot = await loadSnapshot(service, bookerId, today);
  await claimAi(service, bookerId, 'assistant', {
    ...ASSISTANT_LIMITS,
    hourMessage: 'You have asked the assistant a lot this hour. Give it a few minutes and try again.',
    dayMessage: "You've reached today's assistant limit. It resets over the next 24 hours.",
  });

  const client = new Anthropic({ apiKey });
  let toolInput: unknown;
  try {
    const message = await client.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 2048,
      system: assistantSystemPrompt(snapshotText(snapshot)),
      tools: [ASSISTANT_TOOL],
      tool_choice: { type: 'tool', name: ASSISTANT_TOOL.name },
      messages,
    });
    toolInput = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')?.input;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new AppError(429, 'The assistant is busy right now. Try again in a moment.');
    console.error('[booker/assistant] model call failed', { name: err instanceof Error ? err.name : 'unknown' });
    throw new AppError(502, 'The assistant is unavailable right now. Try again in a minute.');
  }

  const out = AssistantReply.safeParse(toolInput);
  if (!out.success) throw new AppError(502, 'The assistant gave an empty answer. Try asking again.');

  const known = {
    bands: new Set(snapshot.bands.map(b => b.id)),
    venues: new Set(snapshot.venues.map(v => v.id)),
    shows: new Set(snapshot.shows.filter(s => s.status !== 'cancelled').map(s => s.id)),
  };
  res.status(200).json({ reply: out.data.reply, actions: validActions(out.data.actions, known, today) });
}

export default withHandler(handler);
