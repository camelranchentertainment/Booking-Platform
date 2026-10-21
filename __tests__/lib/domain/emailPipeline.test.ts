// __tests__/lib/domain/emailPipeline.test.ts
import {
  daysSince, contactTone, nextAction, isActiveThread, sortTargets, isOverdueFollowUp,
  filterArchive, plainText, summarizeEmail, stageLabel, lastTouch, type TargetRow,
} from '../../../lib/domain/emailPipeline';

// Noon local time on 2026-10-21, so day maths never straddles midnight.
const NOW = new Date(2026, 9, 21, 12).getTime();
const daysAgo = (n: number): string => {
  const d = new Date(2026, 9, 21 - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const thread = (stage: string | null, lastContact: string | null, show: string | null = null, status = 'confirmed') =>
  ({ status, show_date: show, email_stage: stage, last_contact_date: lastContact });

describe('daysSince / contactTone', () => {
  it('counts whole days and treats missing dates as null', () => {
    expect(daysSince(daysAgo(3), NOW)).toBe(3);
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince('not a date', NOW)).toBeNull();
  });
  it('grades urgency', () => {
    expect(contactTone(2)).toBe('ok');
    expect(contactTone(10)).toBe('due');
    expect(contactTone(20)).toBe('late');
    expect(contactTone(null)).toBe('done');
  });
});

describe('nextAction', () => {
  it('starts a thread with a cold pitch, unless the show is closed', () => {
    expect(nextAction(thread(null, null), NOW)).toEqual({ label: 'Send cold pitch', tone: 'new', next: 'target' });
    expect(nextAction(thread(null, null, null, 'completed'), NOW).next).toBeNull();
  });
  it('walks the follow-up ladder by days since contact', () => {
    expect(nextAction(thread('target', daysAgo(3)), NOW)).toMatchObject({ tone: 'ok', next: 'follow_up_1' });
    expect(nextAction(thread('target', daysAgo(8)), NOW)).toMatchObject({ label: 'Follow up due', tone: 'due' });
    expect(nextAction(thread('follow_up_1', daysAgo(12)), NOW)).toMatchObject({ tone: 'late', next: 'follow_up_2' });
    expect(nextAction(thread('follow_up_2', daysAgo(20)), NOW)).toMatchObject({ label: 'No response — mark cold?', next: null });
  });
  it('times the advance off the show date', () => {
    const in30 = daysAgo(-30);
    expect(nextAction(thread('confirmation', daysAgo(1), in30), NOW)).toMatchObject({ label: 'Advance in 15d', next: 'advance' });
    expect(nextAction(thread('confirmation', daysAgo(1), daysAgo(-5)), NOW)).toMatchObject({ tone: 'late', next: 'advance' });
    expect(nextAction(thread('advance', daysAgo(10), daysAgo(2)), NOW)).toMatchObject({ label: 'Send thank you', next: 'thank_you' });
  });
});

describe('isActiveThread', () => {
  it('drops finished threads', () => {
    expect(isActiveThread(thread('cold', null))).toBe(false);
    expect(isActiveThread(thread('advance', null))).toBe(true);
    expect(isActiveThread(thread(null, null))).toBe(true);
  });
});

const row = (id: string, over: Partial<TargetRow> = {}): TargetRow => ({
  id, status: 'target', last_contacted_at: null, pitched_at: null, updated_at: null, venue: { name: id }, tour: { name: 'Run' }, ...over,
});

describe('sortTargets', () => {
  it('sorts by venue, status order and last touch', () => {
    const rows = [row('b', { status: 'confirmed' }), row('a', { status: 'follow_up', updated_at: daysAgo(1) }), row('c', { last_contacted_at: daysAgo(5) })];
    expect(sortTargets(rows, 'venue', 'asc').map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(sortTargets(rows, 'status', 'asc').map(r => r.id)).toEqual(['c', 'a', 'b']);
    expect(sortTargets(rows, 'lastContact', 'desc').map(r => r.id)).toEqual(['a', 'c', 'b']);
  });
  it('prefers contact over pitch over update for the last touch', () => {
    expect(lastTouch({ last_contacted_at: null, pitched_at: '2026-10-01', updated_at: '2026-10-09' })).toBe('2026-10-01');
  });
});

describe('isOverdueFollowUp / summarizeEmail', () => {
  it('flags follow-ups quiet for a week', () => {
    expect(isOverdueFollowUp(row('x', { status: 'follow_up', last_contacted_at: daysAgo(9) }), NOW)).toBe(true);
    expect(isOverdueFollowUp(row('x', { status: 'target', last_contacted_at: daysAgo(9) }), NOW)).toBe(false);
  });
  it('totals the header numbers', () => {
    const s = summarizeEmail(
      [row('a', { status: 'follow_up', last_contacted_at: daysAgo(10) }), row('b', { status: 'confirmed' }), row('c')],
      [thread('target', daysAgo(12)), thread('target', daysAgo(1)), thread('cold', null)],
      NOW,
    );
    expect(s).toEqual({ targets: 3, overdue: 1, confirmed: 1, threadsDue: 1 });
  });
});

describe('filterArchive / plainText / stageLabel', () => {
  const mail = [
    { sent_at: '2026-10-02T10:00:00Z', subject: 'Avail Nov 7?', venue: { name: 'Blue Door' } },
    { sent_at: '2026-10-15T10:00:00Z', subject: 'Thanks!', venue: { name: 'Gruene Hall' } },
  ];
  it('matches venue or subject and an inclusive date range', () => {
    expect(filterArchive(mail, { search: 'gruene', start: '', end: '' })).toHaveLength(1);
    expect(filterArchive(mail, { search: 'nov', start: '', end: '' })).toHaveLength(1);
    expect(filterArchive(mail, { search: '', start: '2026-10-02', end: '2026-10-02' })).toHaveLength(1);
  });
  it('turns HTML into readable text', () => {
    expect(plainText('<p>Hi&nbsp;there</p><style>p{}</style><b>Bold</b>')).toBe('Hi there Bold');
    expect(plainText(null)).toBe('');
  });
  it('labels stages and passes unknown ones through', () => {
    expect(stageLabel('follow_up')).toBe('Follow up');
    expect(stageLabel('mystery')).toBe('mystery');
  });
});
