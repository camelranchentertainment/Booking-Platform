// lib/domain/signupCode.ts
// Pure rules for signup codes. No I/O, so it is trivially unit-testable.

export const SIGNUP_CODE_PATTERN = /^[A-Z0-9_-]{4,40}$/;

/**
 * Normalises what a person typed into the canonical stored form
 * (trimmed, upper-case).
 *
 * @returns null when the input is empty/whitespace (meaning "no code entered")
 * @throws never — an invalid shape is reported by {@link isValidSignupCodeShape}
 */
export function normalizeSignupCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().toUpperCase();
  return trimmed === '' ? null : trimmed;
}

/** True when the normalised code could exist (right characters and length). */
export function isValidSignupCodeShape(code: string): boolean {
  return SIGNUP_CODE_PATTERN.test(code);
}

/** Error codes raised by the redeem_signup_code SQL function. */
export type RedeemErrorCode = 'code_unknown' | 'code_unavailable' | 'already_redeemed' | 'not_eligible';

const REDEEM_ERROR_CODES: readonly RedeemErrorCode[] = [
  'code_unknown', 'code_unavailable', 'already_redeemed', 'not_eligible',
];

/** Extracts the redeem error code from a Postgres/PostgREST error message, or null if it is some other failure. */
export function parseRedeemError(message: string | undefined | null): RedeemErrorCode | null {
  if (!message) return null;
  return REDEEM_ERROR_CODES.find(c => message.includes(c)) ?? null;
}

/** Remaining redemptions, never negative. */
export function usesRemaining(uses: number, maxUses: number): number {
  return Math.max(0, maxUses - uses);
}
