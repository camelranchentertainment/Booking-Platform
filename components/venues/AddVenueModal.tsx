// components/venues/AddVenueModal.tsx
//
// "Add venue" dialog on the Venues page. A Google Places search at the top
// fills the form; everything can also be typed by hand. Saves straight to
// `venues` under the caller's band (RLS enforces it).

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { parseCapacity } from '../../lib/domain/venueImport';
import { getVenueSession } from './venueSession';
import { useModalKeys } from './useModalKeys';
import ShowDayContactFields from './ShowDayContactFields';
import { BLANK_SHOW_DAY_CONTACTS, venueColumns, type ShowDayContacts } from '../../lib/showDayContacts';

/** Minimal shape of the Google Places Autocomplete we use (loaded at runtime from Google's script). */
interface PlaceComponent { long_name: string; short_name: string; types: string[] }
interface PlaceResult {
  name?: string; formatted_address?: string; address_components?: PlaceComponent[];
  formatted_phone_number?: string; website?: string; place_id?: string; url?: string;
}
interface PlacesAutocomplete { addListener(event: 'place_changed', cb: () => void): void; getPlace(): PlaceResult }
type PlacesCtor = new (input: HTMLInputElement, opts: { types: string[]; fields: string[] }) => PlacesAutocomplete;

declare global {
  interface Window {
    google?: { maps?: { places?: { Autocomplete: PlacesCtor } } };
    initGooglePlaces?: () => void;
  }
}

type VenueForm = {
  name: string; city: string; state: string; address: string;
  phone: string; email: string; website: string; venue_type: string;
  capacity: string; place_id: string; google_maps_url: string; music_genres: string;
  /** The venue's own contact (talent buyer / booking manager). Each show keeps its own day-of show contact. */
  booking_contact: string;
  notes: string;
};

const BLANK: VenueForm = {
  name: '', city: '', state: '', address: '', phone: '', email: '', website: '',
  venue_type: '', capacity: '', place_id: '', google_maps_url: '', music_genres: '',
  booking_contact: '', notes: '',
};

const FALLBACK_TYPES = ['bar', 'club', 'concert_hall', 'festival', 'restaurant', 'winery', 'outdoor', 'theater', 'other'];

interface Props {
  mapsReady: boolean;
  venueTypes: { value: string; label: string }[];
  onClose: () => void;
  /** Called after a successful save so the page can reload its list. */
  onSaved: () => void;
}

