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

const VALID_ROLES = ['act_admin'];
const VALID_PLAN_TIERS = ['band_admin'];

export function validateRegistration(input: RegistrationInput): ValidationResult {
  const { email, password, role, displayName, planTier } = input;

  if (!email || !password || !role || !displayName) {
    return { valid: false, error: 'Missing required fields' };
  }

  if (!VALID_ROLES.includes(role)) {
    return { valid: false, error: 'Invalid role' };
  }

  if (planTier !== undefined && !VALID_PLAN_TIERS.includes(planTier)) {
    return { valid: false, error: 'Invalid plan tier' };
  }

  return { valid: true };
}
