export type RegistrationRole = 'act_admin';

const VALID_ROLES: RegistrationRole[] = ['act_admin'];
const VALID_PLAN_TIERS = ['band_admin'];

export interface RegistrationInput {
  email?: string;
  password?: string;
  role?: string;
  displayName?: string;
  planTier?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Pure validation — no framework or DB dependency
export function validateRegistration(input: RegistrationInput): ValidationResult {
  if (!input.email || !input.password || !input.role || !input.displayName) {
    return { valid: false, error: 'Missing required fields' };
  }
  if (!(VALID_ROLES as string[]).includes(input.role)) {
    return { valid: false, error: 'Invalid role' };
  }
  if (input.planTier && !VALID_PLAN_TIERS.includes(input.planTier)) {
    return { valid: false, error: 'Invalid plan tier' };
  }
  return { valid: true };
}
