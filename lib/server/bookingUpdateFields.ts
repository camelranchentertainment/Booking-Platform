// lib/server/bookingUpdateFields.ts
//
// /api/bookings/update runs with the service role (RLS bypassed), so the
// fields a caller may change are an explicit allowlist. Anything else in the
// request — act_id, created_by, settled_by, money-received fields, ids — is
// dropped, never written. The band (act_id) always comes from the caller's
// profile, never from the body.

/** Show fields the website's booking editor (pages/bookings/[id].tsx) sends. */
export const BOOKING_EDITABLE_FIELDS = [
  'venue_id',
  'tour_id',
  'status',
  'show_date',
  'load_in_time',
  'soundcheck_time',
  'door_time',
  'set_time',
  'set_length_min',
  'end_time',
  'deal_type',
  'agreed_amount',
  'deal_notes',
  'internal_notes',
  'advance_notes',
  'contract_url',
  'deposit_paid',
  'deposit_amount',
] as const;

export type BookingEditableField = (typeof BOOKING_EDITABLE_FIELDS)[number];

/**
 * Keeps only allowlisted keys from an untrusted `updates` object.
 *
 * @returns `allowed` (safe to write) and `dropped` (key names, for logging)
 */
export function pickBookingUpdates(updates: unknown): {
  allowed: Partial<Record<BookingEditableField, unknown>>;
  dropped: string[];
} {
  const allowed: Partial<Record<BookingEditableField, unknown>> = {};
  const dropped: string[] = [];
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return { allowed, dropped };
  for (const [key, value] of Object.entries(updates as Record<string, unknown>)) {
    if ((BOOKING_EDITABLE_FIELDS as readonly string[]).includes(key)) {
      allowed[key as BookingEditableField] = value;
    } else {
      dropped.push(key);
    }
  }
  return { allowed, dropped };
}

/**
 * Parses an optional money amount from a request body. Unlike `x ? parseFloat(x) : null`,
 * a real 0 is kept as 0. Returns null for blank/absent and throws on garbage.
 */
export function parseOptionalAmount(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) throw new RangeError(`${field} must be a non-negative number`);
  return n;
}
