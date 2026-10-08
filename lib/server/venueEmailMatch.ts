// lib/server/venueEmailMatch.ts
//
// Decides which of a band's venues an incoming email came from.
//
// Two rules keep this from mislabelling mail:
//   1. Only the caller's band's venues and contacts are considered. Venues are
//      per-band; matching against every band's list leaked other bands' venue
//      names into this inbox (and linked the email to their venue record).
//   2. The "same company domain" fallback never applies to shared mailbox
//      providers. Before this, one venue using a gmail.com address claimed
//      every gmail.com sender.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface MatchedVenue {
  id: string;
  name: string;
}

export interface VenueEmailIndex {
  /** Exact address (lower-cased) → venue. */
  byAddress: Map<string, MatchedVenue>;
  /** Company domain → venue, only for domains used by exactly one venue. */
  byDomain: Map<string, MatchedVenue>;
}

/**
 * Free / shared mailbox providers. Many unrelated people share these domains,
 * so a domain match tells us nothing about who sent the email.
 */
export const SHARED_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'passport.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'aim.com',
  'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'zohomail.com',
  'yandex.com', 'fastmail.com', 'hey.com', 'tutanota.com',
  'att.net', 'sbcglobal.net', 'bellsouth.net', 'comcast.net', 'verizon.net',
  'cox.net', 'charter.net', 'earthlink.net', 'frontier.com', 'windstream.net',
  'centurylink.net', 'q.com', 'juno.com', 'netzero.net',
]);

/** Lower-cases and trims an address; returns '' for anything without an @. */
export function normalizeAddress(address: string | null | undefined): string {
  const a = (address ?? '').trim().toLowerCase();
  return a.includes('@') ? a : '';
}

/** Domain part of a normalised address, or '' when there is none. */
export function domainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return at >= 0 ? address.slice(at + 1) : '';
}

/**
 * True when a domain is a shared provider, including country variants such as
 * yahoo.co.uk or hotmail.fr.
 */
export function isSharedMailDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  if (SHARED_MAIL_DOMAINS.has(d)) return true;
  const brand = d.split('.')[0];
  return ['gmail', 'yahoo', 'hotmail', 'outlook', 'live', 'aol', 'gmx', 'yandex'].includes(brand);
}

/**
 * Builds the lookup from venue/contact rows. Exported so it can be tested
 * without a database.
 */
export function buildVenueEmailIndex(entries: Array<{ address: string | null | undefined; venue: MatchedVenue }>): VenueEmailIndex {
  const byAddress = new Map<string, MatchedVenue>();
  const domainVenues = new Map<string, Map<string, MatchedVenue>>();

  for (const { address, venue } of entries) {
    const a = normalizeAddress(address);
    if (!a || !venue.id) continue;
    // First writer wins so a venue's own address beats a contact that reuses it.
    if (!byAddress.has(a)) byAddress.set(a, venue);

    const domain = domainOf(a);
    if (!domain || isSharedMailDomain(domain)) continue;
    const seen = domainVenues.get(domain) ?? new Map<string, MatchedVenue>();
    seen.set(venue.id, venue);
    domainVenues.set(domain, seen);
  }

  // A domain shared by two of the band's venues is ambiguous — don't guess.
  const byDomain = new Map<string, MatchedVenue>();
  for (const [domain, venues] of domainVenues) {
    if (venues.size === 1) byDomain.set(domain, [...venues.values()][0]);
  }
  return { byAddress, byDomain };
}

/** Returns the venue an address belongs to, or null when there is no safe match. */
export function matchSenderToVenue(index: VenueEmailIndex, sender: string | null | undefined): MatchedVenue | null {
  const a = normalizeAddress(sender);
  if (!a) return null;
  const exact = index.byAddress.get(a);
  if (exact) return exact;
  const domain = domainOf(a);
  if (!domain || isSharedMailDomain(domain)) return null;
  return index.byDomain.get(domain) ?? null;
}

interface VenueRow { id: string; name: string | null; email: string | null; secondary_emails: string[] | null }
interface ContactRow { email: string | null; venue_id: string | null; venue: { name: string | null } | { name: string | null }[] | null }

/**
 * Loads the band's venue and contact addresses and builds the index.
 *
 * @param service service-role client (bypasses RLS, so the act filter here is
 *                the only scoping — it must never be removed)
 * @param actId   the caller's band, taken from their profile
 * @throws Error when either query fails, so a sync never runs against a
 *         partial list and silently drops replies
 */
export async function loadVenueEmailIndex(service: SupabaseClient, actId: string): Promise<VenueEmailIndex> {
  const [venuesRes, contactsRes] = await Promise.all([
    service.from('venues').select('id, name, email, secondary_emails').eq('act_id', actId),
    service
      .from('contacts')
      .select('email, venue_id, venue:venues!inner(name, act_id)')
      .eq('venue.act_id', actId)
      .not('email', 'is', null),
  ]);
  if (venuesRes.error) throw new Error(`venue lookup failed: ${venuesRes.error.message}`);
  if (contactsRes.error) throw new Error(`contact lookup failed: ${contactsRes.error.message}`);

  const entries: Array<{ address: string | null; venue: MatchedVenue }> = [];
  for (const v of (venuesRes.data ?? []) as VenueRow[]) {
    const venue = { id: v.id, name: v.name ?? '' };
    entries.push({ address: v.email, venue });
    for (const e of v.secondary_emails ?? []) entries.push({ address: e, venue });
  }
  for (const c of (contactsRes.data ?? []) as ContactRow[]) {
    if (!c.venue_id) continue;
    const joined = Array.isArray(c.venue) ? c.venue[0] : c.venue;
    entries.push({ address: c.email, venue: { id: c.venue_id, name: joined?.name ?? '' } });
  }
  return buildVenueEmailIndex(entries);
}
