import {
  resolveYear,
  isInYear,
  bookingsInYear,
  availableBookingYears,
} from '../../lib/analyticsYear';

describe('resolveYear', () => {
  it('accepts a valid 4-digit year', () => {
    expect(resolveYear('2025', 2026)).toBe(2025);
  });

  it('falls back when missing, repeated, malformed or out of range', () => {
    expect(resolveYear(undefined, 2026)).toBe(2026);
    expect(resolveYear(['2024', '2025'], 2026)).toBe(2026);
    expect(resolveYear('abc', 2026)).toBe(2026);
    expect(resolveYear('25', 2026)).toBe(2026);
    expect(resolveYear('2025; drop table', 2026)).toBe(2026);
    expect(resolveYear('1999', 2026)).toBe(2026);
    expect(resolveYear('2101', 2026)).toBe(2026);
    expect(resolveYear('', 2026)).toBe(2026);
  });
});

describe('isInYear', () => {
  it('matches only the given calendar year', () => {
    expect(isInYear('2026-01-01', 2026)).toBe(true);
    expect(isInYear('2025-12-31', 2026)).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(isInYear(null, 2026)).toBe(false);
    expect(isInYear(undefined, 2026)).toBe(false);
  });
});

describe('bookingsInYear', () => {
  const bookings = [
    { show_date: '2026-09-29', fee: 500 },
    { show_date: '2026-01-16', fee: 500 },
    { show_date: '2025-07-26', fee: 500 },
    { show_date: null, fee: 500 },
  ];

  it('keeps only bookings dated in the selected year', () => {
    expect(bookingsInYear(bookings, 2026)).toHaveLength(2);
    expect(bookingsInYear(bookings, 2025)).toHaveLength(1);
  });

  it('excludes undated bookings from every year', () => {
    expect(bookingsInYear(bookings, 2024)).toHaveLength(0);
  });

  it('year slices partition the dated bookings', () => {
    const dated = bookings.filter(b => b.show_date !== null).length;
    expect(bookingsInYear(bookings, 2025).length + bookingsInYear(bookings, 2026).length).toBe(dated);
  });
});

describe('availableBookingYears', () => {
  it('returns distinct years newest first and always includes the current year', () => {
    const years = availableBookingYears(
      [{ show_date: '2023-07-15' }, { show_date: '2025-02-08' }, { show_date: '2025-04-18' }, { show_date: null }],
      2026,
    );
    expect(years).toEqual([2026, 2025, 2023]);
  });

  it('returns just the current year when there are no dated bookings', () => {
    expect(availableBookingYears([], 2026)).toEqual([2026]);
  });
});
