// __tests__/lib/stageEmailTemplate.test.ts
// execStageEmailTemplate: the agent's "save as template" proposal.

const mockLog = {
  filters: [] as Array<[string, string, unknown]>,
  stagedInserts: [] as Array<Record<string, unknown>>,
  existing: null as { id: string } | null,
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const c: any = {};
      c.select = () => c;
      for (const m of ['eq', 'ilike']) c[m] = (col: string, v: unknown) => { mockLog.filters.push([m, col, v]); return c; };
      c.maybeSingle = () => Promise.resolve({ data: table === 'email_templates' ? mockLog.existing : null, error: null });
      c.insert = (row: Record<string, unknown>) => { mockLog.stagedInserts.push(row); return c; };
      c.single = () => Promise.resolve({ data: { id: 'staged-1' }, error: null });
      return c;
    },
  }),
}));

import { execStageEmailTemplate } from '../../lib/aiAgentTools';

beforeEach(() => {
  mockLog.filters = [];
  mockLog.stagedInserts = [];
  mockLog.existing = null;
});

describe('execStageEmailTemplate', () => {
  it('stages a new template for the caller\'s band without writing the template itself', async () => {
    const out = await execStageEmailTemplate('act-1', 'u-1', { name: ' Brewery pitch ', subject: 'Hi', body: 'Hello [Venue Name]' });
    expect(out).toMatchObject({ action_type: 'email_template_upsert', staged_action_id: 'staged-1', requires_confirmation: true });
    expect(out.proposal).toEqual({ name: 'Brewery pitch', subject: 'Hi', body: 'Hello [Venue Name]', replaces_existing: false });
    expect(mockLog.stagedInserts).toHaveLength(1);
    expect(mockLog.stagedInserts[0]).toMatchObject({ act_id: 'act-1', created_by: 'u-1', action_type: 'email_template_upsert' });
    expect(mockLog.filters).toContainEqual(['eq', 'act_id', 'act-1']);
  });

  it('flags when it would replace an existing template with that title', async () => {
    mockLog.existing = { id: 't-9' };
    const out = await execStageEmailTemplate('act-1', 'u-1', { name: 'Brewery pitch', body: 'x' });
    expect(out.proposal.replaces_existing).toBe(true);
  });

  it('rejects a missing title or body with a readable message and stages nothing', async () => {
    await expect(execStageEmailTemplate('act-1', 'u-1', { name: '', body: 'x' })).rejects.toThrow(/title/);
    await expect(execStageEmailTemplate('act-1', 'u-1', { name: 'T', body: 42 })).rejects.toThrow(/empty/);
    expect(mockLog.stagedInserts).toHaveLength(0);
  });
});
