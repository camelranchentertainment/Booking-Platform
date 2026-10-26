// lib/domain/tourOutreach.ts
//
// Pure helpers the booking agent uses to work with a tour's targets
// (tour_venues). Kept free of database calls so they can be unit-tested.
//
// Background: targets used to be mirrored into `bookings` as fake "pitch"
// shows, and the agent "saw" targets only through those. That mirroring was
// removed (it flooded the calendar), so the agent now reads tour_venues
// directly via these helpers.

/** Minimal tour shape for name matching. */
export interface OutreachTour {
  id: string;
  name: string | null;
}

/** A target row as loaded for the agent (venue joined). */
export interface TargetRow {
  id: string;
  tour_id: string;
  status: string;
  booking_date: string | null;
  last_contacted_at?: string | null;
  venue: {
    id: string;
    name: string | null;
    city: string | null;
    state: string | null;
    email: string | null;
  } | null;
}

/** A saved venue contact (contacts table), already scoped to the caller's band. */
export interface VenueContact {
  venue_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string | null;
}

/** One recipient in a tour outreach batch. Shape is consumed by /band and /api/agent-bulk-send. */
export interface OutreachVenue {
  tourVenueId: string;
  venueId: string;
  name: string;
  city: string | null;
  state: string | null;
  email: string | null;
  contactName: string | null;
}

