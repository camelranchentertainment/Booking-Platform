// __tests__/lib/booker/assistant.test.ts
// The Booking Agent assistant: what it may propose, what it may never touch,
// and how an approved proposal becomes exactly one write.
import { normalizeProposals, validActions } from '../../../lib/booker/assistantActions';
import { buildWrite, describeAction, type WorkspaceRows } from '../../../lib/booker/assistantApply';
import { assistantSystemPrompt, snapshotText, type AssistantSnapshot } from '../../../lib/server/bookerAssistant';
import type { BookerContact, BookerShow, BookerVenue, RosterBand } from '../../../lib/booker/types';

const BAND = '11111111-1111-4111-8111-111111111111';
const VENUE = '22222222-2222-4222-8222-222222222222';
const SHOW = '33333333-3333-4333-8333-333333333333';
const CONTACT = '44444444-4444-4444-8444-444444444444';
const FOREIGN = '99999999-9999-4999-8999-999999999999';
const known = { bands: new Set([BAND]), venues: new Set([VENUE]), shows: new Set([SHOW]), contacts: new Set([CONTACT]) };
const today = '2026-10-12';
const ts = { created_at: '', updated_at: '', deleted_at: null };

const band: RosterBand = {
  id: BAND, booker_id: 'k', band_name: 'The Jackwagons', genre: 'rock', home_city: 'Austin', home_state: 'TX', contact_name: null, contact_email: null,
  contact_phone: null, commission_pct: 15, repeat_commission_pct: null, color: '#e8823a', notes: 'Prefers Saturdays', status: 'active', ...ts,
};
const venue: BookerVenue = {
  id: VENUE, booker_id: 'k', name: 'Gruene Hall', address: null, city: 'New Braunfels', state: 'TX', postal_code: null, capacity: 800,
  website: 'https://gruenehall.com', notes: null, kind: 'venue', place_id: null, email: 'booking@gruenehall.com', phone: null, last_scanned_at: null, tags: [], ...ts,
};
const show: BookerShow = {
  id: SHOW, booker_id: 'k', roster_id: BAND, venue_id: VENUE, venue_name: null, venue_city: null, show_date: '2026-10-24', load_in_time: '17:00:00',
  door_time: null, set_time: '21:00:00', set_length_min: 90, status: 'hold', deal_type: 'guarantee', fee: 700, actual_amount: 650,
  commission_pct_override: 12, deal_notes: 'Plus meal', internal_notes: 'Ask about green room', followup_on: '2026-10-15',
  hold_rank: 1, hold_expires_on: '2026-10-20', answer_by: null, challenge_note: null, deposit_amount: null, deposit_due_on: null, deposit_received_on: null, ...ts,
};
const contact: BookerContact = {
  id: CONTACT, booker_id: 'k', venue_id: VENUE, name: 'Sarah Lee', title: 'Talent buyer', email: 'sarah@gruenehall.com', phone: null, notes: null,
  share_with_bands: true, source: 'manual', ...ts,
};
const rows: WorkspaceRows = { bands: [band], venues: [venue], shows: [show], contacts: [contact] };

