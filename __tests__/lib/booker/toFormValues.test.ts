// __tests__/lib/booker/toFormValues.test.ts
import { toFormValues } from '../../../lib/booker/useLoad';

describe('toFormValues', () => {
  it('turns nulls into empty strings, numbers into text and trims Postgres seconds off times', () => {
    const row = { name: 'Hall', capacity: 250, notes: null, set_time: '19:30:00' };
    expect(toFormValues(row, ['name', 'capacity', 'notes', 'set_time', 'missing'] as const)).toEqual({
      name: 'Hall',
      capacity: '250',
      notes: '',
      set_time: '19:30',
      missing: '',
    });
  });

  it('returns blank values for a new record', () => {
    expect(toFormValues(null, ['a', 'b'] as const)).toEqual({ a: '', b: '' });
  });
});
