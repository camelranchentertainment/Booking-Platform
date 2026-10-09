// lib/server/agentStage.ts
//
// Writes one staged agent proposal (ai_staged_actions row). Nothing changes in
// the band's real data until the user approves the card, which runs
// /api/help/actions/execute.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface StagedResult<T extends string, P> {
  action_type: T;
  staged_action_id: string;
  proposal: P;
  requires_confirmation: true;
}

/**
 * Inserts a pending staged action for the band.
 *
 * @param service    service-role client
 * @param actId      the caller's band (from their profile)
 * @param userId     the caller
 * @param actionType must be allowed by ai_staged_actions_action_type_check
 * @param payload    what the approval card shows and execute applies
 * @throws Error when the insert fails (e.g. the action type isn't allowed yet)
 */
export async function stageAction<T extends string, P extends object>(
  service: SupabaseClient,
  actId: string,
  userId: string,
  actionType: T,
  payload: P,
): Promise<StagedResult<T, P>> {
  const { data, error } = await service
    .from('ai_staged_actions')
    .insert({ act_id: actId, created_by: userId, action_type: actionType, payload })
    .select('id')
    .single();
  if (error) {
    if (/action_type_check/.test(error.message)) {
      throw new Error("That action isn't switched on in the database yet — the latest SQL update needs to be run.");
    }
    throw new Error(`Failed to stage proposal: ${error.message}`);
  }
  return { action_type: actionType, staged_action_id: (data as { id: string }).id, proposal: payload, requires_confirmation: true };
}
