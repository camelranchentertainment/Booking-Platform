// lib/server/agentVenueActions.ts
//
// Agent venue + venue-contact management. Staged for approval like every agent
// write; executed by /api/help/actions/execute ('venue_upsert',
// 'contact_upsert'). Everything is scoped to the caller's band: venues by
// venues.act_id, contacts through their venue.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// ── Venues ──────────────────────────────────────────────────────────────────

const optText = (max: number) => z.string().trim().max(max).nullable().optional();
const optEmail = z.string().trim().toLowerCase().email('That email address doesn\'t look right').nullable().optional();

export const VENUE_FIELDS = [
  'name', 'city', 'state', 'address', 'zip', 'phone', 'email', 'website', 'venue_type', 'capacity',
  'booking_contact', 'notes', 'backline_notes', 'pay_notes', 'secondary_emails', 'live_music',
] as const;
type VenueField = (typeof VENUE_FIELDS)[number];
type VenueValue = string | number | boolean | string[] | null;

export const venueUpsertSchema = z.object({
  venue_id: z.string().uuid('Look the venue up first so I have its id').optional(),
  name: z.string().trim().min(1).max(200).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  state: z.string().trim().min(1).max(60).optional(),
  address: optText(300),
  zip: optText(20),
  phone: optText(40),
  email: optEmail,
  website: optText(300),
  venue_type: optText(80),
  capacity: z.number().int().min(0).max(1_000_000).nullable().optional(),
  booking_contact: optText(200),
  notes: optText(5000),
  backline_notes: optText(2000),
  pay_notes: optText(2000),
  secondary_emails: z.array(z.string().trim().toLowerCase().email('One of the extra email addresses doesn\'t look right')).max(10).nullable().optional(),
  live_music: z.boolean().optional(),
});

export interface VenueUpsertPayload {
  mode: 'create' | 'update';
  venue_id?: string;
  venue_name: string;
  changes: Partial<Record<VenueField, VenueValue>>;
  previous: Partial<Record<VenueField, VenueValue>>;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  return (a ?? null) === (b ?? null);
}

/**
 * Validates a venue create/edit and builds the staged payload.
 * Create needs name, city and state and refuses a duplicate name+city in the
 * band. Update keeps only fields that actually change.
 *
 * @throws Error with a user-facing message
 */
export async function buildVenueUpsertPayload(service: SupabaseClient, actId: string, raw: unknown): Promise<VenueUpsertPayload> {
  const parsed = venueUpsertSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'That venue change is not valid.');
  const args = parsed.data;

  const given: Partial<Record<VenueField, VenueValue>> = {};
  for (const k of VENUE_FIELDS) if (args[k] !== undefined) given[k] = args[k] as VenueValue;

  if (!args.venue_id) {
    if (!args.name || !args.city || !args.state) throw new Error('A new venue needs a name, city and state.');
    const { data: dupes, error } = await service
      .from('venues')
      .select('id, name, city')
      .eq('act_id', actId)
      .ilike('name', args.name.replace(/[%_\\]/g, m => `\\${m}`))
      .ilike('city', args.city.replace(/[%_\\]/g, m => `\\${m}`))
      .limit(1);
    if (error) throw new Error(`Venue lookup failed: ${error.message}`);
    if (dupes && dupes.length > 0) {
      throw new Error(`${args.name} in ${args.city} is already saved. I'll update that venue instead if you tell me what to change.`);
    }
    return { mode: 'create', venue_name: args.name, changes: given, previous: {} };
  }

  const { data: venue, error } = await service
    .from('venues')
    .select(['id', ...VENUE_FIELDS].join(', '))
    .eq('id', args.venue_id)
    .eq('act_id', actId)
    .maybeSingle();
  if (error) throw new Error(`Venue lookup failed: ${error.message}`);
  if (!venue) throw new Error("That venue wasn't found for this band.");
  const current = venue as unknown as Record<VenueField, VenueValue> & { id: string };

  const changes: VenueUpsertPayload['changes'] = {};
  const previous: VenueUpsertPayload['previous'] = {};
  for (const [k, v] of Object.entries(given) as Array<[VenueField, VenueValue]>) {
    if (sameValue(v, current[k])) continue;
    changes[k] = v;
    previous[k] = current[k] ?? null;
  }
  if (Object.keys(changes).length === 0) throw new Error('Nothing would change on that venue.');
  return { mode: 'update', venue_id: current.id, venue_name: String(current.name ?? ''), changes, previous };
}

