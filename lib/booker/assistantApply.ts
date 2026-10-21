// lib/booker/assistantApply.ts
// Turns an approved assistant proposal into exactly one workspace write, and
// describes a proposal for its approval card. Pure functions, no I/O: the page
// runs the returned write through the normal RLS-scoped calls in data.ts.
//
// Updates are built by merging the proposal's changes onto the row as it is
// now and re-validating the whole row with the same schema the forms use, so
// an assistant edit can never write something a person couldn't type into the
// form — and it can never touch fields outside its remit (amount received,
// commission override, commission rate, contact sharing): those are carried
// over from the current row unchanged.

import { formatMoney } from './commission';
import { formatShowDate, formatTime } from './dates';
import { ContactSchema, RosterBandSchema, ShowSchema, VenueSchema, fieldErrors, type ContactInput, type RosterBandInput, type ShowInput, type VenueInput } from './schemas';
import { DEAL_TYPE_LABEL, SHOW_STATUS_LABEL, VENUE_KIND_LABEL, type BookerContact, type BookerShow, type BookerVenue, type RosterBand } from './types';
import { toFormValues } from './useLoad';
import { venueLabel } from './workspace';
import type { AssistantAction } from './assistantActions';

/** One write the page performs when the agent approves a proposal. */
export type AssistantWrite =
  | { op: 'createShow'; input: ShowInput }
  | { op: 'updateShow'; id: string; input: ShowInput }
  | { op: 'setFollowup'; id: string; date: string }
  | { op: 'createBand'; input: RosterBandInput }
  | { op: 'updateBand'; id: string; input: RosterBandInput }
  | { op: 'createVenue'; input: VenueInput }
  | { op: 'updateVenue'; id: string; input: VenueInput }
  | { op: 'createContact'; input: ContactInput }
  | { op: 'updateContact'; id: string; input: ContactInput }
  | { op: 'composeEmail' };

/** The agent's current rows, as loaded on the page. */
export interface WorkspaceRows {
  bands: readonly RosterBand[];
  venues: readonly BookerVenue[];
  shows: readonly BookerShow[];
  contacts: readonly BookerContact[];
}

export type ApplyResult = { ok: true; write: AssistantWrite } | { ok: false; message: string };

const SHOW_KEYS = [
  'roster_id', 'venue_id', 'venue_name', 'venue_city', 'show_date', 'load_in_time', 'door_time', 'set_time', 'set_length_min',
  'status', 'deal_type', 'fee', 'actual_amount', 'commission_pct_override', 'deal_notes', 'internal_notes', 'followup_on',
] as const;
const BAND_KEYS = ['band_name', 'genre', 'home_city', 'home_state', 'contact_name', 'contact_email', 'contact_phone', 'commission_pct', 'color', 'notes', 'status'] as const;
const VENUE_KEYS = ['name', 'kind', 'email', 'phone', 'address', 'city', 'state', 'postal_code', 'capacity', 'website', 'notes'] as const;
const CONTACT_KEYS = ['venue_id', 'name', 'title', 'email', 'phone', 'notes', 'share_with_bands'] as const;

/** Colours handed to new bands, matching the Add band form's palette. */
export const BAND_COLORS = ['#e8823a', '#33c9b0', '#5b9bd8', '#b48cf0', '#f0685f', '#4ade80', '#fbbf24', '#f472b6'] as const;

/** Changes as form strings: null clears a field, undefined leaves it alone. */
function asFormValues(changes: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined) continue;
    out[k] = v === null ? '' : String(v);
  }
  return out;
}

/** First validation message from a failed parse, phrased for the card. */
function failure(err: Parameters<typeof fieldErrors>[0], what: string): ApplyResult {
  const first = Object.values(fieldErrors(err))[0];
  return { ok: false, message: first ? `${first}. Make this change from the ${what} page instead.` : `That suggestion is missing something. Make the change from the ${what} page instead.` };
}

const note = (reason: string): string => `Added from the assistant: ${reason}`.slice(0, 5000);

