// lib/server/agent/types.ts
//
// The contract every agent tool implements. A tool is one well-described thing
// the model can do in the middle of answering, e.g. "list this band's shows in
// November" or "read this venue's history". The engine (engine.ts) runs the
// model, runs the tools it asks for, and feeds the results back until the
// model has what it needs to answer.
//
// Security model (unchanged from the classic agent):
//   - The band comes from AgentToolContext.actId, which the route takes from the
//     caller's profile. No tool accepts an act id, band id or user id as input.
//   - Every tool input is validated with its zod schema before run() sees it.
//   - Read tools only read. Anything that changes data is staged for the
//     user's Confirm click (added in the next step of the rebuild); no tool
//     ever writes the band's data directly.

import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Everything a tool may use. Built once per request by the route. */
export interface AgentToolContext {
  /** Service-role client. Bypasses RLS, so every query MUST filter on actId. */
  service: SupabaseClient;
  /** The caller's band, from their profile. Never from the request. */
  actId: string;
  /** The caller. */
  userId: string;
  /** Today in YYYY-MM-DD (UTC), so every tool agrees on what "upcoming" means. */
  today: string;
}

/** What a tool hands back to the model. */
export interface AgentToolResult {
  /** Text the model reads. Plain, compact, ids included so follow-up tools can use them. */
  content: string;
  /** True when the tool failed; the model is told and can recover or explain. */
  isError?: boolean;
}

export interface AgentTool<Schema extends z.ZodType = z.ZodType> {
  /** snake_case name the model calls. */
  name: string;
  /** When to use it and what comes back. This is the model's only manual for the tool. */
  description: string;
  /** Input contract. Validated before run(); also sent to the model as JSON Schema. */
  schema: Schema;
  /**
   * One short line for the chat while the tool runs, e.g. "Checking November shows…".
   * Must not include anything sensitive; it is shown to the user and not stored.
   */
  status: (input: z.infer<Schema>) => string;
  /** Does the work. Throwing is fine: the engine turns it into an error result for the model. */
  run: (ctx: AgentToolContext, input: z.infer<Schema>) => Promise<AgentToolResult>;
}

/**
 * Declares a tool with full type inference between its schema, status and run.
 *
 * @param tool - The tool definition.
 * @returns The same definition, typed.
 */
export function defineTool<Schema extends z.ZodType>(tool: AgentTool<Schema>): AgentTool<Schema> {
  return tool;
}

/**
 * Converts a tool to the Anthropic API's tool definition. The JSON Schema comes
 * from the zod schema, so what the model is told and what the server enforces
 * can never drift apart.
 *
 * @param tool - A tool from the registry.
 * @returns The API tool definition.
 */
export function toApiTool(tool: AgentTool): Anthropic.Tool {
  const json = z.toJSONSchema(tool.schema) as Record<string, unknown>;
  // The API takes a bare schema object; the draft marker is noise in every request.
  delete json.$schema;
  return {
    name: tool.name,
    description: tool.description,
    input_schema: json as Anthropic.Tool.InputSchema,
  };
}

/** Events streamed to the browser while a turn runs (server-sent events). */
export type AgentStreamEvent =
  /** A piece of the reply as the model writes it. */
  | { type: 'text'; delta: string }
  /** Discard the streamed text so far: it was the model thinking out loud before using a tool. */
  | { type: 'reset' }
  /** A tool started; show the line while it runs. */
  | { type: 'status'; text: string }
  /** The turn finished. `reply` is the complete, final text to keep in the conversation. */
  | { type: 'done'; reply: string }
  /** The turn failed. `message` is safe to show the user. */
  | { type: 'error'; message: string };
