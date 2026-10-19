/**
 * agent.ts — lookups run inside the turn.
 *
 * Regression: "add The Pond's email" stopped at a canned "Found it" reply
 * (the lookup ended the turn) and the next message ("great") looked the venue
 * up again instead of saving the email. A find_venue must now be fed back to the
 * model in the same request so it can stage the venue_upsert.
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

jest.mock('../../lib/server/agentVenueActions', () => ({
  buildVenueUpsertPayload: jest.fn().mockResolvedValue({
    mode: 'update', venue_id: 'v-pond', venue_name: 'The Pond',
    changes: { email: 'thepond@thepondinfranklin.com' }, previous: { email: null },
  }),
  buildContactUpsertPayload: jest.fn(),
}));

jest.mock('../../lib/server/agentStage', () => ({
  stageAction: jest.fn().mockResolvedValue({ id: 'staged-1', summary: 'Update The Pond' }),
}));

jest.mock('../../lib/helpSystemPrompt', () => ({
  HELP_SYSTEM_PROMPT: 'mock help prompt',
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/agent';
import { execFindVenue } from '../../lib/aiAgentTools';
import { buildVenueUpsertPayload } from '../../lib/server/agentVenueActions';
import { stageAction } from '../../lib/server/agentStage';
import { LOOKUP_RESULT_PREFIX, MAX_LOOKUPS_PER_TURN } from '../../lib/server/agentLookup';

function getMockCreate(): jest.Mock {
  return (jest.requireMock('@anthropic-ai/sdk') as { __mockCreate: jest.Mock }).__mockCreate;
}

const text = (t: string) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
const findPond = text('{"reply":"Looking up The Pond.","action":{"type":"find_venue","name":"The Pond","city":"Franklin"}}');
const POND = { id: 'v-pond', name: 'The Pond', city: 'Franklin', state: 'TN', email: null, phone: '(615) 790-1491', bookings: [], contacts: [] };

async function send(message: string) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: { message, history: [] },
  });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData()) };
}

describe('agent handler — lookups inside the turn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (execFindVenue as jest.Mock).mockResolvedValue([POND]);
  });

  it('looks the venue up and stages the email change in one request', async () => {
    getMockCreate()
      .mockResolvedValueOnce(findPond)
      .mockResolvedValueOnce(text('{"reply":"Adding the email to The Pond.","action":{"type":"venue_upsert","venue_id":"v-pond","email":"thepond@thepondinfranklin.com"}}'));

    const { status, body } = await send("Add The Pond's email: thepond@thepondinfranklin.com");

    expect(status).toBe(200);
    expect(getMockCreate()).toHaveBeenCalledTimes(2);
    expect(execFindVenue).toHaveBeenCalledWith('act-1', { name: 'The Pond', city: 'Franklin' });
    expect(buildVenueUpsertPayload).toHaveBeenCalledWith(expect.anything(), 'act-1', { venue_id: 'v-pond', email: 'thepond@thepondinfranklin.com' });
    expect(stageAction).toHaveBeenCalledWith(expect.anything(), 'act-1', 'user-1', 'venue_upsert', expect.anything());
    expect(body.reply).toBe('Adding the email to The Pond.');
    expect(body.action.type).toBe('stage_items');
  });

  it('hands the lookup result back to the model, marked as not from the user, with the id', async () => {
    getMockCreate().mockResolvedValueOnce(findPond).mockResolvedValueOnce(text('Done.'));
    await send('Add the email');

    const second = getMockCreate().mock.calls[1][0];
    const msgs = second.messages as Array<{ role: string; content: string }>;
    expect(msgs[msgs.length - 2]).toMatchObject({ role: 'assistant' });
    expect(msgs[msgs.length - 1].role).toBe('user');
    expect(msgs[msgs.length - 1].content.startsWith(LOOKUP_RESULT_PREFIX)).toBe(true);
    expect(msgs[msgs.length - 1].content).toContain('id: v-pond');
  });

  it('shows the lookup to the user when the model repeats the same lookup', async () => {
    getMockCreate().mockResolvedValueOnce(findPond).mockResolvedValueOnce(findPond);

    const { body } = await send('great');

    expect(getMockCreate()).toHaveBeenCalledTimes(2);
    expect(execFindVenue).toHaveBeenCalledTimes(1);
    expect(body.reply).toMatch(/^Found it:/);
    expect(body.action).toMatchObject({ type: 'find_venue', venues: [POND] });
    expect(stageAction).not.toHaveBeenCalled();
  });

  it(`stops after ${MAX_LOOKUPS_PER_TURN} different lookups`, async () => {
    const mock = getMockCreate();
    for (let i = 0; i <= MAX_LOOKUPS_PER_TURN; i++) {
      mock.mockResolvedValueOnce(text(`{"action":{"type":"find_venue","name":"Venue ${i}"}}`));
    }

    const { body } = await send('find everything');

    expect(mock).toHaveBeenCalledTimes(MAX_LOOKUPS_PER_TURN + 1);
    expect(execFindVenue).toHaveBeenCalledTimes(MAX_LOOKUPS_PER_TURN);
    expect(body.action.type).toBe('find_venue');
  });

  it('does not loop when the follow-up response is truncated', async () => {
    getMockCreate()
      .mockResolvedValueOnce(findPond)
      .mockResolvedValueOnce({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"reply":"Adding' }] });

    const { body } = await send('Add the email');

    expect(getMockCreate()).toHaveBeenCalledTimes(2);
    expect(body.reply).toMatch(/smaller groups/i);
    expect(stageAction).not.toHaveBeenCalled();
  });

  it('leaves a plain-text answer alone (no lookup, one model call)', async () => {
    getMockCreate().mockResolvedValueOnce(text('You have two tours.'));
    const { body } = await send('What tours do I have?');
    expect(getMockCreate()).toHaveBeenCalledTimes(1);
    expect(execFindVenue).not.toHaveBeenCalled();
    expect(body).toEqual({ reply: 'You have two tours.' });
  });

  it('looks up several venues in one step and stages them together with venue_batch', async () => {
    (execFindVenue as jest.Mock).mockImplementation(async (_a: string, q: { name: string }) =>
      [{ ...POND, id: `v-${q.name.toLowerCase()}`, name: q.name }]);
    const byId = async (_s: unknown, _a: string, raw: { venue_id: string }) => ({
      mode: 'update', venue_id: raw.venue_id, venue_name: raw.venue_id, changes: { phone: 'x' }, previous: { phone: null },
    });
    (buildVenueUpsertPayload as jest.Mock).mockImplementationOnce(byId).mockImplementationOnce(byId);
    getMockCreate()
      .mockResolvedValueOnce(text('{"reply":"","action":{"type":"find_venue","names":["Aggie","Wire Road"]}}'))
      .mockResolvedValueOnce(text('{"reply":"Updating both venues.","action":{"type":"venue_batch","venues":[{"venue_id":"v-aggie","phone":"479-555-0100"},{"venue_id":"v-wire road","email":"book@wireroad.beer"}]}}'));

    const { body } = await send('update each of these venues');

    expect(execFindVenue).toHaveBeenCalledTimes(2);
    expect(execFindVenue).toHaveBeenCalledWith('act-1', { name: 'Aggie', city: undefined });
    const fed = (getMockCreate().mock.calls[1][0].messages as Array<{ content: string }>).at(-1)!.content;
    expect(fed).toContain('id: v-aggie');
    expect(fed).toContain('id: v-wire road');
    expect(stageAction).toHaveBeenCalledTimes(2);
    expect(body.reply).toBe('Updating both venues.');
    expect(body.action).toMatchObject({ type: 'stage_items', overflow: 0 });
    expect(body.action.staged).toHaveLength(2);
  });
});
