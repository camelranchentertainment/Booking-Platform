// __tests__/lib/emailTemplates.test.ts
import { saveTemplate, findTemplateByName, escapeLike, TemplateExistsError, templateSaveSchema } from '../../lib/server/emailTemplates';
import type { SupabaseClient } from '@supabase/supabase-js';

const ACT = 'act-1';

function fakeService(opts: { existing?: { id: string } | null; lookupError?: boolean; writeError?: boolean } = {}) {
  const log = { filters: [] as Array<[string, string, unknown]>, inserts: [] as unknown[], updates: [] as unknown[] };
  const from = jest.fn(() => {
    const c: any = {};
    c.select = () => c;
    for (const m of ['eq', 'ilike']) c[m] = (col: string, v: unknown) => { log.filters.push([m, col, v]); return c; };
    c.maybeSingle = () => Promise.resolve(opts.lookupError
      ? { data: null, error: { message: 'x' } }
      : { data: opts.existing ?? null, error: null });
    c.insert = (row: unknown) => { log.inserts.push(row); return c; };
    c.update = (row: unknown) => { log.updates.push(row); return c; };
    c.single = () => Promise.resolve(opts.writeError
      ? { data: null, error: { message: 'x' } }
      : { data: { id: opts.existing?.id ?? 't-new', name: 'T', subject: 'S', body: 'B', updated_at: 'now' }, error: null });
    return c;
  });
  return { svc: { from } as unknown as SupabaseClient, log };
}

const input = { name: 'Brewery pitch', subject: 'Hi', body: 'Hello [Venue Name]' };

describe('saveTemplate', () => {
  it('inserts a new template for the band', async () => {
    const { svc, log } = fakeService();
    const out = await saveTemplate(svc, ACT, 'u-1', input);
    expect(out.replaced).toBe(false);
    expect(log.inserts[0]).toMatchObject({ act_id: ACT, user_id: 'u-1', ...input });
    expect(log.filters).toContainEqual(['eq', 'act_id', ACT]);
  });

  it('refuses a taken title unless overwrite is set', async () => {
    const { svc, log } = fakeService({ existing: { id: 't-9' } });
    await expect(saveTemplate(svc, ACT, 'u-1', input)).rejects.toBeInstanceOf(TemplateExistsError);
    expect(log.updates).toHaveLength(0);
  });

  it('replaces the same-title template within the band when overwrite is set', async () => {
    const { svc, log } = fakeService({ existing: { id: 't-9' } });
    const out = await saveTemplate(svc, ACT, 'u-1', input, { overwrite: true });
    expect(out.replaced).toBe(true);
    expect(log.updates[0]).toMatchObject(input);
    expect(log.filters).toContainEqual(['eq', 'id', 't-9']);
  });

  it('surfaces lookup and write failures as 500s', async () => {
    await expect(saveTemplate(fakeService({ lookupError: true }).svc, ACT, 'u', input)).rejects.toMatchObject({ statusCode: 500 });
    await expect(saveTemplate(fakeService({ writeError: true }).svc, ACT, 'u', input)).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe('findTemplateByName / escapeLike', () => {
  it('matches titles literally, case-insensitively, within the band', async () => {
    const { svc, log } = fakeService();
    await findTemplateByName(svc, ACT, '  100% Pitch_v2 ');
    expect(log.filters).toContainEqual(['ilike', 'name', '100\\% Pitch\\_v2']);
    expect(log.filters).toContainEqual(['eq', 'act_id', ACT]);
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });
});

describe('templateSaveSchema', () => {
  it('requires a title and body and trims them', () => {
    expect(templateSaveSchema.safeParse({ name: ' ', body: 'x' }).success).toBe(false);
    expect(templateSaveSchema.safeParse({ name: 'T', body: '  ' }).success).toBe(false);
    expect(templateSaveSchema.parse({ name: ' T ', body: ' B ' })).toEqual({ name: 'T', subject: '', body: 'B' });
  });
});