/**
 * Applies an approved venue create/edit. Re-validates; whitelisted columns only.
 *
 * @throws Error when invalid or the write fails / finds no venue
 */
export async function executeVenueUpsert(service: SupabaseClient, actId: string, userId: string, payload: unknown) {
  const p = payload as Partial<VenueUpsertPayload> | null;
  const checked = venueUpsertSchema.safeParse({ ...(p?.changes ?? {}), venue_id: p?.mode === 'update' ? p?.venue_id : undefined });
  if (!checked.success || (p?.mode !== 'create' && p?.mode !== 'update')) {
    throw new Error('This venue change is no longer valid. Ask the assistant again.');
  }
  const row: Record<string, VenueValue> = {};
  for (const k of VENUE_FIELDS) if (checked.data[k] !== undefined) row[k] = checked.data[k] as VenueValue;
  const now = new Date().toISOString();

  if (p.mode === 'create') {
    if (!row.name || !row.city || !row.state) throw new Error('A new venue needs a name, city and state.');
    const { data, error } = await service
      .from('venues')
      .insert({ ...row, act_id: actId, created_by: userId, source: 'agent', created_at: now, updated_at: now })
      .select('id, name, city, state')
      .single();
    if (error) throw new Error(`Could not save the venue: ${error.message}`);
    return data;
  }

  const { data, error } = await service
    .from('venues')
    .update({ ...row, updated_at: now })
    .eq('id', checked.data.venue_id as string)
    .eq('act_id', actId)
    .select('id, name, city, state')
    .maybeSingle();
  if (error) throw new Error(`Could not update the venue: ${error.message}`);
  if (!data) throw new Error("That venue wasn't found for this band.");
  return data;
}

// ── Contacts ────────────────────────────────────────────────────────────────

export const CONTACT_STATUSES = ['not_contacted', 'pitched', 'responded', 'negotiating', 'booked', 'declined', 'do_not_contact'] as const;
export const CONTACT_FIELDS = ['first_name', 'last_name', 'title', 'email', 'phone', 'notes', 'status'] as const;
type ContactField = (typeof CONTACT_FIELDS)[number];

export const contactUpsertSchema = z.object({
  venue_id: z.string().uuid('Look the venue up first so I have its id'),
  contact_id: z.string().uuid().optional(),
  first_name: z.string().trim().max(100).optional(),
  last_name: z.string().trim().max(100).optional(),
  title: optText(120),
  email: optEmail,
  phone: optText(40),
  notes: optText(2000),
  status: z.enum(CONTACT_STATUSES).optional(),
});

export interface ContactUpsertPayload {
  mode: 'create' | 'update';
  venue_id: string;
  venue_name: string;
  contact_id?: string;
  contact_label: string;
  changes: Partial<Record<ContactField, string | null>>;
  previous: Partial<Record<ContactField, string | null>>;
}

/**
 * Validates a contact create/edit for one of the band's venues and builds the
 * staged payload. A new contact needs a name or an email; an email already
 * saved on another of the band's contacts is refused (so one sender maps to
 * one venue in the inbox).
 *
 * @throws Error with a user-facing message
 */