describe('validActions', () => {
  it('keeps well-formed proposals of every kind that point at the agent’s own rows', () => {
    const out = validActions(
      [
        { type: 'add_show', roster_id: BAND, venue_id: VENUE, show_date: '2026-11-14', status: 'confirmed', fee: 900, reason: 'Booked by phone' },
        { type: 'update_show', show_id: SHOW, changes: { status: 'confirmed' }, reason: 'Venue said yes' },
        { type: 'set_followup', show_id: SHOW, followup_on: '2026-10-15', reason: 'Hold expires soon' },
        { type: 'add_band', band_name: 'El Dolor', home_city: 'Greeley', reason: 'New signing' },
        { type: 'update_band', roster_id: BAND, changes: { status: 'inactive' }, reason: 'On break' },
        { type: 'add_venue', name: 'Saxon Pub', city: 'Austin', state: 'TX', reason: 'Found on the web' },
        { type: 'update_venue', venue_id: VENUE, changes: { email: 'talent@gruenehall.com' }, reason: 'Found on their site' },
        { type: 'add_contact', venue_id: VENUE, name: 'Mike Ray', title: 'Owner', reason: 'Owner books Sundays' },
        { type: 'update_contact', contact_id: CONTACT, changes: { phone: '830-555-0100' }, reason: 'New number' },
        { type: 'draft_email', venue_id: VENUE, roster_id: BAND, subject: 'Hold - Nov 14', body: 'Sarah, can you hold Nov 14?', reason: 'Asked for' },
      ],
      known,
      today,
    );
    expect(out.map(a => a.type)).toEqual(['add_show', 'update_show', 'set_followup', 'add_band', 'update_band', 'add_venue', 'update_venue', 'add_contact', 'update_contact', 'draft_email']);
  });

  it('turns a legacy add_hold into an add_show hold', () => {
    const [a] = validActions([{ type: 'add_hold', roster_id: BAND, venue_name: 'Saxon Pub', venue_city: 'Austin', show_date: '2026-11-13', reason: 'Routing' }], known, today);
    expect(a).toMatchObject({ type: 'add_show', status: 'hold', venue_name: 'Saxon Pub' });
  });

  it("drops anything naming another agent's (or a made-up) band, venue, show or contact", () => {
    const out = validActions(
      [
        { type: 'add_show', roster_id: FOREIGN, venue_id: VENUE, show_date: '2026-11-14', reason: 'x' },
        { type: 'add_show', roster_id: BAND, venue_id: FOREIGN, show_date: '2026-11-14', reason: 'x' },
        { type: 'update_show', show_id: FOREIGN, changes: { status: 'cancelled' }, reason: 'x' },
        { type: 'update_show', show_id: SHOW, changes: { venue_id: FOREIGN }, reason: 'x' },
        { type: 'set_followup', show_id: FOREIGN, followup_on: '2026-10-15', reason: 'x' },
        { type: 'update_band', roster_id: FOREIGN, changes: { genre: 'x' }, reason: 'x' },
        { type: 'update_venue', venue_id: FOREIGN, changes: { name: 'x' }, reason: 'x' },
        { type: 'add_contact', venue_id: FOREIGN, name: 'x', reason: 'x' },
        { type: 'update_contact', contact_id: FOREIGN, changes: { name: 'x' }, reason: 'x' },
        { type: 'draft_email', venue_id: FOREIGN, subject: 's', body: 'b', reason: 'x' },
      ],
      known,
      today,
    );
    expect(out).toEqual([]);
  });

  it('never accepts money or deletion, whatever the model sends', () => {
    const out = validActions(
      [
        { type: 'record_payment', show_id: SHOW, amount: 100, reason: 'x' },
        { type: 'delete_band', roster_id: BAND, reason: 'x' },
        { type: 'archive_venue', venue_id: VENUE, reason: 'x' },
        { type: 'update_show', show_id: SHOW, changes: { actual_amount: 900 }, reason: 'x' },
        { type: 'update_show', show_id: SHOW, changes: { commission_pct_override: 5 }, reason: 'x' },
        { type: 'update_band', roster_id: BAND, changes: { commission_pct: 5 }, reason: 'x' },
        { type: 'update_band', roster_id: BAND, changes: { repeat_commission_pct: 5 }, reason: 'x' },
        { type: 'update_show', show_id: SHOW, changes: { deposit_amount: 200, deposit_due_on: '2026-10-30', deposit_received_on: '2026-10-12' }, reason: 'x' },
        { type: 'update_contact', contact_id: CONTACT, changes: { share_with_bands: true }, reason: 'x' },
      ],
      known,
      today,
    );
    // Unknown types are dropped; money/sharing fields are stripped (zod drops unknown keys),
    // leaving updates with no real change, which are dropped too.
    expect(out).toEqual([]);
  });

  it('drops past dates, shows with no venue, empty updates and junk', () => {
    const out = validActions(
      [
        { type: 'add_show', roster_id: BAND, venue_id: VENUE, show_date: '2026-10-01', reason: 'x' },
        { type: 'add_show', roster_id: BAND, show_date: '2026-11-14', reason: 'x' },
        { type: 'add_show', roster_id: BAND, venue_id: VENUE, show_date: '2026-11-14', status: 'played', reason: 'x' },
        { type: 'set_followup', show_id: SHOW, followup_on: '2026-10-11', reason: 'x' },
        { type: 'update_show', show_id: SHOW, changes: {}, reason: 'x' },
        { type: 'add_show', roster_id: BAND, venue_id: VENUE, show_date: '2026-13-45', reason: 'x' },
        'not an object',
        null,
      ],
      known,
      today,
    );
    expect(out).toEqual([]);
  });
});

