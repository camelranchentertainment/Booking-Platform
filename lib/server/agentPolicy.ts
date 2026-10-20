/**
 * What the /band AI agent is allowed to change.
 *
 * Policy (Scott, Oct 2026): the agent may write almost anything in the
 * band's own workspace — shows, tours, venues, contacts, roster, notes,
 * templates, drafts, calendar sync — but never:
 *   • money: fees, payments received, expenses, member pay rates
 *   • deletions of profiles or history
 *
 * Money stays readable so the agent can still answer "what did we earn?".
 *
 * This is enforced twice: agent.ts refuses to stage these actions, and the
 * execute route refuses to run them, so a stale or hand-crafted staged row
 * can't slip through either. The agent has no delete actions at all — the
 * only deletes on its path roll back rows it created moments earlier when a
 * multi-step save fails.
 */

/** Staged action types (`ai_staged_actions.action_type`) that move money. */
export const AGENT_MONEY_ACTION_TYPES = [
  'payment_settle',
  'expense_insert',
  'expense_update',
  'expense_archive',
] as const;

/** Action types the model may send that are money changes. */
export const AGENT_MONEY_MODEL_ACTIONS = ['payment_settle', 'expense_update', 'expense_archive'] as const;

/** Money columns that must never ride along on an otherwise allowed write. */
const MONEY_FIELDS = [
  'fee',
  'agreed_amount',
  'actual_amount_received',
  'payment_status',
  'default_pay_amount',
  'deposit_amount',
] as const;

export const MONEY_LOCKED_REPLY =
  "I can't change money — fees, payments, expenses and pay rates are yours to enter on the Financials page " +
  '(or the show and roster pages). I can still look up and add up any of those numbers for you.';

/** True when a staged or model action type would change money. */
export function isAgentMoneyAction(actionType: unknown): boolean {
  if (typeof actionType !== 'string') return false;
  return (AGENT_MONEY_ACTION_TYPES as readonly string[]).includes(actionType)
    || (AGENT_MONEY_MODEL_ACTIONS as readonly string[]).includes(actionType);
}

/**
 * Returns a copy of a payload with every money field removed, plus the names
 * of the fields that were dropped so callers can tell the user.
 */
export function stripMoneyFields<T extends Record<string, unknown>>(payload: T): { payload: T; removed: string[] } {
  const copy: Record<string, unknown> = { ...payload };
  const removed: string[] = [];
  for (const field of MONEY_FIELDS) {
    if (field in copy) {
      delete copy[field];
      removed.push(field);
    }
  }
  return { payload: copy as T, removed };
}
