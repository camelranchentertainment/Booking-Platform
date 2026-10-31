// lib/server/agent/request.ts
//
// Input handling for the tool-based agent route: the request body, the chat
// history the browser sends back, and which model to run.

import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';

/** Longest single message the route accepts (attached files are inlined into it). */
export const MAX_MESSAGE_CHARS = 60_000;
/** Most past messages sent to the model. Older ones are dropped, oldest first. */
export const MAX_HISTORY_MESSAGES = 40;
/** Total history budget in characters, so a long day of chat doesn't balloon every request. */
export const MAX_HISTORY_CHARS = 80_000;

/**
 * Past turns arrive from the browser. They are plain text only: a client can
 * never inject tool calls, tool results or images into the model's context.
 */
const historyMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(MAX_MESSAGE_CHARS),
});

export const agentStreamBodySchema = z.object({
  message: z.string().trim().min(1, 'message required').max(MAX_MESSAGE_CHARS, 'That message is too long.'),
  history: z.array(historyMessageSchema).max(500).default([]),
  saveNote: z.boolean().optional(),
});

export type AgentStreamBody = z.infer<typeof agentStreamBodySchema>;

/**
 * Keeps the most recent history within the message and character budgets and
 * drops empty turns. The newest turns are always kept; trimming starts at the
 * oldest.
 *
 * @param history - Validated past turns, oldest first.
 * @returns The turns to send, oldest first.
 */
export function trimHistory(history: AgentStreamBody['history']): Anthropic.MessageParam[] {
  const kept: Anthropic.MessageParam[] = [];
  let chars = 0;
  for (let i = history.length - 1; i >= 0 && kept.length < MAX_HISTORY_MESSAGES; i--) {
    const m = history[i];
    if (!m.content.trim()) continue;
    if (chars + m.content.length > MAX_HISTORY_CHARS) break;
    chars += m.content.length;
    kept.push({ role: m.role, content: m.content });
  }
  kept.reverse();
  // The API wants the conversation to open with the user; a leading greeting is context, not a turn.
  while (kept.length && kept[0].role === 'assistant') kept.shift();
  return kept;
}

/** Models the agent may run. Anything else in the setting falls back to the default. */
export const AGENT_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'] as const;
export type AgentModel = (typeof AGENT_MODELS)[number];
export const DEFAULT_AGENT_MODEL: AgentModel = 'claude-sonnet-5-5';

/**
 * Picks the model from the `agent_model` platform setting. Switching is a
 * settings change, not a deploy. An unknown or empty value uses the default
 * (and is logged), so a typo can't take the agent down.
 *
 * @param setting - Value of the agent_model platform setting, if any.
 * @returns A model the agent is allowed to run.
 */
export function resolveAgentModel(setting: string | null | undefined): AgentModel {
  const value = setting?.trim();
  if (!value) return DEFAULT_AGENT_MODEL;
  if ((AGENT_MODELS as readonly string[]).includes(value)) return value as AgentModel;
  console.warn('[agent-stream] unknown agent_model setting; using default', { value, fallback: DEFAULT_AGENT_MODEL });
  return DEFAULT_AGENT_MODEL;
}
