// __tests__/api/agentStream.test.ts
//
// /api/agent-stream end to end with a fake model: who may call it, what it
// refuses, and that a normal turn streams text and finishes with `done`.

const mockGetUser = jest.fn();
let mockProfile: Record<string, unknown> | null = null;
const touchedTables: string[] = [];
let mockModelScript: Array<{ text: string; stop: string; toolUse?: { id: string; name: string; input: unknown } }> = [];
const modelRequests: Array<Record<string, unknown>> = [];
let mockModelError: Error | null = null;
let mockPendingRows: Array<Record<string, unknown>> = [];
const updates: Array<{ table: string; values: unknown }> = [];

function chain(result: unknown, table = '') {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'not', 'or', 'order', 'limit', 'ilike', 'is', 'upsert']) {
    c[m] = () => c;
  }
  c.update = (values: unknown) => { updates.push({ table, values }); return c; };
  c.single = () => Promise.resolve(result);
  c.maybeSingle = () => Promise.resolve(result);
  c.then = (f: (v: unknown) => unknown, r?: (e: unknown) => unknown) => Promise.resolve(result).then(f, r);
  return c;
}

const mockFrom = jest.fn((table: string) => {
  if (table === 'profiles') return chain({ data: mockProfile, error: null });
  touchedTables.push(table);
  if (table === 'ai_staged_actions') return chain({ data: mockPendingRows, error: null }, table);
  return chain({ data: [], error: null }, table);
});

jest.mock('../../lib/supabase', () => ({
  getServiceClient: () => ({ from: mockFrom, auth: { getUser: mockGetUser } }),
}));
jest.mock('../../lib/platformSettings', () => ({
  getSetting: jest.fn((key: string) => Promise.resolve(key === 'anthropic_api_key' ? 'test-key' : null)),
}));
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }));
// The staging module opens its own service client at import; a full stand-in keeps this test offline.
jest.mock('../../lib/aiAgentTools', () => ({
  execFindVenue: jest.fn(), execFindTour: jest.fn(), execStageBookingUpsert: jest.fn(), execStageTourNotesUpdate: jest.fn(),
  execStageExpense: jest.fn(), execStageVenueAndBooking: jest.fn(), execStagePaymentSettle: jest.fn(), execStageEmail: jest.fn(),
  execStageEmailTemplate: jest.fn(), execStagePersonnelUpsert: jest.fn(), execStageCalendarSettingsUpdate: jest.fn(),
  execStageTourInsert: jest.fn(async (_a: string, _u: string, args: { name: string }) => (
    { action_type: 'tour_insert', staged_action_id: 'sa-1', proposal: { name: args.name }, requires_confirmation: true }
  )),
}));
jest.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status?: number; }
  class RateLimitError extends APIError {}
  class AuthenticationError extends APIError {}
  class APIConnectionError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    static AuthenticationError = AuthenticationError;
    static APIConnectionError = APIConnectionError;
    messages = {
      stream: (params: Record<string, unknown>) => {
        modelRequests.push(params);
        const step = mockModelScript[Math.min(modelRequests.length - 1, mockModelScript.length - 1)];
        let onText: ((d: string) => void) | null = null;
        return {
          on: (_event: string, cb: (d: string) => void) => { onText = cb; },
          finalMessage: async () => {
            if (mockModelError) throw mockModelError;
            if (step.text) onText?.(step.text);
            const content: unknown[] = step.text ? [{ type: 'text', text: step.text, citations: null }] : [];
            if (step.toolUse) content.push({ type: 'tool_use', ...step.toolUse });
            return { content, stop_reason: step.stop, usage: { input_tokens: 1, output_tokens: 1 } };
          },
        };
      },
    };
  }
  return { __esModule: true, default: Anthropic, APIError, RateLimitError };
});

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/agent-stream';

function req(body: unknown, method = 'POST'): NextApiRequest {
  return { method, body, headers: { authorization: 'Bearer tok' } } as unknown as NextApiRequest;
}

/** A response double that records both JSON replies and the event stream. */
function res() {
  const written: string[] = [];
  const r = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    writableEnded: false,
    status(code: number) { r.statusCode = code; return r; },
    json(b: unknown) { r.body = b; r.writableEnded = true; return r; },
    setHeader(k: string, v: unknown) { r.headers[k] = v; },
    writeHead(code: number, h: Record<string, unknown>) { r.statusCode = code; Object.assign(r.headers, h); return r; },
    write(chunk: string) { written.push(chunk); return true; },
    flushHeaders() { /* headers go out immediately in production */ },
    end() { r.writableEnded = true; },
    on: jest.fn(),
  };
  const events = () => written
    .filter(c => c.startsWith('data: '))
    .map(c => JSON.parse(c.slice(6)) as { type: string; [k: string]: unknown });
  return { r: r as unknown as NextApiResponse & typeof r, events };
}

