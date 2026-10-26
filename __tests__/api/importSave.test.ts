// __tests__/api/importSave.test.ts
// /api/import/save for venues. Regressions: a venue with no city or state was
// sent as null into NOT NULL columns and failed to save; duplicates were
// checked one ILIKE query per row (wildcards in names matched wrongly).

const mockInserts: Array<Record<string, unknown> | Record<string, unknown>[]> = [];
const mockExisting: Array<{ name: string; city: string }> = [];
let mockFailBatch = false;

jest.mock('../../lib/supabase', () => ({
  getServiceClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
    from: (table: string) => {
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = () => c;
      c.single = async () => ({ data: { act_id: 'act-1', role: 'band_admin' }, error: null });
      c.insert = (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        mockInserts.push(rows);
        if (Array.isArray(rows) && mockFailBatch) return Promise.resolve({ error: { message: 'batch failed' } });
        if (!Array.isArray(rows) && rows.name === 'Bad Row') return Promise.resolve({ error: { message: 'bad value' } });
        return Promise.resolve({ error: null });
      };
      c.then = (f: (v: unknown) => unknown) =>
        Promise.resolve({ data: table === 'venues' ? mockExisting : [], error: null }).then(f);
      return c;
    },
  }),
}));

import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../../pages/api/import/save';

async function save(venues: unknown[]) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json, end: jest.fn() });
  const req = {
    method: 'POST', headers: { authorization: 'Bearer t' }, body: { type: 'venues', data: { venues } },
  } as unknown as NextApiRequest;
  await handler(req, { status, json } as unknown as NextApiResponse);
  return { code: status.mock.calls[0][0] as number, body: json.mock.calls[0]?.[0] };
}

beforeEach(() => {
  mockInserts.length = 0;
  mockExisting.length = 0;
  mockFailBatch = false;
});

describe('POST /api/import/save — venues', () => {
  it('saves a venue with no city or state as blanks, not nulls', async () => {
    const { code, body } = await save([{ name: 'Gruene Hall', city: null, state: null, capacity: '1,200' }]);
    expect(code).toBe(200);
    expect(body).toMatchObject({ saved: 1, skipped: 0, errors: [] });
    expect(mockInserts[0]).toEqual([expect.objectContaining({
      act_id: 'act-1', name: 'Gruene Hall', city: '', state: '', capacity: 1200, source: 'import',
    })]);
  });

  it('skips venues the band already has and repeats within the file', async () => {
    mockExisting.push({ name: 'The Blue Door', city: 'Oklahoma City' });
    const { body } = await save([
      { name: 'the blue door', city: 'Oklahoma City' },
      { name: 'Cheatham Street', city: 'San Marcos', state: 'Texas' },
      { name: 'Cheatham Street', city: 'San Marcos' },
      { name: '' },
    ]);
    expect(body).toMatchObject({ saved: 1, skipped: 3 });
    expect(mockInserts[0]).toEqual([expect.objectContaining({ name: 'Cheatham Street', state: 'TX' })]);
  });

  it('saves the good rows and names the bad one when a batch fails', async () => {
    mockFailBatch = true;
    const { body } = await save([{ name: 'A', city: 'Austin' }, { name: 'Bad Row', city: 'Austin' }, { name: 'C', city: 'Austin' }]);
    expect(body).toMatchObject({ saved: 2, errors: ['Bad Row: bad value'] });
  });

  it('rejects a request with no venue list', async () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { type: 'venues' } } as unknown as NextApiRequest,
      { status, json } as unknown as NextApiResponse);
    expect(status).toHaveBeenCalledWith(400);
  });
});
