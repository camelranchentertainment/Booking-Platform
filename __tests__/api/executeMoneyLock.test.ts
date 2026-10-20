// __tests__/api/executeMoneyLock.test.ts
// The execute route refuses agent money actions even if one was staged (agentPolicy backstop).

const mockState = {
  role: 'band_admin',
  staged: null as Record<string, unknown> | null,
  existingTemplate: null as { id: string } | null,
  templateInserts: [] as Array<Record<string, unknown>>,
  templateUpdates: [] as Array<Record<string, unknown>>,
  stagedUpdates: [] as Array<Record<string, unknown>>,
  filters: [] as Array<[string, string, string, unknown]>,
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u-1' } }, error: null }) },
    from: (table: string) => {
      const c: any = {};
      c.select = () => c;
      for (const m of ['eq', 'ilike']) c[m] = (col: string, v: unknown) => { mockState.filters.push([table, m, col, v]); return c; };
      c.insert = (row: Record<string, unknown>) => { if (table === 'email_templates') mockState.templateInserts.push(row); return c; };
      c.update = (row: Record<string, unknown>) => {
        if (table === 'email_templates') mockState.templateUpdates.push(row);
        if (table === 'ai_staged_actions') mockState.stagedUpdates.push(row);
        return c;
      };
      c.maybeSingle = () => Promise.resolve({
        data: table === 'ai_staged_actions' ? mockState.staged : table === 'email_templates' ? mockState.existingTemplate : null,
        error: null,
      });
      c.single = () => Promise.resolve(table === 'profiles'
        ? { data: { act_id: 'act-1', role: mockState.role }, error: null }
        : { data: { id: mockState.existingTemplate?.id ?? 't-new', name: 'Brewery pitch', subject: 'Hi', body: 'B', updated_at: 'now' }, error: null });
      c.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(f);
      return c;
    },
  }),
}));
jest.mock('../../lib/emailSend', () => ({ sendActEmail: jest.fn() }));
jest.mock('../../lib/calendarSync', () => ({ syncBookingToGoogleCalendar: jest.fn() }));

import handler from '../../pages/api/help/actions/execute';
import type { NextApiRequest, NextApiResponse } from 'next';

function staged(payload: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    id: 'staged-1', act_id: 'act-1', status: 'pending', action_type: 'email_template_upsert', ...overrides,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(), payload,
  };
}

async function approve() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const req = { method: 'POST', headers: { authorization: 'Bearer t' }, body: { staged_action_id: 'staged-1' } } as unknown as NextApiRequest;
  await handler(req, { status, json } as unknown as NextApiResponse);
  return { status, body: json.mock.calls[0]?.[0] };
}

beforeEach(() => {
  Object.assign(mockState, {
    role: 'band_admin', staged: null, existingTemplate: null,
    templateInserts: [], templateUpdates: [], stagedUpdates: [], filters: [],
  });
});

describe('execute — money is locked for agent cards', () => {
  it.each(['payment_settle', 'expense_insert', 'expense_update', 'expense_archive'])('refuses %s and cancels the card', async (actionType) => {
    mockState.staged = staged({ booking_id: 'b-1', agreed_amount: 800 }, { action_type: actionType });
    const { status, body } = await approve();
    expect(status).toHaveBeenCalledWith(500);
    expect(body.error).toMatch(/can't change money/);
    expect(mockState.stagedUpdates).toContainEqual({ status: 'cancelled' });
    expect(mockState.stagedUpdates).not.toContainEqual(expect.objectContaining({ status: 'executed' }));
  });
});