/** The write an approved proposal performs, or why it can't run. */
export function buildWrite(a: AssistantAction, rows: WorkspaceRows): ApplyResult {
  switch (a.type) {
    case 'add_hold':
    case 'add_show': {
      const status = a.type === 'add_show' ? a.status : 'hold';
      const extra = a.type === 'add_show' ? asFormValues({ fee: a.fee, deal_type: a.deal_type, load_in_time: a.load_in_time, door_time: a.door_time, set_time: a.set_time, set_length_min: a.set_length_min, deal_notes: a.deal_notes, followup_on: a.followup_on }) : {};
      const parsed = ShowSchema.safeParse({
        roster_id: a.roster_id,
        venue_id: a.venue_id ?? '',
        venue_name: a.venue_id ? '' : (a.venue_name ?? ''),
        venue_city: a.venue_id ? '' : (a.venue_city ?? ''),
        show_date: a.show_date,
        status,
        ...extra,
        internal_notes: note(a.reason),
      });
      return parsed.success ? { ok: true, write: { op: 'createShow', input: parsed.data } } : failure(parsed.error, 'Shows');
    }
    case 'update_show': {
      const show = rows.shows.find(s => s.id === a.show_id);
      if (!show) return { ok: false, message: 'That show is no longer in your workspace.' };
      const merged: Record<string, string> = { ...toFormValues(show, SHOW_KEYS), ...asFormValues(a.changes) };
      // A saved venue and a typed venue are exclusive: whichever the change names wins.
      if (a.changes.venue_id) Object.assign(merged, { venue_name: '', venue_city: '' });
      else if (a.changes.venue_name) merged.venue_id = '';
      const parsed = ShowSchema.safeParse(merged);
      return parsed.success ? { ok: true, write: { op: 'updateShow', id: show.id, input: parsed.data } } : failure(parsed.error, 'Shows');
    }
    case 'set_followup':
      if (!rows.shows.some(s => s.id === a.show_id)) return { ok: false, message: 'That show is no longer in your workspace.' };
      return { ok: true, write: { op: 'setFollowup', id: a.show_id, date: a.followup_on } };
    case 'add_band': {
      const { type: _t, reason: _r, ...fields } = a;
      const parsed = RosterBandSchema.safeParse({ ...asFormValues(fields), color: BAND_COLORS[rows.bands.length % BAND_COLORS.length], status: 'active' });
      return parsed.success ? { ok: true, write: { op: 'createBand', input: parsed.data } } : failure(parsed.error, 'Bands');
    }
    case 'update_band': {
      const band = rows.bands.find(b => b.id === a.roster_id);
      if (!band) return { ok: false, message: 'That band is no longer on your roster.' };
      const parsed = RosterBandSchema.safeParse({ ...toFormValues(band, BAND_KEYS), ...asFormValues(a.changes) });
      return parsed.success ? { ok: true, write: { op: 'updateBand', id: band.id, input: parsed.data } } : failure(parsed.error, 'Bands');
    }
    case 'add_venue': {
      const { type: _t, reason: _r, ...fields } = a;
      const parsed = VenueSchema.safeParse(asFormValues(fields));
      return parsed.success ? { ok: true, write: { op: 'createVenue', input: parsed.data } } : failure(parsed.error, 'Venues');
    }
    case 'update_venue': {
      const venue = rows.venues.find(v => v.id === a.venue_id);
      if (!venue) return { ok: false, message: 'That venue is no longer in your book.' };
      const parsed = VenueSchema.safeParse({ ...toFormValues(venue, VENUE_KEYS), ...asFormValues(a.changes) });
      return parsed.success ? { ok: true, write: { op: 'updateVenue', id: venue.id, input: parsed.data } } : failure(parsed.error, 'Venues');
    }
    case 'add_contact': {
      if (!rows.venues.some(v => v.id === a.venue_id)) return { ok: false, message: 'That venue is no longer in your book.' };
      const { type: _t, reason: _r, ...fields } = a;
      // Never shared with bands from here: only the agent ticks that box.
      const parsed = ContactSchema.safeParse({ ...asFormValues(fields), share_with_bands: false });
      return parsed.success ? { ok: true, write: { op: 'createContact', input: parsed.data } } : failure(parsed.error, 'Venues');
    }
    case 'update_contact': {
      const contact = rows.contacts.find(c => c.id === a.contact_id);
      if (!contact) return { ok: false, message: 'That contact is no longer in your workspace.' };
      const current = toFormValues(contact, CONTACT_KEYS);
      // Sharing stays exactly as the agent set it.
      const parsed = ContactSchema.safeParse({ ...current, ...asFormValues(a.changes), share_with_bands: contact.share_with_bands });
      return parsed.success ? { ok: true, write: { op: 'updateContact', id: contact.id, input: parsed.data } } : failure(parsed.error, 'Venues');
    }
    case 'draft_email':
      return { ok: true, write: { op: 'composeEmail' } };
  }
}

