// lib/server/emailLinks.ts
//
// The records a sent email is filed against (show, venue, tour target, contact)
// arrive from callers — including IDs the AI agent supplies — and email_log has
// a foreign key on each. One stale or invented ID used to make the log insert
// fail *after* the email had already gone out, so the user saw "Failed" for an
// email the venue had received, and could send it twice (Oct 27 2026,
// Dan's SilverLeaf: the agent attached a booking id that did not exist).
//
// resolveEmailLinks runs before sending and keeps only links that exist and
// belong to the sending band; anything else is dropped (and reported) so the
// email is still sent and logged, just not filed against that record. This also
// stops a log row being tied to another band's records.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EmailLinks {
  bookingId?: string | null;
  venueId?: string | null;
  tourVenueId?: string | null;
  contactId?: string | null;
}

export type EmailLinkKey = keyof EmailLinks;

export interface ResolvedEmailLinks {
  bookingId: string | null;
  venueId: string | null;
  tourVenueId: string | null;
  contactId: string | null;
}

/** The slice of the Supabase client used here (service role on the server). */
type LinkClient = { from: (table: string) => any };

type Check = { key: EmailLinkKey; id: string; run: () => PromiseLike<{ data: unknown; error: { message: string } | null }> };

/**
 * Returns the links that point at the band's own records; the rest come back
 * as null and are listed in `dropped`. A lookup error drops that link too —
 * sending still matters more than filing — and is logged.
 */
export async function resolveEmailLinks(
  client: LinkClient,
  actId: string,
  links: EmailLinks,
): Promise<{ links: ResolvedEmailLinks; dropped: EmailLinkKey[] }> {
  const resolved: ResolvedEmailLinks = { bookingId: null, venueId: null, tourVenueId: null, contactId: null };
  const dropped: EmailLinkKey[] = [];
  const checks: Check[] = [];

  const want = (key: EmailLinkKey, run: (id: string) => Check['run']) => {
    const id = links[key];
    if (!id) return;
    if (typeof id !== 'string' || !UUID_RE.test(id)) { dropped.push(key); return; }
    checks.push({ key, id, run: run(id) });
  };

  want('bookingId', id => () => client.from('bookings').select('id').eq('id', id).eq('act_id', actId).maybeSingle());
  want('venueId', id => () => client.from('venues').select('id').eq('id', id).eq('act_id', actId).maybeSingle());
  want('contactId', id => () => client.from('contacts').select('id').eq('id', id).eq('act_id', actId).maybeSingle());
  // tour_venues has no act_id; it belongs to the band through its tour.
  want('tourVenueId', id => () =>
    client.from('tour_venues').select('id, tour:tours!inner(act_id)').eq('id', id).eq('tour.act_id', actId).maybeSingle());

  const outcomes = await Promise.all(checks.map(async c => {
    try {
      const { data, error } = await c.run();
      if (error) {
        console.error('[emailLinks] lookup failed; sending without this link', { key: c.key, message: error.message });
        return { c, ok: false };
      }
      return { c, ok: Boolean(data) };
    } catch (err) {
      console.error('[emailLinks] lookup threw; sending without this link', { key: c.key, err });
      return { c, ok: false };
    }
  }));

  for (const { c, ok } of outcomes) {
    if (ok) resolved[c.key] = c.id;
    else dropped.push(c.key);
  }
  return { links: resolved, dropped };
}
