// lib/booker/data.ts
// Browser-side data access for the Booking Agent workspace.
//
// Every call goes through the signed-in user's Supabase session, so Row Level
// Security on the booker_* tables decides what is visible and writable: an agent
// can only ever reach their own rows. Nothing here uses the service role.
//
// Rows are never hard-deleted (the database grants no DELETE); "remove" sets
// deleted_at so history, especially money, is kept.

import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import type {
  BookerContact,
  BookerProfile,
  BookerShow,
  BookerVenue,
  CommissionPayment,
  RosterBand,
} from './types';
import type {
  BookerProfileInput,
  ContactInput,
  PaymentInput,
  RosterBandInput,
  ShowInput,
  VenueInput,
} from './schemas';

/** A failed workspace call, with a message safe to show the person. */
export class BookerDataError extends Error {
  constructor(
    message: string,
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'BookerDataError';
    Object.setPrototypeOf(this, BookerDataError.prototype);
  }
}

/** Turns a PostgREST error into a plain-language message. Raw DB text is logged, not shown. */
export function toBookerDataError(err: PostgrestError, action: string): BookerDataError {
  console.error(`[booker] ${action} failed`, { code: err.code, message: err.message });
  switch (err.code) {
    case '42501': // insufficient privilege / RLS
      return new BookerDataError('You do not have access to that. Try signing out and back in.', err.code);
    case '23503': // foreign key
      return new BookerDataError('That band, venue or show no longer exists. Refresh and try again.', err.code);
    case '23505': // unique
      return new BookerDataError('That already exists.', err.code);
    case '23514': // check constraint
      return new BookerDataError('One of the values is out of range. Check the form and try again.', err.code);
    case 'PGRST116': // no rows for .single()
      return new BookerDataError('That record could not be found.', err.code);
    default:
      return new BookerDataError(`Could not ${action}. Check your connection and try again.`, err.code ?? null);
  }
}

async function run<T>(action: string, query: PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw toBookerDataError(error, action);
  if (data === null) throw new BookerDataError(`Could not ${action}.`);
  return data;
}

const nowIso = () => new Date().toISOString();

// ── Agent profile ───────────────────────────────────────────────────────────

/** The signed-in user's agent profile, or null when they have not set one up. */
export async function getMyBookerProfile(userId: string): Promise<BookerProfile | null> {
  const { data, error } = await supabase
    .from('booker_profiles')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw toBookerDataError(error, 'load your agent profile');
  return (data as BookerProfile | null) ?? null;
}

export function createBookerProfile(userId: string, input: BookerProfileInput): Promise<BookerProfile> {
  return run('set up your agent workspace', supabase.from('booker_profiles').insert({ ...input, user_id: userId }).select('*').single());
}

export function updateBookerProfile(id: string, input: BookerProfileInput): Promise<BookerProfile> {
  return run('save your agent profile', supabase.from('booker_profiles').update(input).eq('id', id).select('*').single());
}

// ── Generic owned-table helpers ─────────────────────────────────────────────

type OwnedTable = 'booker_roster' | 'booker_venues' | 'booker_contacts' | 'booker_shows' | 'booker_commission_payments';

function listActive<T>(table: OwnedTable, action: string, order: { column: string; ascending: boolean }): Promise<T[]> {
  return run<T[]>(action, supabase.from(table).select('*').is('deleted_at', null).order(order.column, { ascending: order.ascending }));
}

function insertOwned<T>(table: OwnedTable, bookerId: string, input: object, action: string): Promise<T> {
  return run<T>(action, supabase.from(table).insert({ ...input, booker_id: bookerId }).select('*').single());
}

function updateOwned<T>(table: OwnedTable, id: string, input: object, action: string): Promise<T> {
  return run<T>(action, supabase.from(table).update(input).eq('id', id).is('deleted_at', null).select('*').single());
}

function archiveOwned<T>(table: OwnedTable, id: string, action: string): Promise<T> {
  return run<T>(action, supabase.from(table).update({ deleted_at: nowIso() }).eq('id', id).is('deleted_at', null).select('*').single());
}

// ── Roster ──────────────────────────────────────────────────────────────────
export const listRoster = () => listActive<RosterBand>('booker_roster', 'load your bands', { column: 'band_name', ascending: true });
export const createRosterBand = (bookerId: string, input: RosterBandInput) =>
  insertOwned<RosterBand>('booker_roster', bookerId, input, 'add the band');
export const updateRosterBand = (id: string, input: RosterBandInput) => updateOwned<RosterBand>('booker_roster', id, input, 'save the band');
export const archiveRosterBand = (id: string) => archiveOwned<RosterBand>('booker_roster', id, 'remove the band');

// ── Venues ──────────────────────────────────────────────────────────────────
export const listVenues = () => listActive<BookerVenue>('booker_venues', 'load your venues', { column: 'name', ascending: true });
export const createVenue = (bookerId: string, input: VenueInput) => insertOwned<BookerVenue>('booker_venues', bookerId, input, 'add the venue');
export const updateVenue = (id: string, input: VenueInput) => updateOwned<BookerVenue>('booker_venues', id, input, 'save the venue');
export const archiveVenue = (id: string) => archiveOwned<BookerVenue>('booker_venues', id, 'remove the venue');

// ── Contacts ────────────────────────────────────────────────────────────────
export const listContacts = () => listActive<BookerContact>('booker_contacts', 'load your contacts', { column: 'name', ascending: true });
export const createContact = (bookerId: string, input: ContactInput) =>
  insertOwned<BookerContact>('booker_contacts', bookerId, input, 'add the contact');
export const updateContact = (id: string, input: ContactInput) => updateOwned<BookerContact>('booker_contacts', id, input, 'save the contact');
export const archiveContact = (id: string) => archiveOwned<BookerContact>('booker_contacts', id, 'remove the contact');

// ── Shows ───────────────────────────────────────────────────────────────────
export interface ShowFilter {
  /** Inclusive ISO date */
  from?: string;
  /** Inclusive ISO date */
  to?: string;
  rosterId?: string;
}

export function listShows(filter: ShowFilter = {}): Promise<BookerShow[]> {
  let q = supabase.from('booker_shows').select('*').is('deleted_at', null);
  if (filter.from) q = q.gte('show_date', filter.from);
  if (filter.to) q = q.lte('show_date', filter.to);
  if (filter.rosterId) q = q.eq('roster_id', filter.rosterId);
  return run<BookerShow[]>('load shows', q.order('show_date', { ascending: true }).order('set_time', { ascending: true, nullsFirst: false }));
}
export const createShow = (bookerId: string, input: ShowInput) => insertOwned<BookerShow>('booker_shows', bookerId, input, 'save the show');
export const updateShow = (id: string, input: ShowInput) => updateOwned<BookerShow>('booker_shows', id, input, 'save the show');
export const archiveShow = (id: string) => archiveOwned<BookerShow>('booker_shows', id, 'remove the show');

// ── Commission payments ─────────────────────────────────────────────────────
export const listPayments = () =>
  listActive<CommissionPayment>('booker_commission_payments', 'load commission payments', { column: 'paid_on', ascending: false });
export const createPayment = (bookerId: string, input: PaymentInput) =>
  insertOwned<CommissionPayment>('booker_commission_payments', bookerId, input, 'record the payment');
export const archivePayment = (id: string) => archiveOwned<CommissionPayment>('booker_commission_payments', id, 'remove the payment');
