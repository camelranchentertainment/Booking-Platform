// __tests__/lib/booker/pricing.test.ts
import { bandsUntilNextTier, tierForBandCount } from '../../../lib/booker/pricing';

describe('tierForBandCount', () => {
  it.each([
    [0, 'standard', 35],
    [1, 'standard', 35],
    [19, 'standard', 35],
    [20, 'growth', 45],
    [49, 'growth', 45],
    [50, 'enterprise', null],
    [500, 'enterprise', null],
  ])('%i bands → %s ($%s)', (count, key, price) => {
    const t = tierForBandCount(count);
    expect(t.key).toBe(key);
    expect(t.monthlyUsd).toBe(price);
  });

  it('rejects negative or fractional counts', () => {
    expect(() => tierForBandCount(-1)).toThrow(RangeError);
    expect(() => tierForBandCount(2.5)).toThrow(RangeError);
  });
});

describe('bandsUntilNextTier', () => {
  it('counts down to the next tier and stops at the top', () => {
    expect(bandsUntilNextTier(17)).toBe(3);
    expect(bandsUntilNextTier(49)).toBe(1);
    expect(bandsUntilNextTier(50)).toBeNull();
  });
});
