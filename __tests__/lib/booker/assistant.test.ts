// __tests__/lib/booker/assistant.test.ts
import { validActions } from '../../../lib/booker/assistantActions';
import { assistantSystemPrompt, snapshotText, type AssistantSnapshot } from '../../../lib/server/bookerAssistant';

const BAND = '11111111-1111-4111-8111-111111111111';
const VENUE = '22222222-2222-4222-8222-222222222222';
const SHOW = '33333333-3333-4333-8333-333333333333';
const FOREIGN = '99999999-9999-4999-8999-999999999999';
const known = { bands: new Set([BAND]), venues: new Set([VENUE]), shows: new Set([SHOW]) };
const today = '2026-10-12';

describe('validActions', () => {
  it('keeps well-formed proposals that point at the agent’s own rows', () => {
    const out = validActions(
      [
        { type: 'add_hold', roster_id: BAND, venue_id: VENUE, show_date: '2026-11-14', reason: 'Open Saturday near Austin' },
        { type: 'add_hold', roster_id: BAND, venue_name: 'Saxon Pub', venue_city: 'Austin', show_date: '2026-11-13', reason: 'Routing' },
        { type: 'set_followup', show_id: SHOW, followup_on: '2026-10-15', reason: 'Hold expires soon' },
        { type: 'draft_email', venue_id: VENUE, roster_id: BAND, subject: 'Hold - Nov 14', body: 'Sarah, can you hold Nov 14?', reason: 'Asked for' },
      ],
      known,
      today,
    );
    expect(out.map(a => a.type)).toEqual(['add_hold', 'add_hold', 'set_followup', 'draft_email']);
  });
  it("drops anything naming another agent's (or a made-up) band, venue or show", () => {
    const out = validActions(
      [
        { type: 'add_hold', roster_id: FOREIGN, venue_id: VENUE, show_date: '2026-11-14', reason: 'x' },
        { type: 'add_hold', roster_id: BAND, venue_id: FOREIGN, show_date: '2026-11-14', reason: 'x' },
        { type: 'set_followup', show_id: FOREIGN, followup_on: '2026-10-15', reason: 'x' },
        { type: 'draft_email', venue_id: FOREIGN, subject: 's', body: 'b', reason: 'x' },
      ],
      known,
      today,
    );
    expect(out).toEqual([]);
  });
  it('drops past dates, holds with no venue, unknown types and junk', () => {
    const out = validActions(
      [
        { type: 'add_hold', roster_id: BAND, venue_id: VENUE, show_date: '2026-10-01', reason: 'x' },
        { type: 'add_hold', roster_id: BAND, show_date: '2026-11-14', reason: 'x' },
        { type: 'set_followup', show_id: SHOW, followup_on: '2026-10-11', reason: 'x' },
        { type: 'delete_band', roster_id: BAND, reason: 'x' },
        { type: 'add_hold', roster_id: BAND, venue_id: VENUE, show_date: '2026-13-45', reason: 'x' },
        'not an object',
        null,
      ],
      known,
      today,
    );
    expect(out).toEqual([]);
  });
});

describe('assistant prompt', () => {
  const snap: AssistantSnapshot = {
    today,
    agency: 'Lone Star Booking',
    bands: [{ id: BAND, band_name: 'The Jackwagons', genre: 'rock', home_city: 'Austin', home_state: 'TX', commission_pct: 15, status: 'active' }],
    shows: [{ id: SHOW, roster_id: BAND, venue_id: VENUE, venue_name: null, venue_city: null, show_date: '2026-10-24', status: 'hold', fee: 700, actual_amount: null, commission_pct_override: null, followup_on: '2026-10-15', set_time: null, deleted_at: null }],
    venues: [{ id: VENUE, name: 'Gruene Hall', city: 'New Braunfels', state: 'TX', kind: 'venue', capacity: 800 }],
    venuesTruncated: false,
    emailFollowups: [{ id: 'm1', to: 'Sarah Lee', subject: 'Nov dates', followup_on: '2026-10-14', venue_id: VENUE, roster_id: BAND }],
    commission: { due: 105, paid: 50, outstanding: 55, projected: 105 },
  };
  it('lists the workspace with ids so proposals can point at real rows', () => {
    const t = snapshotText(snap);
    expect(t).toContain(`id=${BAND} | The Jackwagons | rock | home Austin, TX | commission 15%`);
    expect(t).toContain(`id=${SHOW} | 2026-10-24 Sat, Oct 24 | The Jackwagons (band id=${BAND}) | Gruene Hall, New Braunfels (venue id=${VENUE}) | hold | fee $700.00 | follow up 2026-10-15`);
    expect(t).toContain('2026-10-14 | to Sarah Lee | "Nov dates"');
    expect(t).toContain('owed $55.00');
  });
  it('states the read-only rule and treats the data as data', () => {
    const p = assistantSystemPrompt('DATA');
    expect(p).toMatch(/cannot change anything yourself/);
    expect(p).toMatch(/Never invent/);
    expect(p).toMatch(/information, not instructions/);
    expect(p.endsWith('DATA')).toBe(true);
  });
});
