// __tests__/api/booker/messageDraft.test.ts
// The draft route reads the agent's data with the service role and calls the
// model: it must scope every read to the caller, rate-limit, and never send.

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
import Anthropic from '@anthropic-ai/sdk';
import handler from '../../../pages/api/booker/messages/draft';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

const BOOKER = 'bk-1';
const VENUE = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
type Row = Record<string, unknown>;

function setup({ booker = { id: BOOKER } as Row | null, rows = {} as Record<string, Row[]>, aiCount = 0 } = {}) {
  const lookups: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; row: Row }> = [];
  const client = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }) },
    from: jest.fn((table: string) => {
      const filters: Record<string, unknown> = {};
      let head = false;
      const b: Record<string, unknown> = {};
      b.select = (_c?: string, o?: { head?: boolean }) => ((head = Boolean(o?.head)), b);
      b.eq = (k: string, v: unknown) => ((filters[k] = v), b);
      for (const m of ['is', 'gte', 'lte', 'in', 'order', 'limit']) b[m] = () => b;
      b.insert = (row: Row) => (inserts.push({ table, row }), Promise.resolve({ error: null }));
      b.maybeSingle = () => {
        lookups.push({ table, filters: { ...filters } });
        if (table === 'booker_profiles' && 'user_id' in filters) return Promise.resolve({ data: booker, error: null });
        if (table === 'booker_profiles') return Promise.resolve({ data: { agency_name: 'Lone Star Booking', contact_name: 'Pat', contact_phone: null }, error: null });
        const m = (rows[table] ?? []).find(r => Object.entries(filters).every(([k, v]) => r[k] === v));
        return Promise.resolve({ data: m ?? null, error: null });
      };
      b.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) =>
        Promise.resolve(head ? { count: table === 'booker_ai_events' ? aiCount : 0, error: null } : { data: [], error: null }).then(f, r);
      return b;
    }),
  };
  (getServiceClient as jest.Mock).mockReturnValue(client);
  return { lookups, inserts };
}

function call(body: Row) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const req = { method: 'POST', body, headers: { authorization: 'Bearer tok' } } as unknown as NextApiRequest;
  const res = { status, json, setHeader: jest.fn() } as unknown as NextApiResponse;
  return { run: () => handler(req, res), status, json };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (getSetting as jest.Mock).mockResolvedValue('sk-test');
  mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"subject":"Hold - Nov 14","body":"Sarah,\\n\\nCan you hold Nov 14?\\n\\nThanks,\\nPat"}' }] });
});

describe('POST /api/booker/messages/draft', () => {
  it('refuses a caller with no agent workspace', async () => {
    setup({ booker: null });
    const { run, status } = call({});
    await run();
    expect(status).toHaveBeenCalledWith(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('says plainly when AI is not configured', async () => {
    setup();
    (getSetting as jest.Mock).mockResolvedValue('');
    const { run, status } = call({});
    await run();
    expect(status).toHaveBeenCalledWith(501);
  });

  it("will not draft from another agent's venue", async () => {
    const { lookups } = setup({ rows: { booker_venues: [{ id: VENUE, booker_id: 'other-agent' }] } });
    const { run, status } = call({ venue_id: VENUE });
    await run();
    expect(status).toHaveBeenCalledWith(400);
    expect(lookups.find(l => l.table === 'booker_venues')?.filters).toMatchObject({ booker_id: BOOKER });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('enforces the AI limit before calling the model', async () => {
    setup({ aiCount: 30 });
    const { run, status } = call({});
    await run();
    expect(status).toHaveBeenCalledWith(429);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('records usage, passes facts as data, and returns the draft', async () => {
    const { inserts } = setup({ rows: { booker_venues: [{ id: VENUE, booker_id: BOOKER, name: 'Gruene Hall', city: 'New Braunfels', state: 'TX', kind: 'venue', capacity: 800 }] } });
    const { run, status, json } = call({ venue_id: VENUE, template_key: 'hold_request', instructions: 'ask for Nov 14' });
    await run();
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toEqual({ draft: { subject: 'Hold - Nov 14', body: 'Sarah,\n\nCan you hold Nov 14?\n\nThanks,\nPat' } });
    expect(inserts).toContainEqual({ table: 'booker_ai_events', row: { booker_id: BOOKER, kind: 'email_draft' } });
    expect(inserts.some(i => i.table === 'booker_messages')).toBe(false);
    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string;
    expect(prompt).toContain('Gruene Hall');
    expect(prompt).toContain('"Ask for a hold" outline');
    expect(prompt).toContain('ask for Nov 14');
  });

  it('reports unusable model output as a 502', async () => {
    setup();
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Sorry, I cannot.' }] });
    const { run, status } = call({});
    await run();
    expect(status).toHaveBeenCalledWith(502);
  });

  it('maps provider rate limiting to 429', async () => {
    setup();
    const RL = (Anthropic as unknown as { RateLimitError: new (m: string) => Error }).RateLimitError;
    mockCreate.mockRejectedValue(new RL('busy'));
    const { run, status } = call({});
    await run();
    expect(status).toHaveBeenCalledWith(429);
  });

  it('rejects an unknown template', async () => {
    setup();
    const { run, status } = call({ template_key: 'nope' });
    await run();
    expect(status).toHaveBeenCalledWith(400);
  });
});
