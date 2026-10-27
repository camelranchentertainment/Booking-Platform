// __tests__/lib/agentStagedSummaries.test.ts
// Display fields /api/agent adds to approval cards for the phone app.
import { stagedItemCaution, withStagedSummaries } from '../../lib/agentStagingHelpers';

describe('withStagedSummaries', () => {
  it('adds a summary and caution to every staged item', () => {
    const action = {
      type: 'stage_items',
      errors: [],
      overflow: 0,
      staged: [
        { kind: 'show', staged_action_id: 'a', proposal: { show_date: '2026-11-20', venue_name: 'Alamo Drafthouse', status: 'confirmed' } },
        { kind: 'email_send', staged_action_id: 'b', proposal: { recipient: 'tb@venue.com', subject: 'Booking' } },
      ],
    };
    const out = withStagedSummaries(action);
    expect(out.staged[0]).toMatchObject({
      staged_action_id: 'a',
      summary: '2026-11-20 — Alamo Drafthouse — → confirmed',
      caution: null,
    });
    expect(out.staged[1]).toMatchObject({
      summary: 'Email → tb@venue.com: Booking',
      caution: 'Confirming sends this email immediately to a real recipient.',
    });
    // Original fields are kept; nothing else changes.
    expect(out.errors).toEqual([]);
    expect(out.staged[0].proposal).toEqual(action.staged[0].proposal);
  });

  it('copes with a missing proposal', () => {
    const out = withStagedSummaries({ type: 'stage_items', staged: [{ kind: 'tour_create' }] });
    expect(out.staged[0]).toMatchObject({ summary: expect.any(String), caution: null });
  });

  it('leaves non-card actions and empty values untouched', () => {
    const outreach = { type: 'tour_outreach', venues: [] };
    expect(withStagedSummaries(outreach)).toBe(outreach);
    expect(withStagedSummaries(null)).toBeNull();
    expect(withStagedSummaries(undefined)).toBeUndefined();
  });
});

describe('stagedItemCaution', () => {
  it('warns on effects outside the band records only', () => {
    expect(stagedItemCaution('record_delete', {})).toMatch(/can't be undone/);
    expect(stagedItemCaution('member_invite', { email: 'x@y.com' })).toMatch(/x@y\.com/);
    expect(stagedItemCaution('email_template_upsert', { replaces_existing: true })).toMatch(/overwrites/);
    expect(stagedItemCaution('email_template_upsert', { replaces_existing: false })).toBeNull();
    expect(stagedItemCaution('venue_upsert', {})).toBeNull();
  });
});
