// components/booker/VenueSearchPanel.tsx
// Inline venue search for the Booking Agent workspace: Google Places by city
// and state, optionally narrowed by a venue name or type, with one-click add
// to the agent's venue book.
//
// Used in two places, so it renders no <form> of its own (it sits inside the
// Add Show form, and forms cannot nest). Enter in any field runs the search
// and is stopped from submitting a surrounding form.
//
//   • Venues page — always visible at the top; results link to the profile.
//   • Add/Edit Show — "Use this venue" adds it if needed and selects it.

import { useId, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { addVenueFromSearch, searchVenuesNear, type VenueSearchResult } from '../../lib/booker/data';
import { VENUE_KINDS, VENUE_KIND_LABEL, type BookerVenue, type VenueKind } from '../../lib/booker/types';
import { SEARCH_SUGGESTIONS, searchInputError } from '../../lib/booker/venueSearch';
import { nearbyTag, searchSummary } from '../../lib/placeLocality';
import { ErrorBanner } from './ui';

type RowState = { state: 'idle' | 'adding' | 'added' | 'error'; venueId?: string; message?: string };

interface Props {
  /** Called with the saved venue each time a result is added to the book. */
  onAdded?: (venue: BookerVenue) => void;
  /**
   * Pick mode (inside the show form). Each result offers "Use this venue";
   * the venue is added to the book first when it is not already there.
   */
  onUse?: (venue: BookerVenue) => void;
  /** Venues already loaded on the page, so picking one in the book needs no request. */
  knownVenues?: BookerVenue[];
  initialCity?: string;
  initialState?: string;
  /** Shorter results list for use inside a dialog. */
  compact?: boolean;
  /** Visible heading; omit when the surrounding UI already labels the panel. */
  heading?: string;
}

export default function VenueSearchPanel({ onAdded, onUse, knownVenues = [], initialCity = '', initialState = '', compact = false, heading }: Props) {
  const uid = useId();
  const [city, setCity] = useState(initialCity);
  const [state, setState] = useState(initialState);
  const [what, setWhat] = useState('');
  const [kind, setKind] = useState<VenueKind>('venue');
  const [results, setResults] = useState<VenueSearchResult[] | null>(null);
  const [searchedCity, setSearchedCity] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const runSearch = async () => {
    const invalid = searchInputError(city, state);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    setSearching(true);
    try {
      const r = await searchVenuesNear(city.trim(), state.trim(), what.trim() || undefined);
      setResults(r);
      setSearchedCity(city.trim());
      setRows({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  // Enter in a text field searches, and never submits a surrounding form (the
  // show form). Buttons keep their own Enter behaviour.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      void runSearch();
    }
  };

  const setRow = (placeId: string, row: RowState) => setRows(prev => ({ ...prev, [placeId]: row }));

  /** Saves a result to the book (idempotent server-side per place_id). */
  const add = async (r: VenueSearchResult): Promise<BookerVenue | null> => {
    setRow(r.place_id, { state: 'adding' });
    try {
      const { venue } = await addVenueFromSearch(r, kind);
      setRow(r.place_id, { state: 'added', venueId: venue.id });
      onAdded?.(venue);
      return venue;
    } catch (err) {
      setRow(r.place_id, { state: 'error', message: err instanceof Error ? err.message : 'Could not add.' });
      return null;
    }
  };

  const use = async (r: VenueSearchResult) => {
    if (!onUse) return;
    // Already in the book (matched by Google id or by name+city): select it as is,
    // rather than creating a second copy of a venue the agent typed in by hand.
    const known = r.venue_id ? knownVenues.find(v => v.id === r.venue_id) : undefined;
    if (known) {
      onUse(known);
      return;
    }
    const venue = await add(r);
    if (venue) onUse(venue);
  };

  const listId = `${uid}-suggest`;
  const ids = { city: `${uid}-city`, state: `${uid}-state`, what: `${uid}-what`, kind: `${uid}-kind` };

  return (
    <section role="search" aria-label={heading ?? 'Find venues'} onKeyDown={onKeyDown}>
      {heading && (
        <h2 className="display" style={{ fontSize: '1.35rem', margin: '0 0 0.6rem', color: 'var(--text)' }}>
          {heading}
        </h2>
      )}
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', alignItems: 'end' }}>
        <div>
          <label className="field-label" htmlFor={ids.city} style={{ display: 'block', marginBottom: 4 }}>
            City <span aria-hidden="true" style={{ color: 'var(--accent)' }}>*</span>
          </label>
          <input id={ids.city} className="input" value={city} onChange={e => setCity(e.target.value)} autoComplete="address-level2" required aria-required="true" />
        </div>
        <div>
          <label className="field-label" htmlFor={ids.state} style={{ display: 'block', marginBottom: 4 }}>
            State <span aria-hidden="true" style={{ color: 'var(--accent)' }}>*</span>
          </label>
          <input id={ids.state} className="input" value={state} onChange={e => setState(e.target.value)} autoComplete="address-level1" required aria-required="true" />
        </div>
        <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
          <label className="field-label" htmlFor={ids.what} style={{ display: 'block', marginBottom: 4 }}>
            Venue name or type <span className="text-muted">(optional)</span>
          </label>
          <input id={ids.what} className="input" list={listId} value={what} onChange={e => setWhat(e.target.value)} placeholder="e.g. Gruene Hall, dance hall, winery" />
          <datalist id={listId}>
            {SEARCH_SUGGESTIONS.map(s => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void runSearch()} disabled={searching} aria-busy={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted" style={{ margin: '0.75rem 0 0', flexWrap: 'wrap' }}>
        <label htmlFor={ids.kind}>Save results as</label>
        <select id={ids.kind} className="select" style={{ width: 'auto', padding: '0.35rem 0.6rem' }} value={kind} onChange={e => setKind(e.target.value as VenueKind)}>
          {VENUE_KINDS.map(k => (
            <option key={k} value={k}>
              {VENUE_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        {results && !searching && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setResults(null)}>
            Clear results
          </button>
        )}
      </div>

      {error && (
        <div style={{ marginTop: '0.75rem' }}>
          <ErrorBanner message={error} />
        </div>
      )}

      <div aria-live="polite" style={{ marginTop: results || searching ? '0.75rem' : 0 }}>
        {searching && <p className="text-sm text-muted">Searching Google for venues in and around {city.trim()}…</p>}
        {results && !searching && results.length === 0 && <p className="text-sm text-muted">No venues found. Try a nearby city, or a different name or type.</p>}
        {results && !searching && results.length > 0 && (
          <>
            <p className="text-xs text-muted" style={{ margin: '0 0 0.4rem' }}>
              {searchSummary(results, searchedCity)}
              {results.some(r => !r.in_searched_city) && ' — nearby venues are saved under their own town'}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem', maxHeight: compact ? '16rem' : '28rem', overflowY: 'auto' }}>
              {results.map(r => (
                <ResultRow key={r.place_id} result={r} row={rows[r.place_id]} pickMode={Boolean(onUse)} onAdd={() => void add(r)} onUse={() => void use(r)} />
              ))}
            </ul>
          </>
        )}
      </div>
      {!compact && (
        <p className="text-xs text-muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          Added venues come with their website and phone from Google. Open one and use “Scan website for contacts” to pull its booking contact.
        </p>
      )}
    </section>
  );
}

function ResultRow({ result: r, row, pickMode, onAdd, onUse }: { result: VenueSearchResult; row?: RowState; pickMode: boolean; onAdd: () => void; onUse: () => void }) {
  const inBook = r.already_added || row?.state === 'added';
  const venueId = row?.venueId ?? r.venue_id;
  const busy = row?.state === 'adding';
  const tag = nearbyTag(r);

  let action;
  if (pickMode) {
    action = (
      <button type="button" className="btn btn-secondary btn-sm" style={{ whiteSpace: 'nowrap' }} onClick={onUse} disabled={busy} aria-busy={busy} aria-label={`Use ${r.name} for this show`}>
        {busy ? 'Adding…' : 'Use this venue'}
      </button>
    );
  } else if (inBook && venueId) {
    action = (
      <Link href={`/agent/venues/${venueId}`} className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }}>
        In your book →
      </Link>
    );
  } else {
    action = (
      <button type="button" className="btn btn-secondary btn-sm" onClick={onAdd} disabled={busy} aria-busy={busy} aria-label={`Add ${r.name} to your venue book`}>
        {busy ? 'Adding…' : '+ Add'}
      </button>
    );
  }

  return (
    <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.8rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', color: 'var(--text)', fontWeight: 800 }}>
          {r.name}
          {pickMode && inBook && <span className="text-xs text-muted" style={{ fontWeight: 600 }}> · in your book</span>}
        </span>
        {tag && (
          <span className="text-xs" style={{ display: 'inline-block', margin: '0.15rem 0', padding: '0.05rem 0.45rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>
            {tag}
          </span>
        )}
        <span className="text-xs text-muted" style={{ display: 'block' }}>
          {r.formatted_address}
          {r.rating !== null ? ` · ★ ${r.rating} (${r.user_ratings_total})` : ''}
        </span>
        {row?.state === 'error' && (
          <span role="alert" className="text-xs" style={{ color: 'var(--red)' }}>
            {row.message}
          </span>
        )}
      </span>
      {action}
    </li>
  );
}
