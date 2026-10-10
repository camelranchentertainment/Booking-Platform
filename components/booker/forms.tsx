// components/booker/forms.tsx
// Create/edit dialogs for the Booking Agent workspace. Each form keeps raw
// string values, validates with the shared Zod schema on submit (inline errors
// per field, focus moves to the first bad field), then writes through
// lib/booker/data.ts. The submit button is disabled while saving to prevent
// double submission, and input is kept if the save fails.

import { useState, type FormEvent } from 'react';
import type { z } from 'zod';
import {
  ContactSchema,
  PaymentSchema,
  RosterBandSchema,
  ShowSchema,
  VenueSchema,
  fieldErrors,
} from '../../lib/booker/schemas';
import {
  archiveShow,
  createContact,
  createPayment,
  createRosterBand,
  createShow,
  createVenue,
  updateContact,
  updateRosterBand,
  updateShow,
  updateVenue,
} from '../../lib/booker/data';
import {
  DEAL_TYPES,
  DEAL_TYPE_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  SHOW_STATUSES,
  SHOW_STATUS_LABEL,
  VENUE_KINDS,
  VENUE_KIND_LABEL,
  type BookerContact,
  type BookerShow,
  type BookerVenue,
  type CommissionPayment,
  type RosterBand,
} from '../../lib/booker/types';
import { toFormValues } from '../../lib/booker/useLoad';
import { todayIso } from '../../lib/booker/dates';
import { ErrorBanner, Field, FormActions, Modal } from './ui';
import { useBooker } from './BookerShell';

// ── Shared form state ───────────────────────────────────────────────────────
function useFormState<K extends string, S extends z.ZodType, R>(
  initial: Record<K, string>,
  schema: S,
  save: (payload: z.output<S>) => Promise<R>,
  onSaved: (row: R) => void,
) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValues(prev => ({ ...prev, [k]: v }));
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setFormError('');
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      // Move focus to the first invalid control so keyboard and screen reader users land on it.
      const form = e.currentTarget;
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const row = await save(parsed.data);
      onSaved(row);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save. Try again.');
      setBusy(false);
    }
  };

  return { values, setValues, errors, formError, busy, set, submit };
}

// ── Band ────────────────────────────────────────────────────────────────────
const BAND_KEYS = ['band_name', 'genre', 'home_city', 'home_state', 'contact_name', 'contact_email', 'contact_phone', 'commission_pct', 'color', 'notes', 'status'] as const;
const BAND_COLORS = ['#e8823a', '#33c9b0', '#5b9bd8', '#b48cf0', '#f0685f', '#4ade80', '#fbbf24', '#f472b6'];

