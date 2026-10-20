/**
 * Tests that the /band agent never stages money changes (lib/server/agentPolicy.ts).
 * Mocks the Anthropic SDK so no real API calls are made.
 */

// ── Module-level mocks (hoisted before imports by Jest) ───────────────────────

jest.mock('@anthropic-ai/sdk', () => {
  const mockCreate = jest.fn();
  class Anthropic {
    messages = { create: mockCreate };
    static RateLimitError = class extends Error {};
    static APIError = class extends Error { error: unknown = null; };
  }
  return { __esModule: true, default: Anthropic, __mockCreate: mockCreate };
});

jest.mock('../../lib/supabase', () => {
  const buildChain = (data: unknown) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    ['select', 'eq', 'neq', 'is', 'in', 'gt', 'gte', 'or', 'not', 'order', 'limit', 'ilike', 'update'].forEach(m => {
      chain[m] = self;
    });
    chain.then = (fn: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(fn);
    chain.single = () => Promise.resolve({ data, error: null });
    chain.maybeSingle = () => Promise.resolve({ data, error: null });
    return chain;
  };
  const mockFrom = jest.fn((table: string) => {
    if (table === 'profiles') return buildChain({ act_id: 'act-1', role: 'band_admin' });
    if (table === 'ai_staged_actions') return buildChain([]);
    if (table === 'acts') return buildChain({ act_name: 'Test Band', genre: 'Rock' });
    if (table === 'bookings') return buildChain([]);
    if (table === 'tours') return buildChain([]);
    if (table === 'email_log') return buildChain([]);
    return buildChain(null);
  });
  return { getServiceClient: () => ({ from: mockFrom }) };
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
  }),
}));

jest.mock('../../lib/platformSettings', () => ({
  getSetting: jest.fn().mockResolvedValue('mock-anthropic-key'),
}));

jest.mock('../../lib/aiAgentTools', () => ({
  execFindVenue: jest.fn(),
  execFindTour: jest.fn(),
  execStageBookingUpsert: jest.fn(),
  execStageTourNotesUpdate: jest.fn(),
  execStageExpense: jest.fn(),
  execStageTourInsert: jest.fn(),
  execStageVenueAndBooking: jest.fn(),
  execStagePaymentSettle: jest.fn(),
  execStageEmail: jest.fn(),
  execStagePersonnelUpsert: jest.fn(),
}));

jest.mock('../../lib/helpSystemPrompt', () => ({
  HELP_SYSTEM_PROMPT: 'mock help prompt',
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/agent';

// ── Access mock create via jest.requireMock ───────────────────────────────────

function getMockCreate(): jest.Mock {
  return (jest.requireMock('@anthropic-ai/sdk') as { __mockCreate: jest.Mock }).__mockCreate;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

const tools = jest.requireMock('../../lib/aiAgentTools') as Record<string, jest.Mock>;

async function send(action: Record<string, unknown>) {
  getMockCreate().mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ reply: 'Here you go', action }) }] });
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: 'POST', headers: { authorization: 'Bearer t' }, body: { message: 'do it', history: [] },
  });
  await handler(req, res);
  return res._getJSONData() as { reply: string; action?: unknown };
}

describe('agent handler — money is read-only', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    { type: 'payment_settle', booking_id: 'b-1', agreed_amount: 800 },
    { type: 'expense_update', expense_id: 'e-1', amount: 50 },
    { type: 'expense_archive', expense_id: 'e-1' },
  ])('refuses $type without staging', async (action) => {
    const body = await send(action);
    expect(body.reply).toMatch(/can't change money/);
    expect(body.action).toBeUndefined();
  });

  it('refuses an expense item inside stage_items', async () => {
    tools.execFindTour.mockResolvedValueOnce([{ id: 't-1', name: 'Fall Run' }]);
    const body = await send({ type: 'stage_items', tourName: 'Fall Run', items: [{ kind: 'expense', category: 'Gas', amount: 60, date: '2026-11-01' }] });
    expect(body.reply).toMatch(/can't change money/);
  });

  it('refuses a roster change that only sets pay', async () => {
    const body = await send({ type: 'roster_upsert', personnel_id: 'p-1', default_pay_amount: 150 });
    expect(body.reply).toMatch(/can't change money/);
    expect(tools.execStagePersonnelUpsert).not.toHaveBeenCalled();
  });

  it('stages the rest of a roster change but drops the pay rate', async () => {
    tools.execStagePersonnelUpsert.mockResolvedValueOnce({ staged_action_id: 's-1', proposal: { name: 'Mike' } });
    await send({ type: 'roster_upsert', name: 'Mike', instrument_role: 'Bass', default_pay_amount: 150 });
    const args = tools.execStagePersonnelUpsert.mock.calls[0][2] as Record<string, unknown>;
    expect(args).toMatchObject({ name: 'Mike', instrument_role: 'Bass' });
    expect(args).not.toHaveProperty('default_pay_amount');
  });
});
