// __tests__/lib/domain/betaProgram.test.ts
import {
  BETA_CAP, BETA_FREE_DAYS, betaApplicationSchema, betaTrialEndsAt,
  canGrantBetaYear, fieldErrors, isBetaOpen, spotsRemaining,
} from '../../../lib/domain/betaProgram';

const VALID = {
  applicantName: '  Jane Doe ',
  email: 'Jane.Doe@Example.COM',
  actName: 'The Example Band',
  genre: 'Alt-country',
  homeBase: 'Greeley, CO',
  showsPerYear: '25_75',
  bookingMethod: 'Spreadsheet and a lot of email',
  websiteUrl: '',
  agentName: '   ',
  feedbackAgreed: true,
};

describe('betaApplicationSchema', () => {
  it('accepts a valid application, trims text and lowercases email', () => {
    const r = betaApplicationSchema.safeParse(VALID);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.applicantName).toBe('Jane Doe');
    expect(r.data.email).toBe('jane.doe@example.com');
  });

  it('stores blank optional fields as null, never empty strings', () => {
    const r = betaApplicationSchema.parse(VALID);
    expect(r.websiteUrl).toBeNull();
    expect(r.agentName).toBeNull();
  });

  it('accepts an http(s) website and rejects other schemes', () => {
    expect(betaApplicationSchema.safeParse({ ...VALID, websiteUrl: 'https://band.example' }).success).toBe(true);
    const bad = betaApplicationSchema.safeParse({ ...VALID, websiteUrl: 'javascript:alert(1)' });
    expect(bad.success).toBe(false);
  });

  it('requires the feedback agreement to be exactly true', () => {
    expect(betaApplicationSchema.safeParse({ ...VALID, feedbackAgreed: false }).success).toBe(false);
    expect(betaApplicationSchema.safeParse({ ...VALID, feedbackAgreed: 'true' }).success).toBe(false);
  });

  it('rejects an unknown shows-per-year option', () => {
    expect(betaApplicationSchema.safeParse({ ...VALID, showsPerYear: 'lots' }).success).toBe(false);
  });

  it('rejects malformed emails and emails containing *', () => {
    expect(betaApplicationSchema.safeParse({ ...VALID, email: 'not-an-email' }).success).toBe(false);
    expect(betaApplicationSchema.safeParse({ ...VALID, email: 'a*b@example.com' }).success).toBe(false);
  });

  it('enforces the same length caps as the database', () => {
    expect(betaApplicationSchema.safeParse({ ...VALID, bookingMethod: 'x'.repeat(1001) }).success).toBe(false);
    expect(betaApplicationSchema.safeParse({ ...VALID, actName: 'x'.repeat(161) }).success).toBe(false);
  });

  it('maps errors to field names for inline display', () => {
    const r = betaApplicationSchema.safeParse({ ...VALID, actName: '', genre: '' });
    expect(r.success).toBe(false);
    if (r.success) return;
    const errs = fieldErrors(r.error);
    expect(errs.actName).toBe('Act name is required');
    expect(errs.genre).toBe('Genre is required');
  });
});

describe('spotsRemaining / isBetaOpen', () => {
  it('counts down from the cap and never goes negative', () => {
    expect(spotsRemaining(0)).toBe(BETA_CAP);
    expect(spotsRemaining(3)).toBe(BETA_CAP - 3);
    expect(spotsRemaining(BETA_CAP)).toBe(0);
    expect(spotsRemaining(BETA_CAP + 4)).toBe(0);
  });

  it('closes exactly when the cap is reached', () => {
    expect(isBetaOpen(BETA_CAP - 1)).toBe(true);
    expect(isBetaOpen(BETA_CAP)).toBe(false);
  });

  it('treats bad counts defensively', () => {
    expect(spotsRemaining(-5)).toBe(BETA_CAP);
    expect(spotsRemaining(2.7)).toBe(BETA_CAP - 2);
  });
});

describe('betaTrialEndsAt', () => {
  const NOW = Date.parse('2026-10-09T12:00:00.000Z');
  const YEAR_MS = BETA_FREE_DAYS * 86_400_000;

  it('grants a year from now when there is no current trial', () => {
    expect(betaTrialEndsAt(null, NOW)).toBe(new Date(NOW + YEAR_MS).toISOString());
  });

  it('grants a year from now when the current trial has already expired', () => {
    expect(betaTrialEndsAt('2026-01-01T00:00:00.000Z', NOW)).toBe(new Date(NOW + YEAR_MS).toISOString());
  });

  it('stacks on a trial that is still running so no days are lost', () => {
    const later = '2026-10-20T12:00:00.000Z';
    expect(betaTrialEndsAt(later, NOW)).toBe(new Date(Date.parse(later) + YEAR_MS).toISOString());
  });

  it('ignores an unparseable trial date', () => {
    expect(betaTrialEndsAt('not a date', NOW)).toBe(new Date(NOW + YEAR_MS).toISOString());
  });
});

describe('canGrantBetaYear', () => {
  it('allows band admins who are trialing, expired or unset', () => {
    expect(canGrantBetaYear({ role: 'band_admin', subscription_status: 'trialing' })).toBe(true);
    expect(canGrantBetaYear({ role: 'band_admin', subscription_status: 'canceled' })).toBe(true);
    expect(canGrantBetaYear({ role: 'band_admin', subscription_status: null })).toBe(true);
  });

  it('refuses paying subscribers so Stripe never double-bills a beta band', () => {
    expect(canGrantBetaYear({ role: 'band_admin', subscription_status: 'active' })).toBe(false);
  });

  it('refuses members and superadmins', () => {
    expect(canGrantBetaYear({ role: 'member', subscription_status: 'trialing' })).toBe(false);
    expect(canGrantBetaYear({ role: 'superadmin', subscription_status: null })).toBe(false);
  });
});
