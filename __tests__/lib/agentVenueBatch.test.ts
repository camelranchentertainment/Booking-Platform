// __tests__/lib/agentVenueBatch.test.ts
//
// venue_batch: the agent stages several venue edits in one reply so the user
// approves them with one Confirm, instead of approve → "next" per venue.
jest.mock('../../lib/server/agentVenueActions', () => ({ buildVenueUpsertPayload: jest.fn() }));
jest.mock('../../lib/server/agentStage', () => ({ stageAction: jest.fn() }));

import { stageVenueBatch, normaliseLookupNames, VENUE_BATCH_CAP, MAX_LOOKUP_NAMES } from '../../lib/server/agentVenueBatch';
import { buildVenueUpsertPayload } from '../../lib/server/agentVenueActions';
import { stageAction } from '../../lib/server/agentStage';

const service = {} as never;
const build = buildVenueUpsertPayload as jest.Mock;
const stage = stageAction as jest.Mock;

const update = (id: string, name: string) => ({ mode: 'update', venue_id: id, venue_name: name, changes: { email: `${id}@x.com` }, previous: { email: null } });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  build.mockImplementation(async (_s: unknown, _a: string, raw: { venue_id: string; name?: string }) => update(raw.venue_id, raw.name ?? raw.venue_id));
  let n = 0;
  stage.mockImplementation(async (_s: unknown, _a: string, _u: string, type: string, payload: unknown) => ({
    action_type: type, staged_action_id: `staged-${++n}`, proposal: payload, requires_confirmation: true,
  }));
});

describe('stageVenueBatch', () => {
  it('stages every venue as its own venue_upsert row, in order, scoped to the band', async () => {
    const out = await stageVenueBatch(service, 'act-1', 'user-1', [{ venue_id: 'a', name: 'Aggie Lounge' }, { venue_id: 'b', name: 'Wire Road' }]);
    expect(out.errors).toEqual([]);
    expect(out.overflow).toBe(0);
    expect(out.staged.map(s => [s.kind, s.staged_action_id, s.proposal.venue_name])).toEqual([
      ['venue_upsert', 'staged-1', 'Aggie Lounge'],
      ['venue_upsert', 'staged-2', 'Wire Road'],
    ]);
    expect(build).toHaveBeenCalledWith(service, 'act-1', { venue_id: 'a', name: 'Aggie Lounge' });
    expect(stage).toHaveBeenCalledWith(service, 'act-1', 'user-1', 'venue_upsert', expect.objectContaining({ venue_id: 'a' }));
  });

  it('keeps staging the rest when one venue fails validation', async () => {
    build.mockImplementationOnce(async () => { throw new Error("That venue wasn't found for this band."); });
    const out = await stageVenueBatch(service, 'act-1', 'user-1', [{ venue_id: 'bad', name: 'Ghost Bar' }, { venue_id: 'b', name: 'Wire Road' }]);
    expect(out.staged).toHaveLength(1);
    expect(out.errors).toEqual(["Ghost Bar: That venue wasn't found for this band."]);
  });

  it('refuses the same venue twice in one batch', async () => {
    const out = await stageVenueBatch(service, 'act-1', 'user-1', [{ venue_id: 'a', name: 'Aggie' }, { venue_id: 'a', name: 'Aggie' }]);
    expect(out.staged).toHaveLength(1);
    expect(out.errors[0]).toMatch(/listed twice/);
    expect(stage).toHaveBeenCalledTimes(1);
  });

  it(`stages at most ${VENUE_BATCH_CAP} and reports the overflow`, async () => {
    const list = Array.from({ length: VENUE_BATCH_CAP + 3 }, (_, i) => ({ venue_id: `v${i}` }));
    const out = await stageVenueBatch(service, 'act-1', 'user-1', list);
    expect(out.staged).toHaveLength(VENUE_BATCH_CAP);
    expect(out.overflow).toBe(3);
  });

  it('stages nothing for a missing or empty list', async () => {
    for (const bad of [undefined, 'Aggie', []]) {
      const out = await stageVenueBatch(service, 'act-1', 'user-1', bad);
      expect(out.staged).toEqual([]);
      expect(out.errors).toEqual(['No venues were listed to update.']);
    }
    expect(stage).not.toHaveBeenCalled();
  });
});

describe('normaliseLookupNames', () => {
  it('trims, drops blanks and non-strings, de-duplicates case-insensitively', () => {
    expect(normaliseLookupNames([' Aggie Lounge ', 'aggie lounge', '', 4, 'Wire Road'])).toEqual(['Aggie Lounge', 'Wire Road']);
  });
  it(`caps at ${MAX_LOOKUP_NAMES} names and ignores non-arrays`, () => {
    expect(normaliseLookupNames(Array.from({ length: 20 }, (_, i) => `V${i}`))).toHaveLength(MAX_LOOKUP_NAMES);
    expect(normaliseLookupNames('Aggie')).toEqual([]);
  });
});
