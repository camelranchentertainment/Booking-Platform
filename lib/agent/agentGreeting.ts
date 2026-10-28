// lib/agent/agentGreeting.ts
//
// The booking agent's opening line for a fresh day. Shared by the dashboard
// chat and the pop-out window so both greet the same way.

export interface AgentGreetingInput {
  /** Local hour 0–23 (decides morning / afternoon / evening). */
  hour: number;
  /** The signed-in person's display name; only the first word is used. */
  displayName: string | null | undefined;
  /** Fallback name when the profile has no display name. */
  actName: string | null | undefined;
  toursCount: number;
  targetsCount: number;
}

/** The slice of the Supabase client the count query needs. */
type CountClient = { from: (table: string) => any };

/**
 * Active tours (planning or on the road) and venues still to pitch across the
 * band's non-cancelled tours — the same numbers the dashboard shows. Runs as
 * the signed-in user, so RLS limits it to their own band.
 */
export async function fetchAgentGreetingStats(client: CountClient, actId: string): Promise<{ toursCount: number; targetsCount: number }> {
  const [toursRes, tourIdsRes] = await Promise.all([
    client.from('tours').select('id', { count: 'exact', head: true }).eq('act_id', actId).in('status', ['planning', 'active']),
    client.from('tours').select('id').eq('act_id', actId).neq('status', 'cancelled'),
  ]);
  if (toursRes.error) throw new Error(`tour count failed: ${toursRes.error.message}`);
  if (tourIdsRes.error) throw new Error(`tour list failed: ${tourIdsRes.error.message}`);
  const tourIds = ((tourIdsRes.data ?? []) as Array<{ id: string }>).map(t => t.id);
  let targetsCount = 0;
  if (tourIds.length) {
    const targetsRes = await client.from('tour_venues').select('id', { count: 'exact', head: true }).in('tour_id', tourIds).eq('status', 'target');
    if (targetsRes.error) throw new Error(`target count failed: ${targetsRes.error.message}`);
    targetsCount = targetsRes.count ?? 0;
  }
  return { toursCount: toursRes.count ?? 0, targetsCount };
}

const plural =(n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** e.g. "Good evening Scott! Currently you have 2 active tours and 17 targets in the pipeline. …" */
export function buildAgentGreeting({ hour, displayName, actName, toursCount, targetsCount }: AgentGreetingInput): string {
  const greetingWord = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (displayName || '').trim().split(/\s+/)[0] || actName || 'there';
  return `${greetingWord} ${firstName}! Currently you have ${plural(toursCount, 'active tour')} and ${plural(targetsCount, 'target')} in the pipeline. What should we work on today?`;
}
