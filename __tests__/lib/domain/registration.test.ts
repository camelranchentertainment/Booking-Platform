import { validateRegistration } from '../../../lib/domain/registration';

const VALID = { email: 'a@b.com', password: 'pass1234', role: 'act_admin', displayName: 'Jake' };

describe('validateRegistration', () => {
  it('returns valid for a correct act_admin registration', () => {
    expect(validateRegistration(VALID)).toEqual({ valid: true });
  });

  it('rejects missing email', () => {
    const r = validateRegistration({ ...VALID, email: '' });
    expect(r.valid).toBe(false);
    expect(r.error).toBe('Missing required fields');
  });

  it('rejects missing password', () => {
    const r = validateRegistration({ ...VALID, password: undefined });
    expect(r.valid).toBe(false);
  });

  it('rejects missing displayName', () => {
    const r = validateRegistration({ ...VALID, displayName: '' });
    expect(r.valid).toBe(false);
  });

  it('rejects missing role', () => {
    const r = validateRegistration({ ...VALID, role: '' });
    expect(r.valid).toBe(false);
  });

  it('rejects agent role', () => {
    const r = validateRegistration({ ...VALID, role: 'agent' });
    expect(r.valid).toBe(false);
    expect(r.error).toBe('Invalid role');
  });

  it('rejects superadmin role (cannot self-register)', () => {
    const r = validateRegistration({ ...VALID, role: 'superadmin' });
    expect(r.valid).toBe(false);
    expect(r.error).toBe('Invalid role');
  });

  it('rejects member role (invite-only, not self-register)', () => {
    const r = validateRegistration({ ...VALID, role: 'member' });
    expect(r.valid).toBe(false);
    expect(r.error).toBe('Invalid role');
  });

  it('rejects invalid planTier', () => {
    const r = validateRegistration({ ...VALID, planTier: 'agent_tier' });
    expect(r.valid).toBe(false);
    expect(r.error).toBe('Invalid plan tier');
  });

  it('accepts valid planTier band_admin', () => {
    expect(validateRegistration({ ...VALID, planTier: 'band_admin' })).toEqual({ valid: true });
  });

  it('accepts undefined planTier', () => {
    expect(validateRegistration({ ...VALID, planTier: undefined })).toEqual({ valid: true });
  });
});
