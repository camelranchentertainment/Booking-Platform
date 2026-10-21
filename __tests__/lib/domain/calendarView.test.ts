// __tests__/lib/domain/calendarView.test.ts
import {
  toDateStr, monthGrid, weekDays, statusColor, inkOn, statusLegend, summarizeCalendar, byDate, clock,
} from '../../../lib/domain/calendarView';
import { STATUS_COLORS } from '../../../lib/statusSync';

describe('monthGrid', () => {
  it('fills whole Sunday-first weeks around October 2026', () => {
    const cells = monthGrid(2026, 9); // Oct 1 2026 is a Thursday
    expect(cells.length % 7).toBe(0);
    expect(cells[0]).toEqual({ date: '2026-09-27', day: 27, inMonth: false });
    expect(cells.find(c => c.inMonth)?.date).toBe('2026-10-01');
    expect(cells.filter(c => c.inMonth)).toHaveLength(31);
    expect(cells[cells.length - 1].date).toBe('2026-10-31');
  });
  it('crosses the year boundary', () => {
    const cells = monthGrid(2027, 0);
    expect(cells[0].date).toBe('2026-12-27');
    expect(cells.at(-1)!.date).toBe('2027-02-06');
  });
});

describe('weekDays', () => {
  it('starts on Sunday and moves by whole weeks', () => {
    const anchor = new Date(2026, 9, 21); // Wed
    expect(weekDays(anchor, 0).map(toDateStr)).toEqual([
      '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24',
    ]);
    expect(toDateStr(weekDays(anchor, 2)[0])).toBe('2026-11-01');
    expect(toDateStr(weekDays(anchor, -1)[6])).toBe('2026-10-17');
  });
});

describe('inkOn', () => {
  it('uses dark text on light colours and white on dark ones', () => {
    expect(inkOn('#F5C842')).toBe('#0b1220');
    expect(inkOn('#4CAF50')).toBe('#0b1220');
    expect(inkOn('#1b2132')).toBe('#ffffff');
    expect(inkOn('nonsense')).toBe('#ffffff');
  });
});

describe('statusLegend', () => {
  it('matches the tile colours and merges shared colours', () => {
    const legend = statusLegend();
    for (const entry of legend) expect(Object.values(STATUS_COLORS).map(c => c.toLowerCase())).toContain(entry.color);
    const confirmed = legend.find(e => e.label.includes('Confirmed'))!;
    expect(confirmed.color).toBe(statusColor('confirmed').toLowerCase());
    // Negotiation and Hold share a colour today, so they share a chip.
    if (statusColor('negotiation').toLowerCase() === statusColor('hold').toLowerCase()) {
      expect(legend.map(e => e.label)).toContain('Negotiation / Hold');
    }
  });
});

describe('summarizeCalendar', () => {
  const shows = [
    { id: 'a', show_date: '2026-10-05', status: 'completed' },
    { id: 'b', show_date: '2026-10-24', status: 'confirmed' },
    { id: 'c', show_date: '2026-10-22', status: 'advancing' },
    { id: 'd', show_date: '2026-11-30', status: 'contract' },
    { id: 'e', show_date: '2026-11-02', status: 'pitch' },
    { id: 'f', show_date: '2026-10-01', status: 'hold' },
    { id: 'g', show_date: null, status: 'confirmed' },
  ];
  it('counts the viewed month, the pipeline and the next show', () => {
    const s = summarizeCalendar(shows, '2026-10-21', 2026, 9);
    expect(s.monthBooked).toBe(3);
    expect(s.pipeline).toBe(1);
    expect(s.next).toEqual({ show: shows[2], daysAway: 1 });
    expect(s.next30).toBe(2);
  });
  it('has no next show when nothing is booked ahead', () => {
    expect(summarizeCalendar([shows[0]], '2026-10-21', 2026, 9).next).toBeNull();
  });
});

describe('byDate / clock', () => {
  it('groups by day and skips undated rows', () => {
    const g = byDate([{ show_date: '2026-10-21T00:00:00' }, { show_date: '2026-10-21' }, { show_date: null }]);
    expect(Object.keys(g)).toEqual(['2026-10-21']);
    expect(g['2026-10-21']).toHaveLength(2);
  });
  it('formats set times', () => {
    expect(clock('21:30:00')).toBe('9:30 PM');
    expect(clock('00:05')).toBe('12:05 AM');
    expect(clock('')).toBeNull();
  });
});