export async function buildContactUpsertPayload(service: SupabaseClient, actId: string, raw: unknown): Promise<ContactUpsertPayload> {
  const parsed = contactUpsertSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'That contact is not valid.');
  const args = parsed.data;

  const { data: venue, error: vErr } = await service
    .from('venues').select('id, name').eq('id', args.venue_id).eq('act_id', actId).maybeSingle();
  if (vErr) throw new Error(`Venue lookup failed: ${vErr.message}`);
  if (!venue) throw new Error("That venue wasn't found for this band.");
  const venueName = String((venue as { name: string }).name ?? '');

  const given: Partial<Record<ContactField, string | null>> = {};
  for (const k of CONTACT_FIELDS) if (args[k] !== undefined) given[k] = (args[k] as string | null) ?? null;

  if (given.email) {
    let q = service
      .from('contacts')
      .select('id, venue:venues!inner(act_id, name)')
      .eq('venue.act_id', actId)
      .ilike('email', given.email.replace(/[%_\\]/g, m => `\\${m}`));
    if (args.contact_id) q = q.neq('id', args.contact_id);
    const { data: dupes, error } = await q.limit(1);
    if (error) throw new Error(`Contact lookup failed: ${error.message}`);
    if (dupes && dupes.length > 0) {
      const v = (dupes[0] as { venue: { name?: string } | { name?: string }[] }).venue;
      const at = Array.isArray(v) ? v[0]?.name : v?.name;
      throw new Error(`${given.email} is already saved as a contact${at ? ` at ${at}` : ''}.`);
    }
  }

  const label = (c: Partial<Record<ContactField, string | null>>) =>
    [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'contact';

  if (!args.contact_id) {
    if (!given.first_name && !given.last_name && !given.email) throw new Error('A new contact needs at least a name or an email.');
    return { mode: 'create', venue_id: args.venue_id, venue_name: venueName, contact_label: label(given), changes: given, previous: {} };
  }

  const { data: contact, error: cErr } = await service
    .from('contacts')
    .select('id, first_name, last_name, title, email, phone, notes, status')
    .eq('id', args.contact_id)
    .eq('venue_id', args.venue_id)
    .maybeSingle();
  if (cErr) throw new Error(`Contact lookup failed: ${cErr.message}`);
  if (!contact) throw new Error("That contact wasn't found at this venue.");
  const current = contact as Record<ContactField, string | null>;

  const changes: ContactUpsertPayload['changes'] = {};
  const previous: ContactUpsertPayload['previous'] = {};
  for (const [k, v] of Object.entries(given) as Array<[ContactField, string | null]>) {
    if ((v ?? null) === (current[k] ?? null)) continue;
    changes[k] = v;
    previous[k] = current[k] ?? null;
  }
  if (Object.keys(changes).length === 0) throw new Error('Nothing would change on that contact.');
  return { mode: 'update', venue_id: args.venue_id, venue_name: venueName, contact_id: args.contact_id, contact_label: label(current), changes, previous };
}

/**
 * Applies an approved contact create/edit. Re-checks the venue belongs to the
 * band; whitelisted columns only.
 *
 * @throws Error when invalid or the write fails
 */
export async function executeContactUpsert(service: SupabaseClient, actId: string, payload: unknown) {
  const p = payload as Partial<ContactUpsertPayload> | null;
  const checked = contactUpsertSchema.safeParse({
    ...(p?.changes ?? {}), venue_id: p?.venue_id, contact_id: p?.mode === 'update' ? p?.contact_id : undefined,
  });
  if (!checked.success || (p?.mode !== 'create' && p?.mode !== 'update')) {
    throw new Error('This contact change is no longer valid. Ask the assistant again.');
  }
  const { data: venue, error: vErr } = await service
    .from('venues').select('id').eq('id', checked.data.venue_id).eq('act_id', actId).maybeSingle();
  if (vErr) throw new Error(`Venue lookup failed: ${vErr.message}`);
  if (!venue) throw new Error("That venue wasn't found for this band.");

  const row: Record<string, string | null> = {};
  for (const k of CONTACT_FIELDS) if (checked.data[k] !== undefined) row[k] = (checked.data[k] as string | null) ?? null;
  const now = new Date().toISOString();

  if (p.mode === 'create') {
    const { data, error } = await service
      .from('contacts')
      .insert({ ...row, first_name: row.first_name ?? '', last_name: row.last_name ?? '', venue_id: checked.data.venue_id, created_at: now, updated_at: now })
      .select('id, first_name, last_name, email')
      .single();
    if (error) throw new Error(`Could not save the contact: ${error.message}`);
    return data;
  }

  const { data, error } = await service
    .from('contacts')
    .update({ ...row, updated_at: now })
    .eq('id', checked.data.contact_id as string)
    .eq('venue_id', checked.data.venue_id)
    .select('id, first_name, last_name, email')
    .maybeSingle();
  if (error) throw new Error(`Could not update the contact: ${error.message}`);
  if (!data) throw new Error("That contact wasn't found at this venue.");
  return data;
}
