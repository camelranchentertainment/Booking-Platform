// __tests__/lib/booker/deposits.test.ts
// Build list item 5: the repeat-booking commission rate, deposit tracking on
// shows, and the money items on the agent's "Needs attention" list.

import { commissionDue, commissionProjected, commissionTotals, effectiveRate, repeatShowIds } from '../../../lib/booker/commission';
import { RosterBandSchema, ShowSchema, fieldErrors } from '../../../lib/booker/schemas';
import { COMMISSION_OVERDUE_DAYS, DEPOSIT_WARN_DAYS, byId, moneyAttentionItems, payableShows } from '../../../lib/booker/workspace';
import type { BookerShow, BookerVenue, CommissionPayment, RosterBand } from '../../../lib/booker/types';

const TODAY = '2026-10-21';
const UUID = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
const ts = { created_at: '', updated_at: '', deleted_at: null };

const band = (over: Partial<RosterBand> = {}): RosterBand => ({
  id: 'b1',
  booker_id: 'k',
  band_name: 'The Jackwagons',
  genre: null,
  home_city: null,
  home_state: null,
  contact_name: null,
  contact_email: null,
  contact_phone: null,
  commission_pct: 15,
  repeat_commission_pct: 10,
  color: null,
  notes: null,
  status: 'active',
  ...ts,
  ...over,
});

const show = (over: Partial<BookerShow> = {}): BookerShow => ({
  id: 's1',
  booker_id: 'k',
  roster_id: 'b1',
  venue_id: 'v1',
  venue_name: null,
  venue_city: null,
  show_date: '2026-10-24',
  load_in_time: null,
  door_time: null,
  set_time: null,
  set_length_min: null,
  status: 'confirmed',
  deal_type: 'guarantee',
  fee: 1000,
  actual_amount: null,
  commission_pct_override: null,
  deal_notes: null,
  internal_notes: null,
  followup_on: null,
  hold_rank: null,
  hold_expires_on: null,
  answer_by: null,
  challenge_note: null,
  deposit_amount: null,
  deposit_due_on: null,
  deposit_received_on: null,
  ...ts,
  ...over,
});

const payment = (show_id: string, amount: number, over: Partial<CommissionPayment> = {}): CommissionPayment => ({
  id: `p-${show_id}-${amount}`,
  booker_id: 'k',
  show_id,
  amount,
  paid_on: '2026-10-01',
  method: 'other',
  notes: null,
  ...ts,
  ...over,
});

const venue: BookerVenue = { id: 'v1', booker_id: 'k', name: 'Gruene Hall', address: null, city: 'New Braunfels', state: 'TX', postal_code: null, capacity: null, website: null, notes: null, kind: 'venue', place_id: null, email: null, phone: null, last_scanned_at: null, tags: [], ...ts };
const venues = byId([venue]);

describe('effectiveRate with a repeat-booking rate', () => {
  it('uses the repeat rate only for repeat bookings, and a show override always wins', () => {
    expect(effectiveRate(show(), band())).toBe(15);
    expect(effectiveRate(show(), band(), true)).toBe(10);
    expect(effectiveRate(show({ commission_pct_override: 12 }), band(), true)).toBe(12);
  });
  it('falls back to the standard rate when no repeat rate is set', () => {
    expect(effectiveRate(show(), band({ repeat_commission_pct: null }), true)).toBe(15);
    expect(effectiveRate(show(), band({ commission_pct: null, repeat_commission_pct: null }), true)).toBeNull();
  });
  it('flows into due and projected commission', () => {
    expect(commissionDue(show({ status: 'played', actual_amount: 800 }), band(), true)).toBe(80);
    expect(commissionDue(show({ status: 'played', actual_amount: 800 }), band())).toBe(120);
    expect(commissionProjected(show(), band(), TODAY, true)).toBe(100);
  });
});

