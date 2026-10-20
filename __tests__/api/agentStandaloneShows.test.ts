/**
 * Tests for standalone shows and new venue + show staging in agent.ts.
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

const tools = jest.requireMock('../../lib/aiAgentTools') as Record<string, jest.Mock>;

async function send(modelText: string) {
  getMockCreate().mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: modelText }] });
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: { message: 'add it', history: [] },
  });
  await handler(req, res);
  return { status: res._getStatusCode(), body: res._getJSONData() as { reply: string; action?: { staged: unknown[]; errors: string[] } } };
}

describe('agent handler — standalone shows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tools.execStageVenueAndBooking.mockImplementation(async (_a: string, _u: string, args: Record<string, unknown>) => ({
      action_type: 'venue_and_booking_upsert', staged_action_id: 'sa-1', proposal: args, conflicts: [], requires_confirmation: true,
    }));
    tools.execStageBookingUpsert.mockImplementation(async (_a: string, _u: string, args: Record<string, unknown>) => ({
      action_type: 'booking_upsert', staged_action_id: 'sa-2', proposal: { ...args, venue_name: 'Whistling Springs' }, requires_confirmation: true,
    }));
  });

  it('stages a new venue and its show on one card with no tour and the stated status', async () => {
    tools.execFindVenue.mockResolvedValueOnce([]);
    const { status, body } = await send(JSON.stringify({
      reply: "Saved! Kobi's Bar added and the Nov 6 show logged.",
      action: { type: 'stage_items', items: [{
        kind: 'show', venueName: "Kobi's Bar", venueCity: 'Bonner Springs', venueState: 'KS',
        venueAddress: '113 Oak St', venueZip: '66012', venuePhone: '(913) 745-4242', venueWebsite: 'kobis.bar',
        date: '2026-11-06', status: 'confirmed',
      }] },
    }));

    expect(status).toBe(200);
    expect(tools.execFindTour).not.toHaveBeenCalled();
    const args = tools.execStageVenueAndBooking.mock.calls[0][2] as Record<string, unknown>;
    expect(args).toMatchObject({
      venue_name: "Kobi's Bar", venue_city: 'Bonner Springs', venue_state: 'KS',
      venue_address: '113 Oak St', venue_zip: '66012', venue_website: 'kobis.bar',
      show_date: '2026-11-06', status: 'confirmed',
    });
    expect(args).not.toHaveProperty('tour_id');
    expect(body.action?.staged).toHaveLength(1);
    // The model claimed a save that hasn't happened; the server's summary replaces it.
    expect(body.reply).not.toMatch(/Saved!/);
    expect(body.reply).toContain('nothing is saved until you click Confirm');
  });

  it('treats tourName "standalone" as no tour for an existing venue', async () => {
    tools.execFindVenue.mockResolvedValueOnce([{ id: 'venue-1', name: 'Whistling Springs', city: 'Springfield', state: 'MO' }]);
    await send(JSON.stringify({
      reply: 'Here is the Oct 24 show — confirm to save?',
      action: { type: 'stage_items', tourName: 'Standalone', items: [{ kind: 'show', venueName: 'Whistling Springs', date: '2026-10-24', status: 'confirmed' }] },
    }));

    expect(tools.execFindTour).not.toHaveBeenCalled();
    const args = tools.execStageBookingUpsert.mock.calls[0][2] as Record<string, unknown>;
    expect(args).toMatchObject({ venue_id: 'venue-1', show_date: '2026-10-24', status: 'confirmed' });
    expect(args).not.toHaveProperty('tour_id');
  });

  it('still requires a tour for tour notes', async () => {
    const { body } = await send(JSON.stringify({
      reply: 'Updating notes',
      action: { type: 'stage_items', items: [{ kind: 'tour_notes', notes: 'Bring merch' }] },
    }));
    expect(body.reply).toMatch(/Tour notes need a tour/);
  });

  it('asks for a tour that does not exist instead of guessing one', async () => {
    tools.execFindTour.mockResolvedValueOnce([]);
    const { body } = await send(JSON.stringify({
      reply: 'Adding it',
      action: { type: 'stage_items', tourName: 'Winter Run', items: [{ kind: 'show', venueName: 'X', date: '2026-12-01' }] },
    }));
    expect(body.reply).toMatch(/No tour found matching "Winter Run"/);
    expect(tools.execStageBookingUpsert).not.toHaveBeenCalled();
  });
});
