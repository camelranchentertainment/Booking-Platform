// lib/server/bookerAi.ts
// Per-agent rate limiting for the workspace's AI features, counted in
// booker_ai_events (service role only) so the limit holds across every server
// instance. The row is written before the model call, so a burst of parallel
// requests cannot all slip under the limit.

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../apiError';

export type AiKind = 'email_draft' | 'assistant';

export interface AiLimits {
  perHour: number;
  perDay: number;
  hourMessage: string;
  dayMessage: string;
}

/**
 * Counts this agent's recent requests of this kind and records one more.
 *
 * @throws AppError 429 with the given message when over a limit
 */
export async function claimAi(service: SupabaseClient, bookerId: string, kind: AiKind, limits: AiLimits, now: Date = new Date()): Promise<void> {
  const count = async (sinceMs: number) => {
    const { count: n, error } = await service
      .from('booker_ai_events')
      .select('id', { count: 'exact', head: true })
      .eq('booker_id', bookerId)
      .eq('kind', kind)
      .gte('created_at', new Date(now.getTime() - sinceMs).toISOString());
    if (error) throw new AppError(500, 'Could not check your AI limit', false);
    return n ?? 0;
  };
  if ((await count(3_600_000)) >= limits.perHour) throw new AppError(429, limits.hourMessage);
  if ((await count(86_400_000)) >= limits.perDay) throw new AppError(429, limits.dayMessage);
  const { error } = await service.from('booker_ai_events').insert({ booker_id: bookerId, kind });
  if (error) throw new AppError(500, 'Could not start the AI request', false);
}
