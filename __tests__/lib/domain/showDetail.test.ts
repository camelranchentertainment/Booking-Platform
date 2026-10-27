// __tests__/lib/domain/showDetail.test.ts
import {
  canDeleteShow, canMarkPlayed, countdown, dollars, formatLength, lineupTotal, parseMoneyInput,
  schedule, toPaymentStatus,
} from '../../../lib/domain/showDetail';

describe('schedule', () => {
  it('lists all six steps in show order with formatted values', () => {
    const s = schedule({ load_in_time: '17:00:00', soundcheck_time: '18:00', door_time: '19:00', set_time: '20:30', set_length_min: 90, end_time: null });
    expect(s.map(x => x.label)).toEqual(['Load-in', 'Sound check', 'Doors', 'Set time', 'Set length', 'Done by']);
    expect(s.map(x => x.value)).toEqual(['5:00 PM', '6:00 PM', '7:00 PM', '8:30 PM', '1 hr 30 min', null]);
  });
  it('formats lengths', () => {
    expect(formatLength(45)).toBe('45 min');
    expect(formatLength(120)).toBe('2 hr');
  });
});

describe('dates', () => {
  const today = '2026-10-27';
  it('counts down', () => {
    expect(countdown('2026-10-27', today)).toBe('Tonight');
    expect(countdown('2026-10-28', today)).toBe('Tomorrow');
    expect(countdown('2026-11-08', today)).toBe('In 12 days');
    expect(countdown('2026-10-24', today)).toBe('3 days ago');
    expect(countdown(null, today)).toBeNull();
  });
  it('offers Mark as played only for past booked shows', () => {
    expect(canMarkPlayed('confirmed', '2026-10-20', today)).toBe(true);
    expect(canMarkPlayed('advancing', '2026-10-20', today)).toBe(true);
    expect(canMarkPlayed('confirmed', '2026-10-27', today)).toBe(false);
    expect(canMarkPlayed('completed', '2026-10-20', today)).toBe(false);
  });
  it('allows deleting only future, unpaid, unplayed shows', () => {
    expect(canDeleteShow({ status: 'pitch', show_date: '2026-12-01', actual_amount_received: null }, today)).toBe(true);
    expect(canDeleteShow({ status: 'completed', show_date: '2026-12-01', actual_amount_received: null }, today)).toBe(false);
    expect(canDeleteShow({ status: 'confirmed', show_date: '2026-10-01', actual_amount_received: null }, today)).toBe(false);
    expect(canDeleteShow({ status: 'confirmed', show_date: '2026-12-01', actual_amount_received: '50' }, today)).toBe(false);
  });
});

describe('money', () => {
  it('keeps payment status to the database values', () => {
    expect(toPaymentStatus('received')).toBe('received');
    expect(toPaymentStatus('partial')).toBeNull();
    expect(toPaymentStatus('waived')).toBeNull();
  });
  it('totals and formats', () => {
    expect(lineupTotal([{ amount: 150 }, { amount: 200.5 }])).toBe(350.5);
    expect(dollars(1250)).toBe('$1,250');
    expect(dollars('0')).toBe('$0');
    expect(dollars(null)).toBeNull();
  });
  it('parses money inputs', () => {
    expect(parseMoneyInput('')).toEqual({ ok: true, value: null });
    expect(parseMoneyInput('$1,250.50')).toEqual({ ok: true, value: 1250.5 });
    expect(parseMoneyInput('0')).toEqual({ ok: true, value: 0 });
    expect(parseMoneyInput('-4')).toEqual({ ok: false });
    expect(parseMoneyInput('abc')).toEqual({ ok: false });
  });
});