/** Title and detail lines for a proposal's approval card. */
export interface ActionCopy {
  title: string;
  detail: string;
  /** Where to look after it's done */
  href: string | null;
  /** Approve button label */
  approveLabel: string;
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Status', show_date: 'Date', venue_id: 'Venue', venue_name: 'Venue', venue_city: 'City', fee: 'Fee', deal_type: 'Deal',
  load_in_time: 'Load-in', door_time: 'Doors', set_time: 'Set', set_length_min: 'Set length', deal_notes: 'Deal notes', followup_on: 'Follow up',
  band_name: 'Name', name: 'Name', genre: 'Genre', home_city: 'Home city', home_state: 'Home state', contact_name: 'Contact', contact_email: 'Contact email',
  contact_phone: 'Contact phone', notes: 'Notes', kind: 'Type', address: 'Address', city: 'City', state: 'State', postal_code: 'ZIP', capacity: 'Capacity',
  website: 'Website', email: 'Email', phone: 'Phone', title: 'Title',
};

/** "Status → Confirmed · Fee → $800" for an update proposal. */
function changeList(changes: Record<string, unknown>, venuesById: ReadonlyMap<string, BookerVenue>, year: number): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined || k === 'venue_city') continue;
    let shown: string;
    if (v === null || v === '') shown = 'cleared';
    else if (k === 'status') shown = SHOW_STATUS_LABEL[v as keyof typeof SHOW_STATUS_LABEL] ?? `${String(v).charAt(0).toUpperCase()}${String(v).slice(1)}`;
    else if (k === 'show_date' || k === 'followup_on') shown = formatShowDate(String(v), year);
    else if (k === 'venue_id') shown = venuesById.get(String(v))?.name ?? 'a saved venue';
    else if (k === 'venue_name') shown = [v, changes.venue_city].filter(Boolean).join(', ');
    else if (k === 'fee') shown = formatMoney(Number(v));
    else if (k === 'deal_type') shown = DEAL_TYPE_LABEL[v as keyof typeof DEAL_TYPE_LABEL] ?? String(v);
    else if (k.endsWith('_time')) shown = formatTime(String(v)) ?? String(v);
    else if (k === 'kind') shown = VENUE_KIND_LABEL[v as keyof typeof VENUE_KIND_LABEL] ?? String(v);
    else shown = String(v).length > 80 ? `${String(v).slice(0, 77)}…` : String(v);
    parts.push(`${FIELD_LABELS[k] ?? k} → ${shown}`);
  }
  return parts.join(' · ');
}

