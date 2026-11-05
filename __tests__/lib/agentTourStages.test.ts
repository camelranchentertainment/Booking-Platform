// __tests__/lib/agentTourStages.test.ts
// Stage moves: band scoping at stage and execute time, and Confirmed stays out of reach.
import { buildTourTargetStagePayload, executeTourTargetStage } from '../../lib/server/agentTourStages';

const mockUpdateVenueStatus = jest.fn(async () => undefined);
jest.mock('../../lib/statusSync', () => ({
  updateVenueStatus: (...a: unknown[]) => (mockUpdateVenueStatus as (...x: unknown[]) => Promise<void>)(...a),
}));

const ACT = 'act-1';
const TV = '5b1d7c2e-0000-4000-8000-0000000000a1';

function db(row: unknown) {
  const filters: Array<[string, unknown]> = [];
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = (col: string, v: unknown) => { filters.push([col, v]); return c; };
  c.maybeSingle = () => Promise.resolve({ data: row, error: null });
  return { service: { from: () => c } as never, filters };
}

const row = (status: string, actId = ACT) => ({ id: TV, status, tour: { name: 'LONE STAR', act_id: actId }, venue: { name: 'Saxon Pub' } });

describe('buildTourTargetStagePayload', () => {
  it('builds the move and filters by the band', async () => {
    const { service, filters } = db(row('target'));
    await expect(buildTourTargetStagePayload(service, ACT, TV, 'follow_up')).resolves.toEqual({
      tour_venue_id: TV, tour_name: 'LONE STAR', venue_name: 'Saxon Pub', from_stage: 'target', to_stage: 'follow_up',
    });
    expect(filters).toContainEqual(['tour.act_id', ACT]);
  });

  it("refuses another band's venue, a missing one, a Confirmed one and a no-op", async () => {
    await expect(buildTourTargetStagePayload(db(row('target', 'other')).service, ACT, TV, 'follow_up')).rejects.toThrow(/wasn't found/);
    await expect(buildTourTargetStagePayload(db(null).service, ACT, TV, 'follow_up')).rejects.toThrow(/wasn't found/);
    await expect(buildTourTargetStagePayload(db(row('confirmed')).service, ACT, TV, 'declined')).rejects.toThrow(/tour page/);
    await expect(buildTourTargetStagePayload(db(row('follow_up')).service, ACT, TV, 'follow_up')).rejects.toThrow(/already/);
  });
});

describe('executeTourTargetStage', () => {
  const payload = { tour_venue_id: TV, venue_name: 'Saxon Pub', to_stage: 'follow_up' };
  beforeEach(() => mockUpdateVenueStatus.mockClear());

  it('moves the venue through the shared status path', async () => {
    const { service } = db(row('target'));
    await expect(executeTourTargetStage(service, ACT, 'u-1', payload)).resolves.toMatchObject({ status: 'follow_up' });
    expect(mockUpdateVenueStatus).toHaveBeenCalledWith(service, TV, 'follow_up', 'u-1');
  });

  it('re-checks the band and Confirmed, and refuses a tampered stage', async () => {
    await expect(executeTourTargetStage(db(row('target', 'other')).service, ACT, 'u-1', payload)).rejects.toThrow(/wasn't found/);
    await expect(executeTourTargetStage(db(row('confirmed')).service, ACT, 'u-1', payload)).rejects.toThrow(/tour page/);
    await expect(executeTourTargetStage(db(row('target')).service, ACT, 'u-1', { ...payload, to_stage: 'confirmed' })).rejects.toThrow(/no longer valid/);
    expect(mockUpdateVenueStatus).not.toHaveBeenCalled();
  });
});