describe('repeatShowIds', () => {
  it('marks shows after the band first PLAYED the same saved venue', () => {
    const shows = [
      show({ id: 'first', show_date: '2025-06-01', status: 'played' }),
      show({ id: 'second', show_date: '2026-03-01', status: 'played' }),
      show({ id: 'next', show_date: '2026-11-01', status: 'confirmed' }),
      show({ id: 'other-band', roster_id: 'b2', show_date: '2026-11-02' }),
      show({ id: 'other-venue', venue_id: 'v2', show_date: '2026-11-03' }),
    ];
    expect([...repeatShowIds(shows)].sort()).toEqual(['next', 'second']);
  });
  it('matches typed venues by name, ignoring case and spaces', () => {
    const shows = [
      show({ id: 'a', venue_id: null, venue_name: 'Saxon Pub', show_date: '2026-01-10', status: 'played' }),
      show({ id: 'b', venue_id: null, venue_name: '  saxon pub ', show_date: '2026-05-10' }),
    ];
    expect([...repeatShowIds(shows)]).toEqual(['b']);
  });
  it('ignores earlier holds, cancelled or archived shows, and same-day shows', () => {
    const shows = [
      show({ id: 'hold', show_date: '2026-01-01', status: 'hold' }),
      show({ id: 'cancelled', show_date: '2026-02-01', status: 'cancelled' }),
      show({ id: 'archived', show_date: '2026-03-01', status: 'played', deleted_at: '2026-03-02' }),
      show({ id: 'early', show_date: '2026-06-01', status: 'played' }),
      show({ id: 'late', show_date: '2026-06-01', status: 'played' }),
      show({ id: 'no-venue', venue_id: null, venue_name: null, show_date: '2026-09-01' }),
    ];
    expect(repeatShowIds(shows).size).toBe(0);
  });
  it('is applied by commissionTotals and payableShows', () => {
    const shows = [show({ id: 'a', show_date: '2026-01-10', status: 'played' }), show({ id: 'b', show_date: '2026-05-10', status: 'played' })];
    const bands = byId([band()]);
    const repeats = repeatShowIds(shows);
    expect(commissionTotals(shows, bands, [], TODAY, repeats).due).toBe(250);
    expect(commissionTotals(shows, bands, [], TODAY).due).toBe(300);
    expect(payableShows(shows, bands, venues, repeats).find(o => o.id === 'b')?.due).toBe(100);
  });
});

describe('moneyAttentionItems', () => {
  const run = (shows: BookerShow[], payments: CommissionPayment[] = []) => moneyAttentionItems(shows, [band()], payments, venues, TODAY);

  it('lists overdue deposits first, then those due within the warning window', () => {
    const items = run([
      show({ id: 'soon', deposit_amount: 250, deposit_due_on: '2026-10-25' }),
      show({ id: 'late', deposit_amount: 300, deposit_due_on: '2026-10-15' }),
      show({ id: 'today', deposit_amount: 100, deposit_due_on: TODAY }),
      show({ id: 'far', deposit_amount: 100, deposit_due_on: '2026-12-01' }),
    ]);
    expect(items.map(i => [i.kind, i.showId])).toEqual([
      ['deposit_overdue', 'late'],
      ['deposit_due', 'today'],
      ['deposit_due', 'soon'],
    ]);
    expect(items[0].message).toContain('$300.00');
    expect(items[0].message).toContain('Gruene Hall');
    expect(items[1].message).toContain('due today');
  });

  it('warns exactly up to the window edge', () => {
    const edge = run([show({ deposit_amount: 50, deposit_due_on: `2026-10-${21 + DEPOSIT_WARN_DAYS}` })]);
    const past = run([show({ deposit_amount: 50, deposit_due_on: `2026-10-${22 + DEPOSIT_WARN_DAYS}` })]);
    expect(edge).toHaveLength(1);
    expect(past).toHaveLength(0);
  });

  it('skips deposits already received, cancelled or archived shows, and dates without amounts', () => {
    expect(
      run([
        show({ id: 'got', deposit_amount: 250, deposit_due_on: '2026-10-10', deposit_received_on: '2026-10-09' }),
        show({ id: 'cxl', deposit_amount: 250, deposit_due_on: '2026-10-10', status: 'cancelled' }),
        show({ id: 'arc', deposit_amount: 250, deposit_due_on: '2026-10-10', deleted_at: '2026-10-11' }),
        show({ id: 'nodate', deposit_amount: 250 }),
      ]),
    ).toEqual([]);
  });

  it('flags commission still owed after the grace period, net of payments, linking to Commission', () => {
    const old = show({ id: 'old', status: 'played', show_date: '2026-09-01', actual_amount: 1000 });
    const recent = show({ id: 'recent', status: 'played', show_date: '2026-10-10', actual_amount: 1000 });
    const items = run([old, recent], [payment('old', 50)]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'commission_overdue', key: 'co-b1', href: '/agent/commission' });
    expect(items[0].showId).toBeUndefined();
    expect(items[0].message).toBe('$100.00 commission still owed by The Jackwagons for a show on Tue, Sep 1');
  });

  it('rolls a backlog up to one line per band, biggest balance first', () => {
    const items = moneyAttentionItems(
      [
        show({ id: 'a', status: 'played', show_date: '2026-03-01', actual_amount: 1000 }),
        show({ id: 'b', status: 'played', show_date: '2025-12-01', actual_amount: 1000 }),
        show({ id: 'c', status: 'played', show_date: '2026-04-01', actual_amount: 2000, roster_id: 'b2' }),
      ],
      [band(), band({ id: 'b2', band_name: 'Prairie Fire', commission_pct: 20 })],
      [],
      venues,
      TODAY,
    );
    expect(items.map(i => i.message)).toEqual([
      '$400.00 commission still owed by Prairie Fire for a show on Wed, Apr 1',
      '$300.00 commission still owed by The Jackwagons across 2 shows, the oldest on Mon, Dec 1, 2025',
    ]);
  });

  it('stays quiet once commission is paid in full, and counts from the grace-period day', () => {
    const paid = show({ id: 'paid', status: 'played', show_date: '2026-08-01', actual_amount: 1000 });
    expect(run([paid], [payment('paid', 150)])).toEqual([]);
    const edge = show({ id: 'edge', status: 'played', show_date: '2026-09-21' });
    expect(COMMISSION_OVERDUE_DAYS).toBe(30);
    expect(run([edge])).toHaveLength(1);
    expect(run([{ ...edge, show_date: '2026-09-22' }])).toHaveLength(0);
  });

  it('uses the repeat rate when told the show is a repeat', () => {
    const s = show({ id: 'r', status: 'played', show_date: '2026-08-01', actual_amount: 1000 });
    const items = moneyAttentionItems([s], [band()], [], venues, TODAY, new Set(['r']));
    expect(items[0].message).toContain('$100.00');
  });
});

