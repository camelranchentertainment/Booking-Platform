// __tests__/lib/agentOutreachContext.test.ts
// The agent's Outreach section. Regression (Oct 24): asked to "look at my last
// sent email to TX venues and write the overdue follow up", the agent said it
// couldn't read the outbox — it was never given sent emails or the venues'
// stages beyond a name list.

import {
  formatOutreachContext, buildOutreachContext, type OutreachTarget, type SentEmail,
} from '../../lib/server/agentOutreachContext';
import {
  selectOutreachRows, emptyOutreachMessage, categoryForNextEmail, parseOutreachStage, isOverdue,
} from '../../lib/domain/tourOutreach';

const NOW = new Date('2026-10-26T15:00:00Z').getTime();
const TOUR = 'tour-lone-star';

const target = (i: number, over: Partial<OutreachTarget> = {}): OutreachTarget => ({
  id: `tv-${i}`,
  tour_id: TOUR,
  status: 'follow_up',
  booking_date: null,
  last_contacted_at: '2026-10-14T18:00:00Z',
  pitched_at: '2026-10-13T18:00:00Z',
  updated_at: '2026-10-14T18:00:00Z',
  venue: { id: `v-${i}`, name: `Texas Venue ${i}`, city: 'Austin', state: 'TX', email: `book${i}@example.com` },
  ...over,
});

const sent = (i: number, over: Partial<SentEmail> = {}): SentEmail => ({
  id: `e-${i}`,
  sent_at: '2026-10-14T18:00:00Z',
  recipient: `book${i}@example.com`,
  subject: "Live Music Booking Inquiry — Jake Stringer & Better Than Nothin'",
  body: '<p>Hi there,</p><p>We are routing through Texas Jan 7-9 and would love a night at your place.</p>',
  category: 'target',
  tour_venue_id: `tv-${i}`,
  venue_id: `v-${i}`,
  venue: { name: `Texas Venue ${i}` },
  ...over,
});

describe('formatOutreachContext', () => {
  const tours = new Map([[TOUR, 'LONE STAR']]);
  const targets = Array.from({ length: 17 }, (_, i) => target(i + 1));
  const emails = Array.from({ length: 17 }, (_, i) => sent(i + 1));

  it('lists every follow-up venue with its stage, last contact, overdue flag and last email', () => {
    const text = formatOutreachContext(tours, targets, emails, [], NOW);
    expect(text).toContain('LONE STAR (tour id=tour-lone-star): 17 Follow up · 17 OVERDUE');
    expect(text).toMatch(/- Texas Venue 1, Austin TX \[Follow up · last contact 2026-10-14 \(1[12]d ago\) · OVERDUE · 1 email sent, last "Live Music Booking Inquiry/);
    expect(text).toContain('tour_venue_id=tv-1 venue_id=v-1');
  });

  it('shows one 17-venue blast as one sent entry with its body', () => {
    const text = formatOutreachContext(tours, targets, emails, [], NOW);
    const entries = text.split('\n').filter(l => l.startsWith('  - email_id='));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/2026-10-14 · LONE STAR · Cold pitch · ".+" to 17 venues: Texas Venue 1, .*\+9 more/);
    expect(text).toContain('Body: Hi there, We are routing through Texas Jan 7-9');
  });

  it('notes when a venue replied and when one has no email', () => {
    const rows = [target(1), target(2, { venue: { id: 'v-2', name: 'No Email Bar', city: 'Waco', state: 'TX', email: null } })];
    const text = formatOutreachContext(tours, rows, [], [{ venue_id: 'v-1', sent_at: '2026-10-22T12:00:00Z' }], NOW);
    expect(text).toMatch(/Texas Venue 1.*replied 2026-10-22/);
    expect(text).toMatch(/No Email Bar.*NO EMAIL ON FILE/);
  });

  it('says plainly when nothing is being pitched or sent', () => {
    const text = formatOutreachContext(new Map(), [], [], [], NOW);
    expect(text).toContain('(no venues are being pitched on any open tour)');
    expect(text).toContain('(none)');
  });
});

describe('buildOutreachContext', () => {
  it('reads sent email without filtering out archived rows, and fails soft', async () => {
    const calls: Array<{ table: string; filters: string[] }> = [];
    const service = {
      from: (table: string) => {
        const entry = { table, filters: [] as string[] };
        calls.push(entry);
        const c: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'not', 'or', 'gte', 'order', 'limit', 'in']) {
          c[m] = (...args: unknown[]) => { entry.filters.push(`${m}:${args.map(String).join(',')}`); return c; };
        }
        c.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(f);
        return c;
      },
    };
    const text = await buildOutreachContext(service as never, 'act-1', new Date(NOW));
    expect(text).toContain('Outreach —');
    const sentQuery = calls.find(c => c.table === 'email_log' && c.filters.includes('eq:direction,sent'));
    expect(sentQuery?.filters.join(' ')).not.toMatch(/archived/);

    const broken = { from: () => { throw new Error('db down'); } };
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(buildOutreachContext(broken as never, 'act-1')).resolves.toMatch(/could not be loaded right now/);
  });
});

describe('follow-up outreach helpers', () => {
  const rows = [
    { status: 'follow_up', last_contacted_at: '2026-10-14T00:00:00Z' },
    { status: 'follow_up', last_contacted_at: '2026-10-24T00:00:00Z' },
    { status: 'target', last_contacted_at: null, updated_at: '2026-10-01T00:00:00Z' },
  ];

  it('picks the stage asked for, and only overdue ones when asked', () => {
    expect(selectOutreachRows(rows, 'follow_up', false, NOW)).toHaveLength(2);
    expect(selectOutreachRows(rows, 'follow_up', true, NOW)).toHaveLength(1);
    expect(selectOutreachRows(rows, 'target', false, NOW)).toHaveLength(1);
  });

  it('points a first-pitch request at the follow-ups instead of repeating "no venues still marked Targeted"', () => {
    const allFollowUp = Array.from({ length: 17 }, () => ({ status: 'follow_up', last_contacted_at: '2026-10-14T00:00:00Z' }));
    const msg = emptyOutreachMessage('LONE STAR', allFollowUp, 'target', false, NOW);
    expect(msg).toBe('"LONE STAR" has no venues left in Target — all 17 have been pitched and are in Follow up (17 overdue). Say "send the follow-up" and I\'ll draft it from the last email they got.');
    expect(msg).not.toMatch(/still marked Targeted/);
  });

  it('explains an empty overdue-only follow-up', () => {
    const fresh = [{ status: 'follow_up', last_contacted_at: '2026-10-24T00:00:00Z' }];
    expect(emptyOutreachMessage('HIGH PLAINS', fresh, 'follow_up', true, NOW)).toMatch(/None of the 1 follow-up venues .* are overdue yet/);
  });

  it.each([[0, 'target'], [1, 'follow_up_1'], [2, 'follow_up_2'], [5, 'follow_up_2']] as const)(
    'categoryForNextEmail(%p) → %p', (n, out) => expect(categoryForNextEmail(n)).toBe(out),
  );

  it('reads the model stage strictly and dates overdue at 7 days', () => {
    expect(parseOutreachStage('follow_up')).toBe('follow_up');
    expect(parseOutreachStage('followup')).toBe('target');
    expect(isOverdue({ status: 'follow_up', last_contacted_at: '2026-10-19T15:00:00Z' }, NOW)).toBe(true);
    expect(isOverdue({ status: 'follow_up', last_contacted_at: '2026-10-19T15:00:01Z' }, NOW)).toBe(false);
  });
});