/** What an approval card says about a proposal. */
export function describeAction(a: AssistantAction, rows: WorkspaceRows, year: number): ActionCopy {
  const venuesById = new Map(rows.venues.map(v => [v.id, v]));
  const bandName = (id: string | null | undefined): string => (id ? (rows.bands.find(b => b.id === id)?.band_name ?? 'a band') : '');
  switch (a.type) {
    case 'add_hold':
    case 'add_show': {
      const status = a.type === 'add_show' ? a.status : 'hold';
      const where = venueLabel({ venue_id: a.venue_id ?? null, venue_name: a.venue_name ?? null, venue_city: a.venue_city ?? null }, venuesById);
      const noun = status === 'hold' ? 'a hold' : status === 'pending' ? 'a pending offer' : 'a confirmed show';
      const extras = a.type === 'add_show' ? [a.fee != null ? formatMoney(a.fee) : null, a.set_time ? `set ${formatTime(a.set_time)}` : null].filter(Boolean) : [];
      return { title: `Add ${noun}: ${bandName(a.roster_id)} at ${where}`, detail: [formatShowDate(a.show_date, year), ...extras].join(' · '), href: `/booker/bands/${a.roster_id}`, approveLabel: 'Approve' };
    }
    case 'update_show': {
      const s = rows.shows.find(x => x.id === a.show_id);
      const cancelling = a.changes.status === 'cancelled';
      return {
        title: `${cancelling ? 'Cancel' : 'Update'} ${s ? `${bandName(s.roster_id)} at ${venueLabel(s, venuesById)}, ${formatShowDate(s.show_date, year)}` : 'a show'}`,
        detail: changeList(a.changes, venuesById, year),
        href: '/booker/shows',
        approveLabel: cancelling ? 'Approve cancel' : 'Approve',
      };
    }
    case 'set_followup': {
      const s = rows.shows.find(x => x.id === a.show_id);
      return {
        title: `Set a follow-up for ${s ? `${bandName(s.roster_id)} at ${venueLabel(s, venuesById)}` : 'this show'}`,
        detail: `Follow up ${formatShowDate(a.followup_on, year)}${s ? ` · show ${formatShowDate(s.show_date, year)}` : ''}`,
        href: '/booker/shows',
        approveLabel: 'Approve',
      };
    }
    case 'add_band': {
      const { type: _t, reason: _r, band_name, ...rest } = a;
      return { title: `Add ${band_name} to your roster`, detail: changeList(rest, venuesById, year) || 'Set their commission rate after it is added.', href: '/booker/bands', approveLabel: 'Approve' };
    }
    case 'update_band':
      return { title: `Update ${bandName(a.roster_id)}`, detail: changeList(a.changes, venuesById, year), href: `/booker/bands/${a.roster_id}`, approveLabel: 'Approve' };
    case 'add_venue': {
      const { type: _t, reason: _r, name, ...rest } = a;
      return { title: `Add ${name} to your venue book`, detail: changeList(rest, venuesById, year), href: '/booker/venues', approveLabel: 'Approve' };
    }
    case 'update_venue':
      return { title: `Update ${venuesById.get(a.venue_id)?.name ?? 'a venue'}`, detail: changeList(a.changes, venuesById, year), href: `/booker/venues/${a.venue_id}`, approveLabel: 'Approve' };
    case 'add_contact': {
      const { type: _t, reason: _r, venue_id, name, ...rest } = a;
      return { title: `Add ${name} as a contact at ${venuesById.get(venue_id)?.name ?? 'a venue'}`, detail: [changeList(rest, venuesById, year), 'Not shared with your bands'].filter(Boolean).join(' · '), href: `/booker/venues/${venue_id}`, approveLabel: 'Approve' };
    }
    case 'update_contact': {
      const c = rows.contacts.find(x => x.id === a.contact_id);
      const at = c?.venue_id ? venuesById.get(c.venue_id)?.name : undefined;
      return { title: `Update ${c?.name ?? 'a contact'}${at ? ` at ${at}` : ''}`, detail: changeList(a.changes, venuesById, year), href: c?.venue_id ? `/booker/venues/${c.venue_id}` : '/booker/venues', approveLabel: 'Approve' };
    }
    case 'draft_email': {
      const v = a.venue_id ? venuesById.get(a.venue_id) : undefined;
      return { title: `Draft email${v ? ` to ${v.name}` : ''}: “${a.subject}”`, detail: a.body, href: null, approveLabel: 'Review & send' };
    }
  }
}
