// __tests__/lib/agentWriteTools.test.ts
//
// The write tools stage proposals through the classic agent's own staging
// functions (mocked here). These tests pin the wiring: the band and user come
// from the context, everything lands in one collector for one approval card,
// duplicates and the per-turn cap are enforced, and the outreach card stands alone.

const mockStageAction = jest.fn(async (_s: unknown, _a: string, _u: string, type: string, payload: object) => (
  { action_type: type, staged_action_id: `sa-${type}`, proposal: payload, requires_confirmation: true }
));
const mockExec = (type: string) => jest.fn(async (_a: string, _u: string, args: object) => (
  { action_type: type, staged_action_id: `sa-${type}`, proposal: { ...args }, requires_confirmation: true }
));
const mockPayment = mockExec('payment_settle');
const mockTourInsert = mockExec('tour_insert');
const mockResolveStageItems = jest.fn();
const mockStageVenueBatch = jest.fn();
const mockResolveTourOutreach = jest.fn();
const mockBuildNote = jest.fn(async (_s: unknown, _a: string, _u: string, raw: Record<string, unknown>) => ({ ...raw }));

jest.mock('../../lib/aiAgentTools', () => ({
  execStageTourInsert: (...a: unknown[]) => mockTourInsert(...(a as [string, string, object])),
  execStagePaymentSettle: (...a: unknown[]) => mockPayment(...(a as [string, string, object])),
  execStageEmail: mockExec('email_send'),
  execStageEmailTemplate: mockExec('email_template_upsert'),
  execStagePersonnelUpsert: mockExec('personnel_upsert'),
  execStageCalendarSettingsUpdate: mockExec('calendar_settings_update'),
}));
jest.mock('../../lib/server/agentStage', () => ({ stageAction: (...a: unknown[]) => mockStageAction(...(a as [unknown, string, string, string, object])) }));
jest.mock('../../lib/server/agent/stageItems', () => ({ resolveStageItems: (...a: unknown[]) => mockResolveStageItems(...a) }));
jest.mock('../../lib/server/agent/tourOutreach', () => ({ resolveTourOutreach: (...a: unknown[]) => mockResolveTourOutreach(...a) }));
jest.mock('../../lib/server/agentVenueBatch', () => ({
  VENUE_BATCH_CAP: 8,
  stageVenueBatch: (...a: unknown[]) => mockStageVenueBatch(...a),
}));
jest.mock('../../lib/server/agentOfficeActions', () => {
  const actual = jest.requireActual('../../lib/server/agentOfficeActions');
  return { ...actual, buildNotePayload: (...a: unknown[]) => mockBuildNote(...(a as [unknown, string, string, Record<string, unknown>])) };
});

import {
  MAX_STAGED_PER_TURN,
  buildApprovalAction,
  newProposalCollector,
  prepareTourOutreachTool,
  recordPaymentTool,
  createTourTool,
  saveVenuesTool,
  stageShowsTool,
  writeNoteTool,
  writeTools,
} from '../../lib/server/agent/writeTools';
import { READ_TOOLS } from '../../lib/server/agent/readTools';
import { toApiTool, type AgentToolContext } from '../../lib/server/agent/types';

const ACT = 'act-mine';
const USER = 'user-1';

function ctx(): AgentToolContext {
  return { service: {} as AgentToolContext['service'], actId: ACT, userId: USER, today: '2026-10-30', anthropicKey: 'k', proposals: newProposalCollector() };
}

beforeEach(() => jest.clearAllMocks());