describe('deposit and repeat-rate form rules', () => {
  const base = { roster_id: UUID, show_date: '2026-10-24', venue_name: 'Saxon Pub' };

  it('accepts a deposit with its dates, and blanks become null', () => {
    expect(ShowSchema.parse({ ...base, deposit_amount: '250', deposit_due_on: '2026-10-15', deposit_received_on: '2026-10-14' })).toMatchObject({
      deposit_amount: 250,
      deposit_due_on: '2026-10-15',
      deposit_received_on: '2026-10-14',
    });
    expect(ShowSchema.parse({ ...base, deposit_amount: '', deposit_due_on: '', deposit_received_on: '' })).toMatchObject({ deposit_amount: null, deposit_due_on: null, deposit_received_on: null });
  });

  it('needs an amount before either deposit date', () => {
    for (const extra of [{ deposit_due_on: '2026-10-15' }, { deposit_received_on: '2026-10-15' }]) {
      const r = ShowSchema.safeParse({ ...base, ...extra });
      expect(r.success).toBe(false);
      if (!r.success) expect(fieldErrors(r.error).deposit_amount).toMatch(/deposit amount/i);
    }
  });

  it('rejects a negative deposit and a bad date', () => {
    expect(ShowSchema.safeParse({ ...base, deposit_amount: '-5' }).success).toBe(false);
    expect(ShowSchema.safeParse({ ...base, deposit_amount: '5', deposit_due_on: '2026-13-40' }).success).toBe(false);
  });

  it('parses the repeat-booking rate as a 0–100 percent', () => {
    expect(RosterBandSchema.parse({ band_name: 'X', commission_pct: '15', repeat_commission_pct: '10' })).toMatchObject({ commission_pct: 15, repeat_commission_pct: 10 });
    expect(RosterBandSchema.parse({ band_name: 'X', repeat_commission_pct: '' }).repeat_commission_pct).toBeNull();
    expect(RosterBandSchema.safeParse({ band_name: 'X', repeat_commission_pct: '101' }).success).toBe(false);
  });
});
