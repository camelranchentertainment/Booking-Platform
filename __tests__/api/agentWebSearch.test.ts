/**
 * Tests for web search in the /band agent: tool wiring, paused turns, and orgs without web search.
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

async function ask(message = 'find the booking email for Kobi’s in Bonner Springs') {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: { message, history: [] },
  });
  await handler(req, res);
  return { status: res._getStatusCode(), body: res._getJSONData() as { reply: string } };
}

describe('agent handler — web search', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers the web_search tool and appends cited sources to a plain reply', async () => {
    getMockCreate().mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [
        { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'Kobis Bonner Springs booking' } },
        { type: 'web_search_tool_result', tool_use_id: 's1', content: [] },
        { type: 'text', text: 'They book through the contact form.', citations: [{ type: 'web_search_result_location', url: 'https://kobis.bar/contact', title: 'Contact', cited_text: '', encrypted_index: '' }] },
      ],
    });

    const { status, body } = await ask();
    expect(status).toBe(200);
    expect(getMockCreate().mock.calls[0][0].tools).toEqual([expect.objectContaining({ type: 'web_search_20250305', name: 'web_search' })]);
    expect(body.reply).toBe('They book through the contact form.\n\nSources:\n• Contact — https://kobis.bar/contact');
  });

  it('resumes a paused search turn with the paused content', async () => {
    const paused = [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'x' } }];
    getMockCreate()
      .mockResolvedValueOnce({ stop_reason: 'pause_turn', content: paused })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done looking.' }] });

    const { body } = await ask();
    expect(getMockCreate()).toHaveBeenCalledTimes(2);
    const resumed = getMockCreate().mock.calls[1][0].messages as Array<{ role: string; content: unknown }>;
    expect(resumed[resumed.length - 1]).toEqual({ role: 'assistant', content: paused });
    expect(body.reply).toBe('Done looking.');
  });

  it('answers without search when the Anthropic org has web search switched off', async () => {
    getMockCreate()
      .mockRejectedValueOnce(Object.assign(new Error('web_search is not enabled for this organization'), { status: 400 }))
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'I can’t search right now.' }] });

    const { status, body } = await ask();
    expect(status).toBe(200);
    expect(getMockCreate().mock.calls[1][0]).not.toHaveProperty('tools');
    expect(body.reply).toBe('I can’t search right now.');
  });
});