describe('tool registry', () => {
  it('gives every tool a unique name', () => {
    const names = [...READ_TOOLS, ...writeTools()].map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('marks every write tool so the engine runs them one at a time', () => {
    for (const tool of writeTools()) expect(tool.kind).toBe('write');
    for (const tool of READ_TOOLS) expect(tool.kind).not.toBe('write');
  });

  it('turns every tool schema into an API tool definition', () => {
    for (const tool of [...READ_TOOLS, ...writeTools()]) {
      const api = toApiTool(tool);
      expect(api.input_schema).toMatchObject({ type: 'object' });
    }
  });

  it('leaves social drafting out while Socials is off', () => {
    expect(writeTools().map(t => t.name)).not.toContain('draft_social_post');
  });

  it('refuses an act_id in the input of tools with strict schemas', () => {
    expect(createTourTool.schema.safeParse({ name: 'Fall', act_id: 'act-other' }).success).toBe(false);
    expect(recordPaymentTool.schema.safeParse({ booking_id: '6f1c1a2e-2b1e-4a5b-9a3c-1d2e3f4a5b6c', agreed_amount: 1, act_id: 'x' }).success).toBe(false);
  });
});

describe('staging', () => {
  it('stages with the caller\'s band and user, and records the item on the card', async () => {
    const c = ctx();
    const result = await createTourTool.run(c, createTourTool.schema.parse({ name: 'Fall Run', start_date: '2026-11-01' }));
    expect(mockTourInsert).toHaveBeenCalledWith(ACT, USER, { name: 'Fall Run', start_date: '2026-11-01' });
    expect(c.proposals?.staged).toEqual([expect.objectContaining({ kind: 'tour_create', staged_action_id: 'sa-tour_insert' })]);
    expect(c.proposals?.dedup.pending).toHaveLength(1);
    expect(result.content).toMatch(/Nothing is saved yet/);
  });

  it('passes null through record_payment so a wrong entry can be cleared', async () => {
    const c = ctx();
    const input = recordPaymentTool.schema.parse({ booking_id: '6f1c1a2e-2b1e-4a5b-9a3c-1d2e3f4a5b6c', agreed_amount: 2500, actual_amount_received: null, payment_status: null });
    await recordPaymentTool.run(c, input);
    expect(mockPayment).toHaveBeenCalledWith(ACT, USER, expect.objectContaining({ agreed_amount: 2500, actual_amount_received: null, payment_status: null }));
  });

  it('stage_shows hands the turn\'s dedup rows to the shared stager and collects its results', async () => {
    mockResolveStageItems.mockResolvedValue({
      staged: [{ kind: 'show', action_type: 'booking_upsert', staged_action_id: 'sa-1', proposal: { show_date: '2026-11-07' } }],
      errors: ['No venue found matching "Nowhere"'],
    });
    const c = ctx();
    const input = stageShowsTool.schema.parse({ tour_name: 'Fall', items: [{ kind: 'show', venueName: 'Wire Road', date: '2026-11-07' }, { kind: 'show', venueName: 'Nowhere', date: '2026-11-08' }] });
    const result = await stageShowsTool.run(c, input);
    expect(mockResolveStageItems).toHaveBeenCalledWith(ACT, USER, 'Fall', input.items, c.service, c.proposals?.dedup);
    expect(c.proposals?.staged).toHaveLength(1);
    expect(c.proposals?.errors).toEqual(['No venue found matching "Nowhere"']);
    expect(result.content).toMatch(/Not staged/);
  });

  it('stops at the per-turn limit and says what did not fit', async () => {
    mockResolveStageItems.mockImplementation(async (_a, _u, _t, items: unknown[]) => ({
      staged: items.map((_, i) => ({ kind: 'show', action_type: 'booking_upsert', staged_action_id: `sa-${i}`, proposal: {} })),
      errors: [],
    }));
    const c = ctx();
    c.proposals!.staged.push(...Array.from({ length: MAX_STAGED_PER_TURN - 2 }, (_, i) => ({ kind: 'show', action_type: 'booking_upsert', staged_action_id: `old-${i}`, proposal: {} })));
    const items = Array.from({ length: 5 }, (_, i) => ({ kind: 'travel' as const, date: `2026-11-0${i + 1}` }));
    const result = await stageShowsTool.run(c, stageShowsTool.schema.parse({ tour_name: 'Fall', items }));
    expect(mockResolveStageItems.mock.calls[0][3]).toHaveLength(2);
    expect(c.proposals?.staged).toHaveLength(MAX_STAGED_PER_TURN);
    expect(result.content).toMatch(/3 more items didn't fit/);

    const full = await createTourTool.run(c, createTourTool.schema.parse({ name: 'Another' }));
    expect(full.isError).toBe(true);
    expect(mockTourInsert).not.toHaveBeenCalled();
  });

  it('save_venues feeds the shared batch stager in chunks, lifting the 8-per-reply cap', async () => {
    mockStageVenueBatch.mockImplementation(async (_s, _a, _u, venues: unknown[]) => ({
      staged: venues.map((_, i) => ({ kind: 'venue_upsert', action_type: 'venue_upsert', staged_action_id: `v-${i}`, proposal: {} })),
      errors: [], overflow: 0,
    }));
    const c = ctx();
    const venues = Array.from({ length: 19 }, (_, i) => ({ name: `Venue ${i}`, city: 'Tulsa', state: 'OK' }));
    await saveVenuesTool.run(c, saveVenuesTool.schema.parse({ venues }));
    expect(mockStageVenueBatch.mock.calls.map(call => (call[3] as unknown[]).length)).toEqual([8, 8, 3]);
    expect(mockStageVenueBatch.mock.calls.every(call => call[1] === ACT && call[2] === USER)).toBe(true);
    expect(c.proposals?.staged).toHaveLength(19);
  });

  it('write_note defaults the day to today', async () => {
    const c = ctx();
    await writeNoteTool.run(c, writeNoteTool.schema.parse({ content: 'New strings before Tulsa' }));
    expect(mockBuildNote).toHaveBeenCalledWith(c.service, ACT, USER, expect.objectContaining({ note_date: '2026-10-30', mode: 'append', visibility: 'admin_only' }), '2026-10-30');
  });
});

describe('tour outreach card', () => {
  const outreach = { tourId: 't1', tourName: 'Fall Run', stage: 'target', venues: [{ tourVenueId: 'tv1', email: 'a@b.c' }], draft: { subject: 'S', body: 'B' }, draftSource: 'generated' };

  it('becomes the turn\'s card', async () => {
    mockResolveTourOutreach.mockResolvedValue(outreach);
    const c = ctx();
    const result = await prepareTourOutreachTool.run(c, prepareTourOutreachTool.schema.parse({ tour_name: 'Fall', stage: 'target' }));
    expect(mockResolveTourOutreach).toHaveBeenCalledWith(c.service, ACT, 'Fall', 'k', 'target', false, null);
    expect(buildApprovalAction(c.proposals!)).toEqual({ type: 'tour_outreach', ...outreach });
    expect(result.content).toMatch(/Nothing has been sent/);
  });

  it('can\'t join a card that already has changes, and blocks changes after it', async () => {
    mockResolveTourOutreach.mockResolvedValue(outreach);
    const withChanges = ctx();
    await createTourTool.run(withChanges, createTourTool.schema.parse({ name: 'Fall' }));
    const refused = await prepareTourOutreachTool.run(withChanges, prepareTourOutreachTool.schema.parse({ tour_name: 'Fall', stage: 'target' }));
    expect(refused.isError).toBe(true);

    const withOutreach = ctx();
    await prepareTourOutreachTool.run(withOutreach, prepareTourOutreachTool.schema.parse({ tour_name: 'Fall', stage: 'target' }));
    await expect(createTourTool.run(withOutreach, createTourTool.schema.parse({ name: 'Fall' }))).rejects.toThrow(/outreach card is already waiting/);
  });

  it('reports an empty tour as an error the model can explain', async () => {
    mockResolveTourOutreach.mockResolvedValue({ error: 'No venues in Target on "Fall Run".' });
    const c = ctx();
    const result = await prepareTourOutreachTool.run(c, prepareTourOutreachTool.schema.parse({ tour_name: 'Fall', stage: 'target' }));
    expect(result).toEqual({ content: 'No venues in Target on "Fall Run".', isError: true });
    expect(c.proposals?.outreach).toBeNull();
  });
});

describe('buildApprovalAction', () => {
  it('returns nothing when nothing was proposed', () => {
    expect(buildApprovalAction(newProposalCollector())).toBeUndefined();
  });

  it('puts every staged change on one stage_items card', () => {
    const c = newProposalCollector();
    c.staged.push({ kind: 'show', action_type: 'booking_upsert', staged_action_id: 'a', proposal: {} }, { kind: 'payment_settle', action_type: 'payment_settle', staged_action_id: 'b', proposal: {} });
    c.errors.push('one skipped');
    expect(buildApprovalAction(c)).toEqual({ type: 'stage_items', staged: c.staged, errors: ['one skipped'], overflow: 0 });
  });
});
