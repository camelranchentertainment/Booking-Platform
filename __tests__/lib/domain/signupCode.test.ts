import {
  isValidSignupCodeShape, normalizeSignupCode, parseRedeemError, usesRemaining,
} from '../../../lib/domain/signupCode';

describe('normalizeSignupCode', () => {
  it('trims and upper-cases', () => expect(normalizeSignupCode('  betacrb26 ')).toBe('BETACRB26'));
  it.each([['', null], ['   ', null], [undefined, null], [null, null], [42, null]])('treats %p as no code', (v, out) => {
    expect(normalizeSignupCode(v)).toBe(out);
  });
});

describe('isValidSignupCodeShape', () => {
  it('accepts letters, digits, - and _', () => expect(isValidSignupCodeShape('BETA_crb-26'.toUpperCase())).toBe(true));
  it.each(['ABC', 'HAS SPACE', 'BAD!CHAR', 'A'.repeat(41), "X'; DROP TABLE--"])('rejects %p', v => {
    expect(isValidSignupCodeShape(v)).toBe(false);
  });
});

describe('parseRedeemError', () => {
  it.each(['code_unknown', 'code_unavailable', 'already_redeemed', 'not_eligible'])('recognises %s', c => {
    expect(parseRedeemError(`ERROR: ${c}`)).toBe(c);
  });
  it('returns null for unrelated errors', () => {
    expect(parseRedeemError('connection reset')).toBeNull();
    expect(parseRedeemError(undefined)).toBeNull();
  });
});

describe('usesRemaining', () => {
  it('counts down and never goes negative', () => {
    expect(usesRemaining(3, 10)).toBe(7);
    expect(usesRemaining(11, 10)).toBe(0);
  });
});
