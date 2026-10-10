// __tests__/lib/booker/dates.test.ts
import { addDays, formatShowDate, formatTime, isIsoDate, todayIso, weekendRange } from '../../../lib/booker/dates';

describe('isIsoDate', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isIsoDate('2026-10-24')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('10/24/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is not shifted by daylight saving changes', () => {
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
  });
});

describe('weekendRange', () => {
  // 2026-10-05 is a Monday; 2026-10-09 a Friday.
  it.each([
    ['2026-10-05', '2026-10-09'], // Mon → coming weekend
    ['2026-10-08', '2026-10-09'], // Thu → coming weekend
    ['2026-10-09', '2026-10-09'], // Fri → this weekend
    ['2026-10-10', '2026-10-09'], // Sat → this weekend
    ['2026-10-11', '2026-10-09'], // Sun → this weekend
  ])('%s → weekend starting %s', (today, friday) => {
    expect(weekendRange(today)).toEqual({ start: friday, end: addDays(friday, 2) });
  });
});

describe('todayIso', () => {
  it('uses the local calendar date', () => {
    expect(todayIso(new Date(2026, 9, 9, 23, 30))).toBe('2026-10-09');
  });
});

describe('formatShowDate', () => {
  it('shows the weekday and adds the year only when it differs', () => {
    expect(formatShowDate('2026-10-24', 2026)).toBe('Sat, Oct 24');
    expect(formatShowDate('2027-01-02', 2026)).toBe('Sat, Jan 2, 2027');
  });
});

describe('formatTime', () => {
  it('renders 12-hour times', () => {
    expect(formatTime('19:30:00')).toBe('7:30 PM');
    expect(formatTime('00:15')).toBe('12:15 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(formatTime(null)).toBeNull();
  });
});
