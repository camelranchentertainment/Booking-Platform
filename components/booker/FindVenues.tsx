// components/booker/FindVenues.tsx
// "Find venues" dialog: search Google Places by city/state (and optional kind
// of place), then add results to the agent's venue book with one click.

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { addVenueFromSearch, searchVenuesNear, type VenueSearchResult } from '../../lib/booker/data';
import { VENUE_KINDS, VENUE_KIND_LABEL, type VenueKind } from '../../lib/booker/types';
import { ErrorBanner, Field, Modal } from './ui';

const SUGGESTED_SEARCHES = ['', 'dance hall', 'saloon', 'winery', 'brewery', 'listening room', 'festival'];

type RowState = 'idle' | 'adding' | 'added' | 'error';

export default function FindVenues({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [what, setWhat] = useState('');
  const [kind, setKind] = useState<VenueKind>('venue');
  const [results, setResults] = useState<VenueSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Record<string, { state: RowState; venueId?: string; message?: string }>>({});

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (!city.trim() || !state.trim()) {
      setError('Enter a city and state to search.');
      return;
    }
    setError('');
    setSearching(true);
    try {
      const r = await searchVenuesNear(city.trim(), state.trim(), what.trim() || undefined);
      setResults(r);
      setRows({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const add = async (r: VenueSearchResult) => {
    setRows(prev => ({ ...prev, [r.place_id]: { state: 'adding' } }));
    try {
      const { venue } = await addVenueFromSearch(r, kind);
      setRows(prev => ({ ...prev, [r.place_id]: { state: 'added', venueId: venue.id } }));
      onAdded();
    } catch (err) {
      setRows(prev => ({ ...prev, [r.place_id]: { state: 'error', message: err instanceof Error ? err.message : 'Could not add.' } }));
    }
  };

  return (
    <Modal title="Find venues" onClose={onClose} wide>
      <form onSubmit={search} noValidate role="search" style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', alignItems: 'end' }}>
        <Field label="City" required>
          {p => <input {...p} className="input" value={city} onChange={e => setCity(e.target.value)} autoComplete="address-level2" />}
        </Field>
        <Field label="State" required>
          {p => <input {...p} className="input" value={state} onChange={e => setState(e.target.value)} autoComplete="address-level1" placeholder="TX" />}
        </Field>
        <Field label="Looking for">
          {p => (
            <select {...p} className="select" value={what} onChange={e => setWhat(e.target.value)}>
              {SUGGESTED_SEARCHES.map(s => (
                <option key={s} value={s}>
                  {s === '' ? 'Any live-music venue' : s.replace(/^\w/, c => c.toUpperCase())}
                </option>
              ))}
            </select>
          )}
        </Field>
        <button type="submit" className="btn btn-primary" disabled={searching} aria-busy={searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      <div className="flex items-center gap-2 text-sm text-muted" style={{ margin: '0.9rem 0 0.25rem', flexWrap: 'wrap' }}>
        <label htmlFor="fv-kind">Save results as</label>
        <select id="fv-kind" className="select" style={{ width: 'auto', padding: '0.35rem 0.6rem' }} value={kind} onChange={e => setKind(e.target.value as VenueKind)}>
          {VENUE_KINDS.map(k => (
            <option key={k} value={k}>
              {VENUE_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      {error && <ErrorBanner message={error} />}

      <div aria-live="polite" style={{ marginTop: '0.75rem' }}>
        {searching && <p className="text-sm text-muted">Searching Google for venues in {city}…</p>}
        {results && !searching && results.length === 0 && <p className="text-sm text-muted">No venues found. Try a nearby city or a different “Looking for”.</p>}
        {results && !searching && results.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem', maxHeight: '50vh', overflowY: 'auto' }}>
            {results.map(r => {
              const row = rows[r.place_id];
              const inBook = r.already_added || row?.state === 'added';
              const venueId = row?.venueId ?? r.venue_id;
              return (
                <li key={r.place_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.8rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface)' }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', color: 'var(--text)', fontWeight: 800 }}>{r.name}</span>
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
                  {inBook && venueId ? (
                    <Link href={`/booker/venues/${venueId}`} className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }}>
                      In your book →
                    </Link>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => add(r)} disabled={row?.state === 'adding'} aria-busy={row?.state === 'adding'} aria-label={`Add ${r.name}`}>
                      {row?.state === 'adding' ? 'Adding…' : '+ Add'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted" style={{ marginTop: '0.9rem', marginBottom: 0 }}>
        Added venues come with their website and phone from Google. Open one and use “Scan website for contacts” to pull its booking contact.
      </p>
    </Modal>
  );
}