export function RosterBandForm({
  band,
  colorIndex = 0,
  onClose,
  onSaved,
}: {
  band?: RosterBand;
  /** For a new band: which palette color to start with (e.g. the current roster size) */
  colorIndex?: number;
  onClose: () => void;
  onSaved: (b: RosterBand) => void;
}) {
  const { booker } = useBooker();
  const initial = toFormValues(band, BAND_KEYS);
  if (!band) {
    initial.status = 'active';
    initial.color = BAND_COLORS[colorIndex % BAND_COLORS.length];
    if (booker.default_commission_pct !== null) initial.commission_pct = String(booker.default_commission_pct);
  }
  const f = useFormState(initial, RosterBandSchema, payload => (band ? updateRosterBand(band.id, payload) : createRosterBand(booker.id, payload)), onSaved);

  return (
    <Modal title={band ? 'Edit band' : 'Add a band'} onClose={onClose} wide>
      {f.formError && <ErrorBanner message={f.formError} />}
      <form onSubmit={f.submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <Field label="Band name" required error={f.errors.band_name}>
          {p => <input {...p} className="input" value={f.values.band_name} onChange={f.set('band_name')} />}
        </Field>
        <div className="grid-3">
          <Field label="Genre" error={f.errors.genre}>
            {p => <input {...p} className="input" value={f.values.genre} onChange={f.set('genre')} />}
          </Field>
          <Field label="Home city" error={f.errors.home_city}>
            {p => <input {...p} className="input" value={f.values.home_city} onChange={f.set('home_city')} />}
          </Field>
          <Field label="State" error={f.errors.home_state}>
            {p => <input {...p} className="input" value={f.values.home_state} onChange={f.set('home_state')} />}
          </Field>
        </div>
        <div className="grid-3">
          <Field label="Band contact" error={f.errors.contact_name}>
            {p => <input {...p} className="input" value={f.values.contact_name} onChange={f.set('contact_name')} />}
          </Field>
          <Field label="Email" error={f.errors.contact_email}>
            {p => <input {...p} className="input" type="email" value={f.values.contact_email} onChange={f.set('contact_email')} />}
          </Field>
          <Field label="Phone" error={f.errors.contact_phone}>
            {p => <input {...p} className="input" type="tel" value={f.values.contact_phone} onChange={f.set('contact_phone')} />}
          </Field>
        </div>
        <div className="grid-3">
          <Field label="Commission %" hint="Your cut, paid by the band" error={f.errors.commission_pct}>
            {p => <input {...p} className="input" inputMode="decimal" value={f.values.commission_pct} onChange={f.set('commission_pct')} placeholder="e.g. 10" />}
          </Field>
          <Field label="Calendar color" error={f.errors.color}>
            {p => <input {...p} className="input" type="color" value={f.values.color || '#e8823a'} onChange={f.set('color')} style={{ height: 42, padding: 4 }} />}
          </Field>
          <Field label="Status" error={f.errors.status}>
            {p => (
              <select {...p} className="select" value={f.values.status} onChange={f.set('status')}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            )}
          </Field>
        </div>
        <Field label="Notes" hint="Private to you" error={f.errors.notes}>
          {p => <textarea {...p} className="textarea" value={f.values.notes} onChange={f.set('notes')} />}
        </Field>
        <FormActions busy={f.busy} submitLabel={band ? 'Save band' : 'Add band'} onCancel={onClose} />
      </form>
    </Modal>
  );
}

// ── Venue / buyer ───────────────────────────────────────────────────────────
const VENUE_KEYS = ['name', 'kind', 'address', 'city', 'state', 'postal_code', 'capacity', 'website', 'email', 'phone', 'notes'] as const;

export function VenueForm({ venue, onClose, onSaved }: { venue?: BookerVenue; onClose: () => void; onSaved: (v: BookerVenue) => void }) {
  const { booker } = useBooker();
  const initial = toFormValues(venue, VENUE_KEYS);
  if (!venue) initial.kind = 'venue';
  const f = useFormState(initial, VenueSchema, payload => (venue ? updateVenue(venue.id, payload) : createVenue(booker.id, payload)), onSaved);
  return (
    <Modal title={venue ? 'Edit details' : 'Add a venue or buyer'} onClose={onClose} wide>
      {f.formError && <ErrorBanner message={f.formError} />}
      <form onSubmit={f.submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div className="grid-3">
          <div style={{ gridColumn: 'span 2' }}>
            <Field label="Name" required error={f.errors.name}>
              {p => <input {...p} className="input" value={f.values.name} onChange={f.set('name')} />}
            </Field>
          </div>
          <Field label="Type" error={f.errors.kind}>
            {p => (
              <select {...p} className="select" value={f.values.kind} onChange={f.set('kind')}>
                {VENUE_KINDS.map(k => (
                  <option key={k} value={k}>
                    {VENUE_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="Street address" error={f.errors.address}>
          {p => <input {...p} className="input" value={f.values.address} onChange={f.set('address')} autoComplete="street-address" />}
        </Field>
        <div className="grid-3">
          <Field label="City" error={f.errors.city}>
            {p => <input {...p} className="input" value={f.values.city} onChange={f.set('city')} />}
          </Field>
          <Field label="State" error={f.errors.state}>
            {p => <input {...p} className="input" value={f.values.state} onChange={f.set('state')} />}
          </Field>
          <Field label="ZIP" error={f.errors.postal_code}>
            {p => <input {...p} className="input" inputMode="numeric" value={f.values.postal_code} onChange={f.set('postal_code')} />}
          </Field>
        </div>
        <div className="grid-3">
          <Field label="Website" hint="Needed to scan for contacts" error={f.errors.website}>
            {p => <input {...p} className="input" type="url" value={f.values.website} onChange={f.set('website')} placeholder="https://" />}
          </Field>
          <Field label="Booking email" error={f.errors.email}>
            {p => <input {...p} className="input" type="email" value={f.values.email} onChange={f.set('email')} />}
          </Field>
          <Field label="Phone" error={f.errors.phone}>
            {p => <input {...p} className="input" type="tel" value={f.values.phone} onChange={f.set('phone')} />}
          </Field>
        </div>
        <Field label="Capacity" error={f.errors.capacity}>
          {p => <input {...p} className="input" inputMode="numeric" value={f.values.capacity} onChange={f.set('capacity')} style={{ maxWidth: 200 }} />}
        </Field>
        <Field label="Notes" hint="Private to you" error={f.errors.notes}>
          {p => <textarea {...p} className="textarea" value={f.values.notes} onChange={f.set('notes')} />}
        </Field>
        <FormActions busy={f.busy} submitLabel={venue ? 'Save' : 'Add'} onCancel={onClose} />
      </form>
    </Modal>
  );
}

// ── Contact (always on a venue) ─────────────────────────────────────────────
const CONTACT_KEYS = ['venue_id', 'name', 'title', 'email', 'phone', 'notes', 'share_with_bands'] as const;

export function ContactForm({
  contact,
  venueId,
  venueName,
  onClose,
  onSaved,
}: {
  contact?: BookerContact;
  /** The venue this contact belongs to */
  venueId: string;
  venueName: string;
  onClose: () => void;
  onSaved: (c: BookerContact) => void;
}) {
  const { booker } = useBooker();
  const initial = toFormValues(contact, CONTACT_KEYS);
  initial.venue_id = venueId;
  initial.share_with_bands = contact?.share_with_bands ? 'true' : 'false';
  const f = useFormState(initial, ContactSchema, payload => (contact ? updateContact(contact.id, payload) : createContact(booker.id, payload)), onSaved);
  const shared = f.values.share_with_bands === 'true';
  return (
    <Modal title={contact ? 'Edit contact' : `Add a contact at ${venueName}`} onClose={onClose}>
      {f.formError && <ErrorBanner message={f.formError} />}
      <form onSubmit={f.submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div className="grid-2">
          <Field label="Name" required error={f.errors.name}>
            {p => <input {...p} className="input" value={f.values.name} onChange={f.set('name')} />}
          </Field>
          <Field label="Title" hint="e.g. Talent buyer" error={f.errors.title}>
            {p => <input {...p} className="input" value={f.values.title} onChange={f.set('title')} />}
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Email" error={f.errors.email}>
            {p => <input {...p} className="input" type="email" value={f.values.email} onChange={f.set('email')} />}
          </Field>
          <Field label="Phone" error={f.errors.phone}>
            {p => <input {...p} className="input" type="tel" value={f.values.phone} onChange={f.set('phone')} />}
          </Field>
        </div>
        <Field label="Notes" error={f.errors.notes}>
          {p => <textarea {...p} className="textarea" value={f.values.notes} onChange={f.set('notes')} />}
        </Field>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={shared}
            onChange={e => f.setValues(v => ({ ...v, share_with_bands: e.target.checked ? 'true' : 'false' }))}
            style={{ width: 18, height: 18, marginTop: 2 }}
          />
          <span>
            <span style={{ color: 'var(--text)', fontWeight: 800, fontSize: '0.9rem' }}>Show to my bands</span>
            <span className="text-xs text-muted" style={{ display: 'block' }}>
              Off: only you see this contact. On: bands you represent will be able to see it once they link to you.
            </span>
          </span>
        </label>
        <FormActions busy={f.busy} submitLabel={contact ? 'Save contact' : 'Add contact'} onCancel={onClose} />
      </form>
    </Modal>
  );
}

// ── Show ────────────────────────────────────────────────────────────────────
const SHOW_KEYS = [
  'roster_id',
  'venue_id',
  'venue_name',
  'venue_city',
  'show_date',
  'load_in_time',
  'door_time',
  'set_time',
  'set_length_min',
  'status',
  'deal_type',
  'fee',
  'actual_amount',
  'commission_pct_override',
  'deal_notes',
  'internal_notes',
  'followup_on',
] as const;

export function ShowForm({
  show,
  bands,
  venues,
  defaultBandId,
  defaultDate,
  defaultVenueId,
  conflictsFor,
  onClose,
  onSaved,
  onArchived,
}: {
  show?: BookerShow;
  bands: RosterBand[];
  venues: BookerVenue[];
  defaultBandId?: string;
  defaultDate?: string;
  /** Pre-select a saved venue (e.g. "Book a show here" on a venue profile) */
  defaultVenueId?: string;
  /** Returns other active shows for the same band on the same date, to warn about double-booking. */
  conflictsFor?: (bandId: string, date: string, excludeId?: string) => BookerShow[];
  onClose: () => void;
  onSaved: (s: BookerShow) => void;
  /** When set (editing only), offers "Remove show" with an inline confirm. */
  onArchived?: () => void;
}) {
  const { booker } = useBooker();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const initial = toFormValues(show, SHOW_KEYS);
  if (!show) {
    initial.status = 'hold';
    if (defaultBandId) initial.roster_id = defaultBandId;
    if (defaultVenueId) initial.venue_id = defaultVenueId;
    initial.show_date = defaultDate ?? '';
  }
  const f = useFormState(initial, ShowSchema, payload => (show ? updateShow(show.id, payload) : createShow(booker.id, payload)), onSaved);
  const activeBands = bands.filter(b => b.status === 'active' || b.id === f.values.roster_id);
  const conflicts = conflictsFor && f.values.roster_id && f.values.show_date ? conflictsFor(f.values.roster_id, f.values.show_date, show?.id) : [];
  const usingSavedVenue = f.values.venue_id !== '';
  const isPlayed = f.values.status === 'played';

  return (
    <Modal title={show ? 'Edit show' : 'Add a show'} onClose={onClose} wide>
      {f.formError && <ErrorBanner message={f.formError} />}
      <form onSubmit={f.submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <legend className="eyebrow" style={{ color: 'var(--accent)', marginBottom: '0.5rem' }}>
            Who, when, where
          </legend>
          <div className="grid-3">
            <Field label="Band" required error={f.errors.roster_id}>
              {p => (
                <select {...p} className="select" value={f.values.roster_id} onChange={f.set('roster_id')}>
                  <option value="">Choose a band</option>
                  {activeBands.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.band_name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Date" required error={f.errors.show_date}>
              {p => <input {...p} className="input" type="date" value={f.values.show_date} onChange={f.set('show_date')} />}
            </Field>
            <Field label="Status" error={f.errors.status}>
              {p => (
                <select {...p} className="select" value={f.values.status} onChange={f.set('status')}>
                  {SHOW_STATUSES.map(s => (
                    <option key={s} value={s}>
                      {SHOW_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          {conflicts.length > 0 && (
            <div role="status" className="card" style={{ borderColor: 'rgba(251,191,36,0.5)', background: 'rgba(251,191,36,0.07)', padding: '0.75rem 1rem' }}>
              <span style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.85rem' }}>
                Heads up: this band already has {conflicts.length === 1 ? 'a show' : `${conflicts.length} shows`} on this date
                {conflicts[0].venue_name ? ` (${conflicts[0].venue_name})` : ''}.
              </span>
            </div>
          )}
          <Field label="Venue" hint={venues.length === 0 ? 'Save venues on the Venues page to pick them here.' : undefined} error={f.errors.venue_id}>
            {p => (
              <select {...p} className="select" value={f.values.venue_id} onChange={f.set('venue_id')}>
                <option value="">Not in my venue book — type it below</option>
                {venues.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.city ? ` — ${v.city}` : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {!usingSavedVenue && (
            <div className="grid-2">
              <Field label="Venue name" required error={f.errors.venue_name}>
                {p => <input {...p} className="input" value={f.values.venue_name} onChange={f.set('venue_name')} />}
              </Field>
              <Field label="Venue city" error={f.errors.venue_city}>
                {p => <input {...p} className="input" value={f.values.venue_city} onChange={f.set('venue_city')} />}
              </Field>
            </div>
          )}
          <div className="grid-4">
            <Field label="Load-in" error={f.errors.load_in_time}>
              {p => <input {...p} className="input" type="time" value={f.values.load_in_time} onChange={f.set('load_in_time')} />}
            </Field>
            <Field label="Doors" error={f.errors.door_time}>
              {p => <input {...p} className="input" type="time" value={f.values.door_time} onChange={f.set('door_time')} />}
            </Field>
            <Field label="Set time" error={f.errors.set_time}>
              {p => <input {...p} className="input" type="time" value={f.values.set_time} onChange={f.set('set_time')} />}
            </Field>
            <Field label="Set length (min)" error={f.errors.set_length_min}>
              {p => <input {...p} className="input" inputMode="numeric" value={f.values.set_length_min} onChange={f.set('set_length_min')} />}
            </Field>
          </div>
        </fieldset>

        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <legend className="eyebrow" style={{ color: 'var(--accent)', marginBottom: '0.5rem' }}>
            The deal
          </legend>
          <div className="grid-3">
            <Field label="Deal type" error={f.errors.deal_type}>
              {p => (
                <select {...p} className="select" value={f.values.deal_type} onChange={f.set('deal_type')}>
                  <option value="">Not set</option>
                  {DEAL_TYPES.map(d => (
                    <option key={d} value={d}>
                      {DEAL_TYPE_LABEL[d]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Agreed fee ($)" error={f.errors.fee}>
              {p => <input {...p} className="input" inputMode="decimal" value={f.values.fee} onChange={f.set('fee')} />}
            </Field>
            <Field label="Commission override %" hint="Leave blank to use the band's rate" error={f.errors.commission_pct_override}>
              {p => <input {...p} className="input" inputMode="decimal" value={f.values.commission_pct_override} onChange={f.set('commission_pct_override')} />}
            </Field>
          </div>
          {isPlayed && (
            <Field label="Amount the band actually received ($)" hint="Commission is figured on this once entered" error={f.errors.actual_amount}>
              {p => <input {...p} className="input" inputMode="decimal" value={f.values.actual_amount} onChange={f.set('actual_amount')} />}
            </Field>
          )}
          <Field label="Deal notes" error={f.errors.deal_notes}>
            {p => <textarea {...p} className="textarea" value={f.values.deal_notes} onChange={f.set('deal_notes')} />}
          </Field>
        </fieldset>

        <div className="grid-2">
          <Field label="Follow up on" error={f.errors.followup_on}>
            {p => <input {...p} className="input" type="date" value={f.values.followup_on} onChange={f.set('followup_on')} />}
          </Field>
          <Field label="Internal notes" hint="Private to you" error={f.errors.internal_notes}>
            {p => <textarea {...p} className="textarea" value={f.values.internal_notes} onChange={f.set('internal_notes')} style={{ minHeight: 42 }} />}
          </Field>
        </div>
        <FormActions busy={f.busy || archiving} submitLabel={show ? 'Save show' : 'Add show'} onCancel={onClose} />
      </form>
      {show && onArchived && (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: '1.25rem', paddingTop: '1rem' }}>
          {archiveError && <ErrorBanner message={archiveError} />}
          {!confirmArchive ? (
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => setConfirmArchive(true)}>
              Remove this show
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="text-sm" style={{ color: 'var(--text)' }}>
                Remove it from your workspace? To keep a record of a show that fell through, set it to Cancelled instead.
              </span>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={archiving}
                aria-busy={archiving}
                onClick={async () => {
                  setArchiving(true);
                  setArchiveError('');
                  try {
                    await archiveShow(show.id);
                    onArchived();
                  } catch (err) {
                    setArchiveError(err instanceof Error ? err.message : 'Could not remove the show.');
                    setArchiving(false);
                  }
                }}
              >
                {archiving ? 'Removing…' : 'Yes, remove'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmArchive(false)} disabled={archiving}>
                Keep
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Commission payment ──────────────────────────────────────────────────────
export function PaymentForm({
  showOptions,
  defaultShowId,
  defaultAmount,
  onClose,
  onSaved,
}: {
  /** Played shows the payment can be recorded against: [id, label] */
  showOptions: Array<{ id: string; label: string }>;
  defaultShowId?: string;
  defaultAmount?: number;
  onClose: () => void;
  onSaved: (p: CommissionPayment) => void;
}) {
  const { booker } = useBooker();
  const initial = {
    show_id: defaultShowId ?? '',
    amount: defaultAmount && defaultAmount > 0 ? defaultAmount.toFixed(2) : '',
    method: '',
    paid_on: todayIso(),
    notes: '',
  };
  const f = useFormState(initial, PaymentSchema, payload => createPayment(booker.id, payload), onSaved);
  return (
    <Modal title="Record a payment" onClose={onClose}>
      {f.formError && <ErrorBanner message={f.formError} />}
      <form onSubmit={f.submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <Field label="Show" required error={f.errors.show_id}>
          {p => (
            <select {...p} className="select" value={f.values.show_id} onChange={f.set('show_id')}>
              <option value="">Choose a played show</option>
              {showOptions.map(o => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="grid-3">
          <Field label="Amount ($)" required error={f.errors.amount}>
            {p => <input {...p} className="input" inputMode="decimal" value={f.values.amount} onChange={f.set('amount')} />}
          </Field>
          <Field label="Paid by" required error={f.errors.method}>
            {p => (
              <select {...p} className="select" value={f.values.method} onChange={f.set('method')}>
                <option value="">Choose</option>
                {PAYMENT_METHODS.map(m => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Date paid" required error={f.errors.paid_on}>
            {p => <input {...p} className="input" type="date" value={f.values.paid_on} onChange={f.set('paid_on')} />}
          </Field>
        </div>
        <Field label="Notes" error={f.errors.notes}>
          {p => <input {...p} className="input" value={f.values.notes} onChange={f.set('notes')} />}
        </Field>
        <FormActions busy={f.busy} submitLabel="Record payment" onCancel={onClose} />
      </form>
    </Modal>
  );
}