export default function AddVenueModal({ mapsReady, venueTypes, onClose, onSaved }: Props) {
  const [form, setForm] = useState<VenueForm>(BLANK);
  const [showDay, setShowDay] = useState<ShowDayContacts>(BLANK_SHOW_DAY_CONTACTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const bound = useRef(false);
  const dialogRef = useModalKeys<HTMLDivElement>(saving ? () => undefined : onClose);

  // Bind Google autocomplete once, when the Maps script is ready.
  useEffect(() => {
    const Ctor = window.google?.maps?.places?.Autocomplete;
    if (!mapsReady || !Ctor || !searchRef.current || bound.current) return;
    bound.current = true;
    const ac = new Ctor(searchRef.current, {
      types: ['establishment'],
      fields: ['name', 'formatted_address', 'address_components', 'geometry', 'formatted_phone_number', 'website', 'place_id', 'url'],
    });
    ac.addListener('place_changed', () => {
      const p = ac.getPlace();
      if (!p?.name) return;
      const get = (type: string, short = false): string => {
        const c = p.address_components?.find(x => x.types.includes(type));
        return c ? (short ? c.short_name : c.long_name) : '';
      };
      setForm(f => ({
        ...f,
        name: p.name || f.name,
        address: p.formatted_address || f.address,
        city: get('locality') || get('sublocality') || f.city,
        state: get('administrative_area_level_1', true) || f.state,
        phone: p.formatted_phone_number || f.phone,
        website: p.website || f.website,
        place_id: p.place_id || '',
        google_maps_url: p.url || '',
      }));
    });
  }, [mapsReady]);

  const set = (k: keyof VenueForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (saving) return;
    setError('');
    if (!form.name.trim()) { setError('Venue name is required.'); return; }
    if (!form.city.trim()) { setError('City is required.'); return; }
    setSaving(true);
    try {
      const s = await getVenueSession();
      if (!s) { setError('Your session expired. Sign in again to add a venue.'); return; }
      if (!s.actId) { setError('Your account isn’t linked to a band yet.'); return; }
      const genres = form.music_genres.split(',').map(g => g.trim()).filter(Boolean);
      const { error: insertError } = await supabase.from('venues').insert({
        act_id: s.actId,
        name: form.name.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        venue_type: form.venue_type || null,
        capacity: parseCapacity(form.capacity),
        place_id: form.place_id || null,
        google_maps_url: form.google_maps_url || null,
        music_genres: genres.length ? genres : null,
        booking_contact: form.booking_contact.trim() || null,
        ...venueColumns(showDay),
        notes: form.notes.trim() || null,
        created_by: s.userId,
      });
      if (insertError) {
        console.error('[venues] add venue failed', { code: insertError.code });
        setError(insertError.code === '23505'
          ? 'That venue is already in your list.'
          : 'The venue couldn’t be saved. Check the fields and try again.');
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const types = venueTypes.length > 0
    ? venueTypes
    : FALLBACK_TYPES.map(t => ({ value: t, label: t.replace(/_/g, ' ') }));

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal venues-modal" role="dialog" aria-modal="true" aria-labelledby="add-venue-title">
        <div className="modal-header">
          <h3 className="modal-title" id="add-venue-title">Add venue</h3>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" onClick={onClose} disabled={saving}>✕</button>
        </div>

        <div className="field venues-places">
          <label className="field-label" htmlFor="venue-places-search">Search Google Maps</label>
          <input
            id="venue-places-search"
            ref={searchRef}
            className="input"
            placeholder={mapsReady ? 'Type a venue name or address…' : 'Map search is unavailable — fill in the form below'}
            disabled={!mapsReady}
            autoFocus={mapsReady}
          />
          <span className="venues-hint">{mapsReady ? 'Pick a result to fill in the form.' : 'You can still add the venue by hand.'}</span>
        </div>

        <form onSubmit={save} className="venues-form" noValidate>
          {error && <p className="venues-error" role="alert">{error}</p>}
          <div className="field">
            <label className="field-label" htmlFor="venue-name">Venue name *</label>
            <input id="venue-name" className="input" value={form.name} onChange={set('name')} required autoFocus={!mapsReady} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="venue-address">Address</label>
            <input id="venue-address" className="input" value={form.address} onChange={set('address')} autoComplete="street-address" />
          </div>
          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="venue-city">City *</label>
              <input id="venue-city" className="input" value={form.city} onChange={set('city')} required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="venue-state">State *</label>
              <input id="venue-state" className="input" value={form.state} onChange={set('state')} placeholder="TX" required maxLength={2} />
            </div>
          </div>
          <fieldset className="venues-fieldset">
            <legend className="venues-section-title venues-legend">Venue Contact</legend>
            <p className="venues-hint">The venue's talent buyer or booking manager — who you book the show with.</p>
            <div className="field">
              <label className="field-label" htmlFor="venue-contact-name">Contact name</label>
              <input id="venue-contact-name" className="input" value={form.booking_contact} onChange={set('booking_contact')} autoComplete="off" placeholder="e.g. Jess Carter" />
            </div>
            <div className="grid-2">
              <div className="field">
                <label className="field-label" htmlFor="venue-email">Booking email</label>
                <input id="venue-email" className="input" type="email" value={form.email} onChange={set('email')} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="venue-phone">Phone</label>
                <input id="venue-phone" className="input" type="tel" value={form.phone} onChange={set('phone')} />
              </div>
            </div>
          </fieldset>
          <ShowDayContactFields
            idPrefix="add-venue"
            value={showDay}
            onChange={setShowDay}
            disabled={saving}
            hint="Who you deal with on show night. Every new show here starts with these filled in, and you can change them per show."
          />
          <div className="grid-2">
            <div className="field">
              <label className="field-label" htmlFor="venue-type">Venue type</label>
              <select id="venue-type" className="select" value={form.venue_type} onChange={set('venue_type')}>
                <option value="">—</option>
                {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="venue-capacity">Capacity</label>
              <input id="venue-capacity" className="input" inputMode="numeric" value={form.capacity} onChange={set('capacity')} />
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="venue-website">Website</label>
            <input id="venue-website" className="input" type="url" value={form.website} onChange={set('website')} placeholder="https://…" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="venue-genres">Music genres</label>
            <input id="venue-genres" className="input" value={form.music_genres} onChange={set('music_genres')} placeholder="Rock, Jazz, Folk (comma-separated)" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="venue-notes">Notes</label>
            <textarea id="venue-notes" className="textarea" rows={3} value={form.notes} onChange={set('notes')} placeholder="Anything worth remembering about this venue…" />
          </div>
          {form.google_maps_url && (
            <p className="venues-hint venues-linked">
              ✓ Linked to Google Maps · <a href={form.google_maps_url} target="_blank" rel="noopener noreferrer">view ↗</a>
            </p>
          )}
          <div className="venues-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add venue'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
