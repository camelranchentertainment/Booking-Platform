// __tests__/api/booker/assistant.test.ts
// The assistant route reads the agent's workspace with the service role: it
// must scope every read to the caller, rate-limit, never write, and pass on
// only proposals that point at the caller's own rows.

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  class RateLimitError extends Error {}
  class APIError extends Error {}
  const Anthropic = jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } }));
  Object.assign(Anthropic, { RateLimitError, APIError });
  return { __esModule: true, default: Anthropic };
});
jest.mock('../../../lib/supabase', () => ({ getServiceClient: jest.fn() }));
jest.mock('../../../lib/platformSettings', () => ({ getSetting: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../../pages/api/booker/assistant';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

const BOOKER = 'bk-1';
const BAND = '11111111-1111-4111-8111-111111111111';
const FOREIGN = '99999999-9999-4999-8999-999999999999';
type Row = Record<string, unknown>;

function setup({ booker = { id: BOOKER } as Row | null, aiCount = 0 } = {}) {
  const reads: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const writes: Array<{ table: string; op: string }> = [];
  const data: Record<string, Row[]> = {
    booker_roster: [{ id: BAND, band_name: 'The Jackwagons', genre: null, home_city: null, home_state: null, commission_pct: 15, status: 'active' }],
    booker_shows: [],
    booker_venues: [],
    booker_messages: [],
    booker_commission_payments: [],
  };
  const client = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
    from: jest.fn((table: string) => {
      const filters: Record<string, unknown> = {};
      let head = false;
      const b: Record<string, unknown> = {};
      b.select = (_c?: string, o?: { head?: boolean }) => ((head = Boolean(o?.head)), b);
      b.eq = (k: string, v: unknown) => ((filters[k] = v), b);
      for (const m of ['is', 'gte', 'lte', 'in', 'order', 'limit', 'not']) b[m] = () => b;
      for (const m of ['update', 'delete', 'upsert']) b[m] = () => (writes.push({ table, op: m }), b);
      b.insert = () => (writes.push({ table, op: 'insert' }), Promise.resolve({ error: null }));
      b.maybeSingle = () => {
        reads.push({ table, filters: { ...filters } });
        if (table === 'booker_profiles' && 'user_id' in filters) return Promise.resolve({ data: booker, error: null });
        return Promise.resolve({ data: { agency_name: 'Lone Star Booking' }, error: null });
      };
      b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
        reads.push({ table, filters: { ...filters } });
        return Promise.resolve(head ? { count: aiCount, error: null } : { data: data[table] ?? [], error: null }).then(ok, bad);
      };
      return b;
    }),
  };
  (getServiceClient as jest.Mock).mockReturnValue(client);
  return { reads, writes };
}

function call(body: Row) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const req = { method: 'POST', body, headers: { authorization: 'Bearer t' } } as unknown as NextApiRequest;
  return { run: () => handler(req, { status, json, setHeader: jest.fn() } as unknown as NextApiResponse), status, json };
}

const ask = { messages: [{ role: 'user', content: 'What needs my attention?' }] };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (getSetting as jest.Mock).mockResolvedValue('sk-test');
  mockCreate.mockResolvedValue({
    content: [
      {
        type: 'tool_use',
        name: 'respond',
        input: {
          reply: 'Two holds need a follow-up.',
          actions: [
            { type: 'add_hold', roster_id: BAND, venue_name: 'Saxon Pub', venue_city: 'Austin', show_date: '2099-11-14', reason: 'Open Saturday' },
            { type: 'add_hold', roster_id: FOREIGN, venue_name: 'X', show_date: '2099-11-14', reason: 'Not theirs' },
          ],
        },
      },
    ],
  });
});

describe('POST /api/booker/assistant', () => {
  it('refuses a caller with no agent workspace', async () => {
    setup({ booker: null });
    const { run, status } = call(ask);
    await run();
    expect(status).toHaveBeenCalledWith(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('requires the last turn to be the agent’s', async () => {
    setup();
    const { run, status } = call({ messages: [{ role: 'assistant', content: 'hi' }] });
    await run();
    expect(status).toHaveBeenCalledWith(400);
  });

  it('says plainly when AI is not configured', async () => {
    setup();
    (getSetting as jest.Mock).mockResolvedValue('');
    const { run, status } = call(ask);
    await run();
    expect(status).toHaveBeenCalledWith(501);
  });

  it('enforces the assistant limit before calling the model', async () => {
    setup({ aiCount: 60 });
    const { run, status } = call(ask);
    await run();
    expect(status).toHaveBeenCalledWith(429);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("answers from the caller's own data, writes nothing but the usage row, and drops foreign proposals", async () => {
    const { reads, writes } = setup();
    const { run, status, json } = call(ask);
    await run();
    expect(status).toHaveBeenCalledWith(200);
    const body = json.mock.calls[0][0];
    expect(body.reply).toBe('Two holds need a follow-up.');
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0]).toMatchObject({ roster_id: BAND });
    for (const t of ['booker_roster', 'booker_shows', 'booker_venues', 'booker_messages', 'booker_commission_payments']) {
      expect(reads.filter(r => r.table === t).every(r => r.filters.booker_id === BOOKER)).toBe(true);
    }
    expect(writes).toEqual([{ table: 'booker_ai_events', op: 'insert' }]);
    const req = mockCreate.mock.calls[0][0];
    expect(req.tool_choice).toEqual({ type: 'tool', name: 'respond' });
    expect(req.system).toContain('The Jackwagons');
    expect(req.system).not.toContain(FOREIGN);
  });

  it('reports unusable model output as a 502', async () => {
    setup();
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'hello' }] });
    const { run, status } = call(ask);
    await run();
    expect(status).toHaveBeenCalledWith(502);
  });
});