/** Lowercase and drop everything but letters and digits: "Lone_Star tour" → "lonestartour". */
export function normalizeTourName(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Find the tour the user means. Exact (normalized) match wins, then the
 * longest tour name contained in what the user typed, then a typed fragment
 * contained in exactly one tour name. Returns null rather than guessing, so the
 * agent never acts on the wrong tour.
 */
export function matchTour<T extends OutreachTour>(tours: T[], typed: string): T | null {
  const q = normalizeTourName(typed).replace(/tour$/, '') || normalizeTourName(typed);
  if (!q) return null;
  const named = tours.filter(t => normalizeTourName(t.name));

  const exact = named.find(t => normalizeTourName(t.name) === q || normalizeTourName(t.name) === normalizeTourName(typed));
  if (exact) return exact;

  const containedInTyped = named
    .filter(t => normalizeTourName(typed).includes(normalizeTourName(t.name)))
    .sort((a, b) => normalizeTourName(b.name).length - normalizeTourName(a.name).length);
  if (containedInTyped.length) return containedInTyped[0];

  const containing = named.filter(t => normalizeTourName(t.name).includes(q));
  return containing.length === 1 ? containing[0] : null;
}

/**
 * Best contact to address at a venue: never one marked do_not_contact; prefer
 * one with an email. Returns null when nobody usable is saved.
 */
export function pickContact(contacts: VenueContact[]): VenueContact | null {
  const usable = contacts.filter(c => c.status !== 'do_not_contact');
  return usable.find(c => (c.email ?? '').trim()) ?? usable[0] ?? null;
}

const fullName = (c: VenueContact | null): string | null => {
  if (!c) return null;
  const n = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
  return n || null;
};

/**
 * Turn target rows + the band's saved contacts into outreach recipients.
 * Email: the venue's own booking email first, else the chosen contact's.
 * A venue whose only contacts are do_not_contact gets no contact email.
 * Sorted by venue name.
 */
export function buildOutreachVenues(rows: TargetRow[], contacts: VenueContact[]): OutreachVenue[] {
  const byVenue = new Map<string, VenueContact[]>();
  for (const c of contacts) {
    if (!c.venue_id) continue;
    const list = byVenue.get(c.venue_id) ?? [];
    list.push(c);
    byVenue.set(c.venue_id, list);
  }

  return rows
    .filter((r): r is TargetRow & { venue: NonNullable<TargetRow['venue']> } => r.venue !== null)
    .map(r => {
      const contact = pickContact(byVenue.get(r.venue.id) ?? []);
      const venueEmail = (r.venue.email ?? '').trim();
      const contactEmail = (contact?.email ?? '').trim();
      return {
        tourVenueId: r.id,
        venueId: r.venue.id,
        name: r.venue.name ?? 'Unnamed venue',
        city: r.venue.city,
        state: r.venue.state,
        email: venueEmail || contactEmail || null,
        contactName: fullName(contact),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const TARGET_STATUS_WORD: Record<string, string> = {
  target: 'targeted',
  follow_up: 'following up',
  confirmed: 'confirmed',
  declined: 'declined',
  thank_you: 'thanked',
};

/** Max targets listed by name per tour in the agent's context (the count is always exact). */
export const MAX_TARGETS_LISTED = 25;

/**
 * Context lines describing a tour's targets for the agent's system context.
 * Always states the count per status so the agent never reports "0 targets"
 * for a tour that has them.
 */
export function formatTargetLines(rows: TargetRow[], max = MAX_TARGETS_LISTED): string[] {
  if (!rows.length) return ['    Targets: none yet'];

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const summary = [...counts.entries()]
    .map(([s, n]) => `${n} ${TARGET_STATUS_WORD[s] ?? s}`)
    .join(', ');

  const sorted = [...rows].sort((a, b) => (a.venue?.name ?? '').localeCompare(b.venue?.name ?? ''));
  const lines = [`    Targets (${rows.length}: ${summary}) — venues being pitched for this tour, not booked shows:`];
  for (const r of sorted.slice(0, max)) {
    const v = r.venue;
    const place = v ? `${v.name ?? 'Unnamed venue'}${v.city ? `, ${v.city}` : ''}${v.state ? ` ${v.state}` : ''}` : 'Unknown venue';
    const extras = [
      TARGET_STATUS_WORD[r.status] ?? r.status,
      r.booking_date ? `for ${r.booking_date.slice(0, 10)}` : null,
      v && !(v.email ?? '').trim() ? 'no email on file' : null,
    ].filter(Boolean).join(' · ');
    lines.push(`    - ${place} [${extras}]`);
  }
  if (sorted.length > max) lines.push(`    …and ${sorted.length - max} more`);
  return lines;
}

// ── Follow-up outreach (agent "tour_outreach" with stage follow_up) ─────────

export type OutreachStage = 'target' | 'follow_up';

/** The model's stage value → a stage; anything unknown is a first pitch. */
export const parseOutreachStage = (raw: unknown): OutreachStage => (raw === 'follow_up' ? 'follow_up' : 'target');

const MS_DAY = 86_400_000;
/** Days without contact after which a Follow up venue is overdue (matches the Email page). */
export const OVERDUE_DAYS = 7;

export interface StageRow {
  status: string;
  last_contacted_at?: string | null;
  pitched_at?: string | null;
  updated_at?: string | null;
}

/** True when a row has had no contact for OVERDUE_DAYS or more. */
export function isOverdue(r: StageRow, now: number = Date.now()): boolean {
  const touched = r.last_contacted_at || r.pitched_at || r.updated_at;
  if (!touched) return false;
  const t = new Date(touched).getTime();
  return Number.isFinite(t) && now - t >= OVERDUE_DAYS * MS_DAY;
}

/** The rows to email for a stage, optionally only the overdue ones. */
export function selectOutreachRows<T extends StageRow>(rows: T[], stage: OutreachStage, overdueOnly: boolean, now: number = Date.now()): T[] {
  return rows.filter(r => r.status === stage && (!overdueOnly || isOverdue(r, now)));
}

/**
 * Explains why nothing matched and where the tour's venues actually are, so
 * the next request can be right. The old message repeated "no venues still
 * marked Targeted" even when the user had asked for the follow-ups.
 */
export function emptyOutreachMessage(tourName: string, rows: StageRow[], stage: OutreachStage, overdueOnly: boolean, now: number = Date.now()): string {
  const inTarget = rows.filter(r => r.status === 'target').length;
  const inFollowUp = rows.filter(r => r.status === 'follow_up').length;
  if (stage === 'follow_up' && overdueOnly && inFollowUp > 0) {
    return `None of the ${inFollowUp} follow-up venues on "${tourName}" are overdue yet — every one was contacted in the last ${OVERDUE_DAYS} days. Say "send the follow-up anyway" to email all ${inFollowUp}.`;
  }
  if (stage === 'follow_up') {
    return inTarget > 0
      ? `"${tourName}" has no venues in Follow up yet. ${inTarget} ${inTarget === 1 ? 'is' : 'are'} still in Target — say "pitch the ${tourName} targets" to send the first email.`
      : `"${tourName}" has no venues in Follow up. Add venues on the tour page first.`;
  }
  if (inFollowUp > 0) {
    const overdue = rows.filter(r => r.status === 'follow_up' && isOverdue(r, now)).length;
    return `"${tourName}" has no venues left in Target — all ${inFollowUp} have been pitched and are in Follow up${overdue ? ` (${overdue} overdue)` : ''}. Say "send the follow-up" and I'll draft it from the last email they got.`;
  }
  return `"${tourName}" has no venues in Target. Add venues on the tour page, or ask me to find some.`;
}

/** Category for the next email to a tour venue, from how many it has already been sent. */
export function categoryForNextEmail(priorEmails: number): 'target' | 'follow_up_1' | 'follow_up_2' {
  if (priorEmails <= 0) return 'target';
  return priorEmails === 1 ? 'follow_up_1' : 'follow_up_2';
}