beforeEach(() => {
  touchedTables.length = 0;
  modelRequests.length = 0;
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockProfile = { act_id: 'act-1', role: 'band_admin' };
  mockModelScript = [{ text: 'You have **2 shows** in November.', stop: 'end_turn' }];
  mockModelError = null;
  mockPendingRows = [];
  updates.length = 0;
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('/api/agent-stream', () => {
  it('only accepts POST', async () => {
    const { r } = res();
    await handler(req({}, 'GET'), r);
    expect(r.statusCode).toBe(405);
  });

  it('refuses a Member with 403 before touching any band data', async () => {
    mockProfile = { act_id: 'act-1', role: 'member' };
    const { r } = res();
    await handler(req({ message: 'what pays best?' }), r);
    expect(r.statusCode).toBe(403);
    expect(touchedTables).toEqual([]);
    expect(modelRequests).toHaveLength(0);
  });

  it('refuses a missing session with 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    const { r } = res();
    await handler(req({ message: 'hi' }), r);
    expect(r.statusCode).toBe(401);
  });

  it('rejects an invalid body with a structured 400', async () => {
    const { r } = res();
    await handler(req({ message: '', history: 'nope' }), r);
    expect(r.statusCode).toBe(400);
    expect(r.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('streams the reply and finishes with done', async () => {
    const { r, events } = res();
    await handler(req({ message: 'what is in November?', history: [{ role: 'assistant', content: 'Morning!' }] }), r);
    expect(r.headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
    expect(events()).toEqual([
      { type: 'text', delta: 'You have **2 shows** in November.' },
      { type: 'done', reply: 'You have **2 shows** in November.' },
    ]);
    expect(r.writableEnded).toBe(true);
  });

  it('sends the default model, the tools and the band snapshot', async () => {
    const { r } = res();
    await handler(req({ message: 'hi' }), r);
    const sent = modelRequests[0] as { model: string; tools: Array<{ name: string }>; system: Array<{ text: string }> };
    expect(sent.model).toBe('claude-sonnet-5-5');
    expect(sent.tools.map(t => t.name)).toEqual(expect.arrayContaining(['get_shows', 'find_venues', 'get_money', 'web_search']));
    expect(sent.system[sent.system.length - 1].text).toMatch(/^SNAPSHOT/);
  });

  it('runs a tool for the caller\'s band and streams its status', async () => {
    mockModelScript = [
      { text: '', stop: 'tool_use', toolUse: { id: 't1', name: 'get_tours', input: {} } },
      { text: 'No tours yet.', stop: 'end_turn' },
    ];
    const { r, events } = res();
    await handler(req({ message: 'what tours do I have?' }), r);
    expect(events()).toEqual([
      { type: 'reset' },
      { type: 'status', text: 'Checking your tours…' },
      { type: 'text', delta: 'No tours yet.' },
      { type: 'done', reply: 'No tours yet.' },
    ]);
  });

  it('offers the write tools and ends with one approval card for what was staged', async () => {
    mockModelScript = [
      { text: '', stop: 'tool_use', toolUse: { id: 't1', name: 'create_tour', input: { name: 'Fall Run' } } },
      { text: 'Here\'s the new tour on the card — confirm to save it.', stop: 'end_turn' },
    ];
    const { r, events } = res();
    await handler(req({ message: 'start a tour called Fall Run' }), r);
    const sent = modelRequests[0] as { tools: Array<{ name: string }> };
    expect(sent.tools.map(t => t.name)).toEqual(expect.arrayContaining(['stage_shows', 'record_payment', 'send_email', 'delete_records']));
    expect(jest.requireMock('../../lib/aiAgentTools').execStageTourInsert).toHaveBeenCalledWith('act-1', 'u1', { name: 'Fall Run' });
    const doneEvent = events().find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
    const done = doneEvent as unknown as { action: { type: string; staged: Array<{ kind: string; summary?: string }> } };
    expect(done.action.type).toBe('stage_items');
    expect(done.action.staged).toEqual([expect.objectContaining({ kind: 'tour_create', staged_action_id: 'sa-1' })]);
    // Same per-item summary the classic agent adds for the phone app.
    expect(typeof done.action.staged[0].summary).toBe('string');
  });

  it('sends no card when nothing was staged', async () => {
    const { r, events } = res();
    await handler(req({ message: 'what is in November?' }), r);
    expect(events().find(e => e.type === 'done')).not.toHaveProperty('action');
  });

  it('clears a card left unconfirmed from the last message and tells the model about it', async () => {
    mockPendingRows = [{ id: 'old', action_type: 'tour_insert', payload: { name: 'Spring Run' }, created_at: '2026-10-30T00:00:00Z' }];
    const { r } = res();
    await handler(req({ message: 'never mind that, what pays best?' }), r);
    expect(updates).toContainEqual({ table: 'ai_staged_actions', values: { status: 'cancelled' } });
    const sent = modelRequests[0] as { system: Array<{ text: string }> };
    expect(sent.system[sent.system.length - 1].text).toMatch(/UNCONFIRMED FROM THE LAST MESSAGE/);
  });

  it('refuses off-limits requests without calling the model', async () => {
    const { r, events } = res();
    await handler(req({ message: 'where can I buy cocaine before the show' }), r);
    expect(modelRequests).toHaveLength(0);
    expect(events()).toEqual([expect.objectContaining({ type: 'done' })]);
  });

  it('reports a model failure as a safe error event, without internals', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockModelError = new Error('connect ECONNREFUSED 10.0.0.12:443 at TLSSocket (node:internal/net.js:12)');
    const { r, events } = res();
    await handler(req({ message: 'hi' }), r);
    const all = events();
    const last = all[all.length - 1];
    expect(last.type).toBe('error');
    expect(String(last.message)).not.toMatch(/ECONNREFUSED|10\.0\.0\.12|node:internal/);
    expect(jest.requireMock('@sentry/nextjs').captureException).toHaveBeenCalled();
    expect(r.writableEnded).toBe(true);
  });
});
