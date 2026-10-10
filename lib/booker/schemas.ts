// lib/booker/schemas.ts
// Form validation for the Booking Agent workspace. Each schema takes the raw
// form values (strings from inputs) and returns a payload ready to write to the
// matching booker_* table. Limits mirror the database CHECK constraints, so a
// value that passes here will not be rejected by Postgres.
//
// The database (RLS + constraints) is the real security boundary; this layer
// exists to give the person a clear message before anything is sent.

import { z } from 'zod';
import { DEAL_TYPES, PAYMENT_METHODS, ROSTER_STATUSES, SHOW_STATUSES } from './types';
import { isIsoDate } from './dates';

/** Blank (or whitespace-only) input becomes null; otherwise trimmed. */
function blankToNull(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? null : t;
  }
  return value;
}

const requiredText = (label: string, max: number) =>
  z.preprocess(
    v => (typeof v === 'string' ? v.trim() : v),
    z.string({ error: `${label} is required` }).min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`),
  );

const optionalText = (label: string, max: number) =>
  z.preprocess(blankToNull, z.string().max(max, `${label} must be ${max} characters or fewer`).nullable());

const optionalEmail = (label: string) =>
  z.preprocess(blankToNull, z.email(`${label} must be a valid email address`).max(254).nullable());

/** Accepts "", "12", "12.5", 12 → number | null within [min, max]. */
const optionalNumber = (label: string, min: number, max: number, opts: { integer?: boolean } = {}) =>
  z.preprocess(
    v => {
      const b = blankToNull(v);
      if (b === null) return null;
      if (typeof b === 'string') return Number(b.replace(/[$,\s]/g, ''));
      return b;
    },
    z
      .number({ error: `${label} must be a number` })
      .refine(n => Number.isFinite(n), `${label} must be a number`)
      .refine(n => !opts.integer || Number.isInteger(n), `${label} must be a whole number`)
      .refine(n => n >= min && n <= max, `${label} must be between ${min} and ${max}`)
      .nullable(),
  );

const percent = (label: string) => optionalNumber(label, 0, 100);
const money = (label: string) => optionalNumber(label, 0, 99_999_999);

const isoDate = (label: string) =>
  z.preprocess(
    v => (typeof v === 'string' ? v.trim() : v),
    z.string({ error: `${label} is required` }).refine(isIsoDate, `${label} must be a valid date`),
  );

const optionalIsoDate = (label: string) =>
  z.preprocess(blankToNull, z.string().refine(isIsoDate, `${label} must be a valid date`).nullable());

/** "7:30", "19:30" or "19:30:00" → "19:30"; blank → null. */
const optionalTime = (label: string) =>
  z.preprocess(
    blankToNull,
    z
      .string()
      .regex(/^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, `${label} must be a time like 19:30`)
      .transform(t => t.slice(0, 5).padStart(5, '0'))
      .nullable(),
  );

const optionalUuid = z.preprocess(blankToNull, z.uuid().nullable());

// ── Agent profile ───────────────────────────────────────────────────────────
export const BookerProfileSchema = z.object({
  agency_name: requiredText('Agency name', 120),
  contact_name: optionalText('Your name', 120),
  contact_email: optionalEmail('Email'),
  contact_phone: optionalText('Phone', 40),
  default_commission_pct: percent('Default commission'),
});
export type BookerProfileInput = z.infer<typeof BookerProfileSchema>;

// ── Roster band ─────────────────────────────────────────────────────────────
export const RosterBandSchema = z.object({
  band_name: requiredText('Band name', 120),
  genre: optionalText('Genre', 80),
  home_city: optionalText('City', 100),
  home_state: optionalText('State', 100),
  contact_name: optionalText('Contact name', 120),
  contact_email: optionalEmail('Contact email'),
  contact_phone: optionalText('Contact phone', 40),
  commission_pct: percent('Commission'),
  color: z.preprocess(blankToNull, z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex color').nullable()),
  notes: optionalText('Notes', 5000),
  status: z.enum(ROSTER_STATUSES).default('active'),
});
export type RosterBandInput = z.infer<typeof RosterBandSchema>;

// ── Venue ───────────────────────────────────────────────────────────────────
export const VenueSchema = z.object({
  name: requiredText('Venue name', 160),
  address: optionalText('Address', 200),
  city: optionalText('City', 100),
  state: optionalText('State', 100),
  postal_code: optionalText('ZIP', 20),
  capacity: optionalNumber('Capacity', 0, 200_000, { integer: true }),
  website: optionalText('Website', 300),
  notes: optionalText('Notes', 5000),
});
export type VenueInput = z.infer<typeof VenueSchema>;

// ── Contact ─────────────────────────────────────────────────────────────────
export const ContactSchema = z.object({
  venue_id: optionalUuid,
  name: requiredText('Name', 120),
  title: optionalText('Title', 80),
  email: optionalEmail('Email'),
  phone: optionalText('Phone', 40),
  notes: optionalText('Notes', 5000),
});
export type ContactInput = z.infer<typeof ContactSchema>;

// ── Show ────────────────────────────────────────────────────────────────────
export const ShowSchema = z
  .object({
    roster_id: z.uuid('Choose a band'),
    venue_id: optionalUuid,
    venue_name: optionalText('Venue name', 160),
    venue_city: optionalText('Venue city', 100),
    show_date: isoDate('Show date'),
    load_in_time: optionalTime('Load-in'),
    door_time: optionalTime('Doors'),
    set_time: optionalTime('Set time'),
    set_length_min: optionalNumber('Set length', 1, 600, { integer: true }),
    status: z.enum(SHOW_STATUSES).default('hold'),
    deal_type: z.preprocess(blankToNull, z.enum(DEAL_TYPES).nullable()),
    fee: money('Fee'),
    actual_amount: money('Amount received'),
    commission_pct_override: percent('Commission override'),
    deal_notes: optionalText('Deal notes', 5000),
    internal_notes: optionalText('Internal notes', 5000),
    followup_on: optionalIsoDate('Follow-up date'),
  })
  .superRefine((v, ctx) => {
    if (!v.venue_id && !v.venue_name) {
      ctx.addIssue({ code: 'custom', path: ['venue_name'], message: 'Choose a saved venue or type a venue name' });
    }
  })
  // A saved venue wins; the free-text fields are only for venues not in the book.
  .transform(v => (v.venue_id ? { ...v, venue_name: null, venue_city: null } : v));
export type ShowInput = z.infer<typeof ShowSchema>;

// ── Commission payment ──────────────────────────────────────────────────────
export const PaymentSchema = z.object({
  show_id: z.uuid('Choose a show'),
  amount: z.preprocess(
    v => (typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '') || NaN) : v),
    z
      .number({ error: 'Amount must be a number' })
      .refine(n => Number.isFinite(n) && n > 0, 'Amount must be more than zero')
      .refine(n => n <= 99_999_999, 'Amount is too large'),
  ),
  method: z.enum(PAYMENT_METHODS, { error: 'Choose how it was paid' }),
  paid_on: isoDate('Date paid'),
  notes: optionalText('Notes', 1000),
});
export type PaymentInput = z.infer<typeof PaymentSchema>;

// ── Agent-only signup ───────────────────────────────────────────────────────
export const BookerSignupSchema = z.object({
  email: z.preprocess(v => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.email('Enter a valid email address').max(254)),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be 72 characters or fewer'),
  displayName: requiredText('Your name', 120),
  agencyName: requiredText('Agency name', 120),
});
export type BookerSignupInput = z.infer<typeof BookerSignupSchema>;

/** First validation message, for showing one clear error at a time. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Please check the form and try again';
}

/** Validation messages keyed by field name (first message per field). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