describe('normalizeProposals', () => {
  it('moves top-level update fields into changes but never lets a blank wipe data', () => {
    const [p] = normalizeProposals([{ type: 'update_venue', venue_id: VENUE, email: 'talent@gruenehall.com', phone: null, notes: null, reason: 'Found it' }]);
    expect(p).toEqual({ type: 'update_venue', venue_id: VENUE, reason: 'Found it', changes: { email: 'talent@gruenehall.com' } });
  });
  it('keeps explicit clears inside changes, and lets update_show move to a new venue', () => {
    const [a, b] = normalizeProposals([
      { type: 'update_show', show_id: SHOW, changes: { fee: null }, reason: 'x' },
      { type: 'update_show', show_id: SHOW, venue_id: VENUE, reason: 'x' },
    ]);
    expect(a).toMatchObject({ changes: { fee: null } });
    expect(b).toMatchObject({ show_id: SHOW, changes: { venue_id: VENUE } });
  });
  it('leaves adds and junk alone', () => {
    const add = { type: 'add_venue', name: 'Saxon Pub', reason: 'x' };
    expect(normalizeProposals([add, 'junk', null])).toEqual([add, 'junk', null]);
  });
});

describe('buildWrite', () => {
  it('creates a confirmed show with deal terms and notes where it came from', () => {
    const r = buildWrite({ type: 'add_show', roster_id: BAND, venue_id: VENUE, show_date: '2026-11-14', status: 'confirmed', fee: 900, set_time: '21:30', reason: 'Booked by phone' }, rows);
    expect(r).toMatchObject({ ok: true, write: { op: 'createShow', input: { status: 'confirmed', fee: 900, set_time: '21:30', venue_id: VENUE, venue_name: null } } });
    if (r.ok && r.write.op === 'createShow') expect(r.write.input.internal_notes).toContain('Booked by phone');
  });

  it('updates a show without touching the amount received or commission override', () => {
    const r = buildWrite({ type: 'update_show', show_id: SHOW, changes: { status: 'played', fee: 750 }, reason: 'Played Saturday' }, rows);
    expect(r).toMatchObject({
      ok: true,
      write: { op: 'updateShow', id: SHOW, input: { status: 'played', fee: 750, actual_amount: 650, commission_pct_override: 12, set_time: '21:00', deal_notes: 'Plus meal' } },
    });
  });

  it('keeps the deposit as it was when the assistant updates a show', () => {
    const withDeposit: WorkspaceRows = { ...rows, shows: [{ ...show, deposit_amount: 200, deposit_due_on: '2026-10-18', deposit_received_on: '2026-10-17' }] };
    const r = buildWrite({ type: 'update_show', show_id: SHOW, changes: { status: 'confirmed' }, reason: 'Venue said yes' }, withDeposit);
    expect(r).toMatchObject({ ok: true, write: { input: { deposit_amount: 200, deposit_due_on: '2026-10-18', deposit_received_on: '2026-10-17' } } });
  });

  it('switches a show from a saved venue to a typed one cleanly', () => {
    const r = buildWrite({ type: 'update_show', show_id: SHOW, changes: { venue_name: 'Saxon Pub', venue_city: 'Austin' }, reason: 'Moved' }, rows);
    expect(r).toMatchObject({ ok: true, write: { input: { venue_id: null, venue_name: 'Saxon Pub', venue_city: 'Austin' } } });
  });

  it('cancels a show as a status change', () => {
    const r = buildWrite({ type: 'update_show', show_id: SHOW, changes: { status: 'cancelled' }, reason: 'Venue closed' }, rows);
    expect(r).toMatchObject({ ok: true, write: { op: 'updateShow', input: { status: 'cancelled' } } });
  });

  it('adds a band with a palette colour and no commission rate', () => {
    const r = buildWrite({ type: 'add_band', band_name: 'El Dolor', home_city: 'Greeley', home_state: 'CO', reason: 'New signing' }, rows);
    expect(r).toMatchObject({ ok: true, write: { op: 'createBand', input: { band_name: 'El Dolor', commission_pct: null, status: 'active' } } });
    if (r.ok && r.write.op === 'createBand') expect(r.write.input.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("keeps a band's commission rate when updating it", () => {
    const r = buildWrite({ type: 'update_band', roster_id: BAND, changes: { genre: 'red dirt' }, reason: 'x' }, rows);
    expect(r).toMatchObject({ ok: true, write: { op: 'updateBand', input: { genre: 'red dirt', commission_pct: 15, notes: 'Prefers Saturdays' } } });
  });

  it('adds and updates venues', () => {
    expect(buildWrite({ type: 'add_venue', name: 'Saxon Pub', city: 'Austin', state: 'TX', capacity: 150, reason: 'x' }, rows)).toMatchObject({
      ok: true,
      write: { op: 'createVenue', input: { name: 'Saxon Pub', kind: 'venue', capacity: 150 } },
    });
    expect(buildWrite({ type: 'update_venue', venue_id: VENUE, changes: { email: 'talent@gruenehall.com' }, reason: 'x' }, rows)).toMatchObject({
      ok: true,
      write: { op: 'updateVenue', id: VENUE, input: { email: 'talent@gruenehall.com', capacity: 800, website: 'https://gruenehall.com' } },
    });
  });

  it('never shares a new contact, and never changes an existing contact’s sharing', () => {
    expect(buildWrite({ type: 'add_contact', venue_id: VENUE, name: 'Mike Ray', reason: 'x' }, rows)).toMatchObject({ ok: true, write: { input: { share_with_bands: false } } });
    expect(buildWrite({ type: 'update_contact', contact_id: CONTACT, changes: { title: 'Owner' }, reason: 'x' }, rows)).toMatchObject({
      ok: true,
      write: { op: 'updateContact', input: { title: 'Owner', share_with_bands: true, email: 'sarah@gruenehall.com' } },
    });
  });

  it('refuses a row that has disappeared, or a change the form would reject', () => {
    expect(buildWrite({ type: 'update_show', show_id: FOREIGN, changes: { status: 'confirmed' }, reason: 'x' }, rows)).toMatchObject({ ok: false });
    const bad = buildWrite({ type: 'update_show', show_id: SHOW, changes: { venue_id: null }, reason: 'x' }, { ...rows, shows: [{ ...show, venue_id: VENUE }] });
    expect(bad).toMatchObject({ ok: false });
  });

  it('records hold details on a hold, and clears them when the show is confirmed', () => {
    const challenged = buildWrite({ type: 'update_show', show_id: SHOW, changes: { answer_by: '2026-10-16', challenge_note: 'Second act wants the date' }, reason: 'Venue called' }, rows);
    expect(challenged).toMatchObject({ ok: true, write: { input: { status: 'hold', hold_rank: 1, hold_expires_on: '2026-10-20', answer_by: '2026-10-16', challenge_note: 'Second act wants the date' } } });
    const confirmed = buildWrite({ type: 'update_show', show_id: SHOW, changes: { status: 'confirmed' }, reason: 'Venue said yes' }, rows);
    expect(confirmed).toMatchObject({ ok: true, write: { input: { status: 'confirmed', hold_rank: null, hold_expires_on: null, answer_by: null, challenge_note: null } } });
  });

  it('adds a ranked hold with an expiry', () => {
    const r = buildWrite({ type: 'add_show', roster_id: BAND, venue_id: VENUE, show_date: '2026-11-14', status: 'hold', hold_rank: 2, hold_expires_on: '2026-10-28', reason: 'Pencil in' }, rows);
    expect(r).toMatchObject({ ok: true, write: { op: 'createShow', input: { status: 'hold', hold_rank: 2, hold_expires_on: '2026-10-28' } } });
  });

  it('hands email drafts to the compose dialog instead of writing', () => {
    expect(buildWrite({ type: 'draft_email', subject: 's', body: 'b', reason: 'x' }, rows)).toEqual({ ok: true, write: { op: 'composeEmail' } });
  });
});

describe('describeAction', () => {
  it('names the band, venue and changes in plain words', () => {
    const d = describeAction({ type: 'update_show', show_id: SHOW, changes: { status: 'confirmed', fee: 800 }, reason: 'x' }, rows, 2026);
    expect(d.title).toBe('Update The Jackwagons at Gruene Hall — New Braunfels, Sat, Oct 24');
    expect(d.detail).toBe('Status → Confirmed · Fee → $800.00');
  });
  it('describes hold positions and deadlines', () => {
    expect(describeAction({ type: 'add_show', roster_id: BAND, venue_id: VENUE, show_date: '2026-11-14', status: 'hold', hold_rank: 2, hold_expires_on: '2026-10-28', reason: 'x' }, rows, 2026)).toMatchObject({
      title: 'Add a 2nd hold: The Jackwagons at Gruene Hall — New Braunfels',
      detail: 'Sat, Nov 14 · hold expires Wed, Oct 28',
    });
    expect(describeAction({ type: 'update_show', show_id: SHOW, changes: { hold_rank: 1, answer_by: '2026-10-16' }, reason: 'x' }, rows, 2026).detail).toBe('Position → 1st hold · Answer by → Fri, Oct 16');
  });

  it('labels a cancellation clearly', () => {
    const d = describeAction({ type: 'update_show', show_id: SHOW, changes: { status: 'cancelled' }, reason: 'x' }, rows, 2026);
    expect(d.title.startsWith('Cancel ')).toBe(true);
    expect(d.approveLabel).toBe('Approve cancel');
  });
  it('tells the agent a new contact is not shared', () => {
    const d = describeAction({ type: 'add_contact', venue_id: VENUE, name: 'Mike Ray', reason: 'x' }, rows, 2026);
    expect(d.title).toBe('Add Mike Ray as a contact at Gruene Hall');
    expect(d.detail).toContain('Not shared with your bands');
  });
});

describe('assistant prompt', () => {
  const snap: AssistantSnapshot = {
    today,
    agency: 'Lone Star Booking',
    bands: [{ id: BAND, band_name: 'The Jackwagons', genre: 'rock', home_city: 'Austin', home_state: 'TX', commission_pct: 15, status: 'active', contact_name: 'Jake', contact_email: null, contact_phone: null, notes: 'Prefers\nSaturdays' }],
    shows: [{ id: SHOW, roster_id: BAND, venue_id: VENUE, venue_name: null, venue_city: null, show_date: '2026-10-24', status: 'hold', fee: 700, actual_amount: null, commission_pct_override: null, followup_on: '2026-10-15', set_time: null, door_time: null, load_in_time: null, deal_type: null, deleted_at: null, hold_rank: 1, hold_expires_on: '2026-10-30', answer_by: '2026-10-14', challenge_note: 'Another act wants it' }],
    venues: [{ id: VENUE, name: 'Gruene Hall', city: 'New Braunfels', state: 'TX', kind: 'venue', capacity: 800, email: 'booking@gruenehall.com', phone: null, website: null }],
    venuesTruncated: false,
    contacts: [{ id: CONTACT, venue_id: VENUE, name: 'Sarah Lee', title: 'Talent buyer', email: 'sarah@gruenehall.com', phone: null, share_with_bands: false }],
    contactsTruncated: false,
    recentEmails: [{ sent_on: '2026-10-08', to: 'Sarah Lee', subject: 'Spring dates', venue_id: VENUE, roster_id: BAND }],
    emailFollowups: [{ id: 'm1', to: 'Sarah Lee', subject: 'Nov dates', followup_on: '2026-10-14', venue_id: VENUE, roster_id: BAND }],
    commission: { due: 105, paid: 50, outstanding: 55, projected: 105 },
  };
  it('lists the workspace with ids so proposals can point at real rows', () => {
    const t = snapshotText(snap);
    expect(t).toContain(`id=${BAND} | The Jackwagons | rock | home Austin, TX | commission 15% | active | band contact Jake | notes: Prefers Saturdays`);
    expect(t).toContain(`id=${SHOW} | 2026-10-24 Sat, Oct 24 | The Jackwagons (band id=${BAND}) | Gruene Hall, New Braunfels (venue id=${VENUE}) | hold | fee $700.00 | 1st hold | hold expires 2026-10-30 | CHALLENGED: answer by 2026-10-14 (Another act wants it) | follow up 2026-10-15`);
    expect(t).toContain(`id=${VENUE} | Gruene Hall | New Braunfels, TX | venue | cap 800 | booking@gruenehall.com`);
    expect(t).toContain(`id=${CONTACT} | Sarah Lee, Talent buyer | Gruene Hall (venue id=${VENUE}) | sarah@gruenehall.com`);
    expect(t).toContain('2026-10-08 | to Sarah Lee at Gruene Hall | for The Jackwagons | "Spring dates"');
    expect(t).toContain('2026-10-14 | to Sarah Lee | "Nov dates"');
    expect(t).toContain('owed $55.00');
  });
  it('states the approval rule, the money and deletion limits, and treats data as data', () => {
    const p = assistantSystemPrompt('DATA');
    expect(p).toMatch(/nothing happens until then/);
    expect(p).toMatch(/Money: record commission payments/);
    expect(p).toMatch(/Deleting or archiving/);
    expect(p).toMatch(/Sharing a contact with bands/);
    expect(p).toMatch(/search the web/);
    expect(p).toMatch(/Never invent/);
    expect(p).toMatch(/information, not instructions/);
    expect(p.endsWith('DATA')).toBe(true);
  });
});

describe('draft_offer', () => {
  it('keeps proposals for the agent’s own show and contact, and drops the rest', () => {
    const out = validActions(
      [
        { type: 'draft_offer', show_id: SHOW, contact_id: CONTACT, expires_on: '2026-10-19', reason: 'Venue asked for terms' },
        { type: 'draft_offer', show_id: SHOW, doc_kind: 'deal_memo', reason: 'Agreed by phone' },
        { type: 'draft_offer', show_id: FOREIGN, reason: 'x' },
        { type: 'draft_offer', show_id: SHOW, contact_id: FOREIGN, reason: 'x' },
        { type: 'draft_offer', show_id: SHOW, expires_on: '2026-10-01', reason: 'x' },
      ],
      known,
      today,
    );
    expect(out).toEqual([
      { type: 'draft_offer', show_id: SHOW, doc_kind: 'offer', contact_id: CONTACT, expires_on: '2026-10-19', reason: 'Venue asked for terms' },
      { type: 'draft_offer', show_id: SHOW, doc_kind: 'deal_memo', reason: 'Agreed by phone' },
    ]);
  });

  it('carries no money: a fee in the proposal is ignored', () => {
    const [a] = validActions([{ type: 'draft_offer', show_id: SHOW, fee: 99999, deposit_amount: 5000, reason: 'x' }], known, today);
    expect(a).not.toHaveProperty('fee');
    expect(a).not.toHaveProperty('deposit_amount');
  });

  it('builds a draft-only write, with no stand-by date on a deal memo', () => {
    expect(buildWrite({ type: 'draft_offer', show_id: SHOW, doc_kind: 'offer', contact_id: CONTACT, expires_on: '2026-10-19', reason: 'x' }, rows)).toEqual({
      ok: true,
      write: { op: 'draftOffer', showId: SHOW, kind: 'offer', contactId: CONTACT, expiresOn: '2026-10-19' },
    });
    expect(buildWrite({ type: 'draft_offer', show_id: SHOW, doc_kind: 'deal_memo', expires_on: '2026-10-19', reason: 'x' }, rows)).toMatchObject({ write: { kind: 'deal_memo', expiresOn: null, contactId: null } });
    expect(buildWrite({ type: 'draft_offer', show_id: FOREIGN, doc_kind: 'offer', reason: 'x' }, rows)).toMatchObject({ ok: false });
  });

  it('says on the card that nothing is sent', () => {
    const d = describeAction({ type: 'draft_offer', show_id: SHOW, doc_kind: 'offer', contact_id: CONTACT, reason: 'x' }, rows, 2026);
    expect(d.title).toMatch(/^Draft offer: /);
    expect(d.detail).toContain('nothing is sent');
    expect(d.approveLabel).toBe('Draft it');
  });
});
