/**
 * Tests for agent.ts truncation handling.
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
    ['select', 'eq', 'neq', 'in', 'gt', 'not', 'order', 'limit', 'ilike', 'update'].forEach(m => {
      chain[m] = self;
    });
    chain.then = (fn: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(fn);
    chain.single = () => Promise.resolve({ data, error: null });
    chain.maybeSingle = () => Promise.resolve({ data, error: null });
    return chain;
  };
  const mockFrom = jest.fn((table: string) => {
    if (table === 'profiles') return buildChain({ act_id: 'act-1' });
    if (table === 'ai_staged_actions') return buildChain([]);
    if (table === 'acts') return buildChain({ act_name: 'Test Band', genre: 'Rock' });
    if (table === 'bookings') return buildChain([]);
    if (table === 'tours') return buildChain([]);
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

describe('agent handler — truncation (stop_reason: max_tokens)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a truncation message and does not stage anything when stop_reason is max_tokens', async () => {
    getMockCreate().mockResolvedValueOnce({
      stop_reason: 'max_tokens',
      content: [
        {
          type: 'text',
          text: '{"reply":"Staged 6 items","action":{"type":"stage_items","tourName":"Fall Tour","items":[{"kind":"show","date":"2026-10-03"},{"kind":"show","date":"2026-10-04"}]}}',
        },
      ],
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
      body: { message: 'Add 6 shows to Fall Tour', history: [] },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.reply).toMatch(/smaller groups/i);
    expect(body.action).toBeUndefined();
  });

  it('returns a plain reply when stop_reason is end_turn', async () => {
    getMockCreate().mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Here is what I found.' }],
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
      body: { message: 'What tours do I have?', history: [] },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.reply).toBe('Here is what I found.');
    expect(body.action).toBeUndefined();
  });
});
