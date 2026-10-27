import { buildAgentGreeting, fetchAgentGreetingStats } from '../../lib/agent/agentGreeting';

describe('buildAgentGreeting', () => {
  const base = { displayName: 'Scott McCumber', actName: 'The Band', toursCount: 2, targetsCount: 17 };

  it('greets by time of day with the first name', () => {
    expect(buildAgentGreeting({ ...base, hour: 8 })).toMatch(/^Good morning Scott!/);
    expect(buildAgentGreeting({ ...base, hour: 13 })).toMatch(/^Good afternoon Scott!/);
    expect(buildAgentGreeting({ ...base, hour: 19 })).toMatch(/^Good evening Scott!/);
  });

  it('states the pipeline with correct plurals', () => {
    expect(buildAgentGreeting({ ...base, hour: 9 })).toContain('2 active tours and 17 targets');
    expect(buildAgentGreeting({ ...base, hour: 9, toursCount: 1, targetsCount: 1 })).toContain('1 active tour and 1 target in');
    expect(buildAgentGreeting({ ...base, hour: 9, toursCount: 0, targetsCount: 0 })).toContain('0 active tours and 0 targets');
  });

  it('falls back to the band name, then "there"', () => {
    expect(buildAgentGreeting({ ...base, hour: 9, displayName: null })).toMatch(/^Good morning The Band!/);
    expect(buildAgentGreeting({ ...base, hour: 9, displayName: '  ', actName: null })).toMatch(/^Good morning there!/);
  });
});

/** Minimal chainable stand-in for the Supabase query builder. */
function fakeClient(results: Record<string, unknown[]>) {
  const calls: Array<{ table: string; ops: unknown[][] }> = [];
  return {
    calls,
    from(table: string) {
      const call = { table, ops: [] as unknown[][] };
      calls.push(call);
      const queue = results[table];
      const builder: any = {
        then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
          return Promise.resolve(queue.shift()).then(resolve, reject);
        },
      };
      for (const op of ['select', 'eq', 'in', 'neq']) {
        builder[op] = (...args: unknown[]) => { call.ops.push([op, ...args]); return builder; };
      }
      return builder;
    },
  };
}

describe('fetchAgentGreetingStats', () => {
  it('counts active tours and targets across non-cancelled tours', async () => {
    const client = fakeClient({
      tours: [{ count: 2, error: null }, { data: [{ id: 't1' }, { id: 't2' }], error: null }],
      tour_venues: [{ count: 17, error: null }],
    });
    await expect(fetchAgentGreetingStats(client, 'act-1')).resolves.toEqual({ toursCount: 2, targetsCount: 17 });
    const tv = client.calls.find(c => c.table === 'tour_venues')!;
    expect(tv.ops).toContainEqual(['in', 'tour_id', ['t1', 't2']]);
    expect(tv.ops).toContainEqual(['eq', 'status', 'target']);
  });

  it('skips the target query when the band has no tours', async () => {
    const client = fakeClient({
      tours: [{ count: 0, error: null }, { data: [], error: null }],
      tour_venues: [],
    });
    await expect(fetchAgentGreetingStats(client, 'act-1')).resolves.toEqual({ toursCount: 0, targetsCount: 0 });
    expect(client.calls.some(c => c.table === 'tour_venues')).toBe(false);
  });

  it('throws when a query fails', async () => {
    const client = fakeClient({
      tours: [{ count: null, error: { message: 'boom' } }, { data: [], error: null }],
      tour_venues: [],
    });
    await expect(fetchAgentGreetingStats(client, 'act-1')).rejects.toThrow('tour count failed: boom');
  });
});
