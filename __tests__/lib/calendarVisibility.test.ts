// __tests__/lib/calendarVisibility.test.ts
import { isVisibleOnAppCalendar } from '../../lib/types';
import { localToday } from '../../lib/formatDate';

const TODAY = '2026-10-05';

describe('isVisibleOnAppCalendar', () => {
  it('hides a target/pitch whose date has passed', () => {
    expect(isVisibleOnAppCalendar({ status: 'pitch', show_date: '2026-10-04' }, TODAY)).toBe(false);
  });
  it('keeps an upcoming target/pitch', () => {
    expect(isVisibleOnAppCalendar({ status: 'pitch', show_date: '2026-11-01' }, TODAY)).toBe(true);
  });
  it('keeps a target dated today', () => {
    expect(isVisibleOnAppCalendar({ status: 'hold', show_date: TODAY }, TODAY)).toBe(true);
  });
  it.each(['contract', 'confirmed', 'advancing', 'completed'])('keeps a past %s show', status => {
    expect(isVisibleOnAppCalendar({ status, show_date: '2026-09-01' }, TODAY)).toBe(true);
  });
  it('never shows cancelled or undated bookings', () => {
    expect(isVisibleOnAppCalendar({ status: 'cancelled', show_date: '2026-12-01' }, TODAY)).toBe(false);
    expect(isVisibleOnAppCalendar({ status: 'confirmed', show_date: null }, TODAY)).toBe(false);
  });
});

describe('localToday', () => {
  it('uses local date parts, not UTC', () => {
    // 11pm local on Oct 5 must stay Oct 5 even though UTC is already Oct 6 in the US.
    expect(localToday(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05');
  });
});
