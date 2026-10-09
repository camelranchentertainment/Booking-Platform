// lib/domain/betaProgram.ts
// Founding beta program rules shared by the public apply route, the admin
// review route and registration. Pure functions only — no I/O — so every rule
// here is unit-tested in __tests__/lib/domain/betaProgram.test.ts.

import { z } from 'zod';

/** Number of founding bands. The homepage offer hides itself once this many are approved. */
export const BETA_CAP = 10;

/** Length of the free Band Admin membership granted on approval. */
export const BETA_FREE_DAYS = 365;

const DAY_MS = 86_400_000;

export const SHOWS_PER_YEAR_OPTIONS = [
  { value: 'under_25', label: 'Under 25' },
  { value: '25_75',    label: '25–75' },
  { value: '75_plus',  label: '75+' },
] as const;

export type ShowsPerYear = (typeof SHOWS_PER_YEAR_OPTIONS)[number]['value'];

/** Empty or whitespace-only optional fields are stored as null, never ''. */
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform(v => (v ? v : null));

/**
 * Validates a public beta application. Limits mirror the CHECK constraints in
 * supabase/migrations/20261009170000_beta_applications.sql, so a payload that
 * passes here never trips a database constraint.
 */
export const betaApplicationSchema = z.object({
  applicantName:  z.string().trim().min(1, 'Your name is required').max(120),
  // Lowercased so lookups can match exactly; * is refused because PostgREST
  // treats it as a wildcard in the case-insensitive profile lookup.
  email:          z.string().trim().toLowerCase().max(254)
                    .pipe(z.email('Enter a valid email address'))
                    .refine(v => !v.includes('*'), 'Enter a valid email address'),
  actName:        z.string().trim().min(1, 'Act name is required').max(160),
  genre:          z.string().trim().min(1, 'Genre is required').max(80),
  homeBase:       z.string().trim().min(1, 'Home base is required').max(120),
  showsPerYear:   z.enum(['under_25', '25_75', '75_plus'], { message: 'Pick roughly how many shows you play a year' }),
  bookingMethod:  z.string().trim().min(1, 'Tell us how you book shows today').max(1000),
  websiteUrl:     optionalText(300).refine(
    v => v === null || /^https?:\/\/\S+$/i.test(v),
    'Website must start with http:// or https://',
  ),
  agentName:      optionalText(160),
  feedbackAgreed: z.literal(true, { message: 'Please agree to share feedback during the beta' }),
});

export type BetaApplicationInput = z.input<typeof betaApplicationSchema>;
export type BetaApplication = z.output<typeof betaApplicationSchema>;

/** Field name → first error message, for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Spots left given the number of approved applications. Never negative. */
export function spotsRemaining(approvedCount: number, cap: number = BETA_CAP): number {
  return Math.max(0, cap - Math.max(0, Math.floor(approvedCount)));
}

/** The offer is open while at least one spot remains. */
export function isBetaOpen(approvedCount: number, cap: number = BETA_CAP): boolean {
  return spotsRemaining(approvedCount, cap) > 0;
}

/**
 * New trial end for a beta grant: a full year from whichever is later, now or
 * the account's current trial end — so a band mid-trial never loses days.
 */
export function betaTrialEndsAt(currentTrialEndsAt: string | null | undefined, now: number = Date.now()): string {
  const current = currentTrialEndsAt ? Date.parse(currentTrialEndsAt) : NaN;
  const base = Number.isFinite(current) ? Math.max(current, now) : now;
  return new Date(base + BETA_FREE_DAYS * DAY_MS).toISOString();
}

/**
 * Whether a profile can receive the free year automatically. Paying
 * subscribers are excluded: their Stripe subscription would keep billing, so
 * those need a manual credit in Stripe instead.
 */
export function canGrantBetaYear(profile: { role?: string | null; subscription_status?: string | null }): boolean {
  if (profile.role !== 'band_admin') return false;
  return profile.subscription_status !== 'active';
}
