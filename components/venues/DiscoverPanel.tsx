// components/venues/DiscoverPanel.tsx
//
// "Discover" on the Venues page: search Google for venues in a town, see which
// are already in the band's list, and add new ones in one click. Adding pulls
// the venue's website and phone from Place Details, saves it, then scans the
// website for a booking email.

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { nearbyTag, searchSummary, townForSave } from '../../lib/placeLocality';
import { getVenueSession, authHeader } from './venueSession';

export interface ProspectResult {
  place_id: string; name: string; address: string;
  /** The venue's own town from its Google address (null if Google gave none) — not the searched town. */
  city: string | null; state: string | null;
  searched_city: string; searched_state: string; in_searched_city: boolean;
  formatted_address: string; rating: number | null; user_ratings_total: number;
  types: string[]; google_maps_url: string; already_added: boolean;
}

type AddStep = 'fetching' | 'saving' | 'scraping' | 'done';

const STEP_LABEL: Readonly<Record<AddStep, string>> = {
  fetching: 'Getting details…',
  saving: 'Saving…',
  scraping: 'Scanning site for an email…',
  done: 'Added',
};

/** Give up on a Google search after this long. */
const SEARCH_TIMEOUT_MS = 20_000;

interface Props {
  /** The band's venues, to open the drawer for results already in the list. */
  venues: ReadonlyArray<{ id: string; place_id?: string | null }>;
  onOpenVenue: (venueId: string) => void;
  /** Called after a venue is added or enriched so the page reloads its list. */
  onVenuesChanged: () => void;
}

/** Looks up website/phone/town for a place. Falls back to the search result's own fields. */
async function placeDetails(p: ProspectResult, token: string) {
  const fallback = { website: null as string | null, phone: null as string | null, city: p.city, state: p.state, street: p.address || null };
  try {
    const res = await fetch(`/api/venues/place-details?place_id=${encodeURIComponent(p.place_id)}`, { headers: authHeader(token) });
    if (!res.ok) return fallback;
    const d = (await res.json()) as { website?: string | null; phone?: string | null; city?: string | null; state?: string | null; street?: string | null };
    return {
      website: d.website ?? null,
      phone: d.phone ?? null,
      city: d.city ?? fallback.city,
      state: d.state ?? fallback.state,
      street: d.street ?? fallback.street,
    };
  } catch {
    return fallback;
  }
}

export default function DiscoverPanel({ venues, onOpenVenue, onVenuesChanged }: Props) {
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ProspectResult[]>([]);
  const [error, setError] = useState('');
  const [steps, setSteps] = useState<Record<string, AddStep>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const venueFor = (placeId: string): string | null => venues.find(v => v.place_id === placeId)?.id ?? null;

  const search = async (e?: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e?.preventDefault();
    if (!city.trim() || !state.trim() || searching) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    setSearching(true);
    setError('');
    setResults([]);
    try {
      const s = await getVenueSession();
      if (!s) { setError('Your session expired. Sign in again to search.'); return; }
      const res = await fetch(
        `/api/venues/prospect?city=${encodeURIComponent(city.trim())}&state=${encodeURIComponent(state.trim())}`,
        { headers: authHeader(s.token), signal: controller.signal },
      );
      const json = (await res.json().catch(() => null)) as ProspectResult[] | { error?: string } | null;
      if (!res.ok || !Array.isArray(json)) {
        setError((json && !Array.isArray(json) && json.error) || 'The search didn’t work. Try again.');
        return;
      }
      setResults(json);
      if (json.length === 0) setError(`Google found no venues in ${city.trim()}, ${state.trim()}. Try a nearby bigger town.`);
    } catch (err) {
      if (controller.signal.aborted && abortRef.current !== controller) return; // superseded by a newer search
      console.error('[venues] prospect search failed', err);
      setError(controller.signal.aborted ? 'Google took too long to answer. Try again.' : 'The search didn’t work. Try again.');
    } finally {
      clearTimeout(timer);
      if (abortRef.current === controller) setSearching(false);
    }
  };

  const add = async (p: ProspectResult): Promise<void> => {
    const setStep = (step: AddStep | null): void =>
      setSteps(prev => {
        const next = { ...prev };
        if (step) next[p.place_id] = step; else delete next[p.place_id];
        return next;
      });
    setStep('fetching');
    setError('');
    const s = await getVenueSession();
    if (!s?.actId) { setStep(null); setError('Your session expired or isn’t linked to a band. Sign in again.'); return; }

    const d = await placeDetails(p, s.token);
    setStep('saving');
    // venues.city/state are required: fall back to the searched town only when Google gave none.
    const town = townForSave({ city: d.city, state: d.state }, { city: p.searched_city, state: p.searched_state });
    const { data: created, error: insertError } = await supabase.from('venues').insert({
      act_id: s.actId,
      name: p.name,
      city: town.city,
      state: town.state,
      address: d.street,
      place_id: p.place_id,
      google_maps_url: p.google_maps_url,
      website: d.website || null,
      phone: d.phone || null,
      created_by: s.userId,
    }).select('id').single();

    if (insertError || !created) {
      console.error('[venues] add prospect failed', { placeId: p.place_id, code: insertError?.code });
      setStep(null);
      setError(`Couldn’t save ${p.name}. Try again, or add it by hand.`);
      return;
    }
    setResults(prev => prev.map(r => (r.place_id === p.place_id ? { ...r, already_added: true } : r)));
    onVenuesChanged();

    if (d.website) {
      setStep('scraping');
      try {
        const sr = await fetch('/api/venues/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader(s.token) },
          body: JSON.stringify({ url: d.website, venueId: created.id }),
        });
        if (sr.ok) {
          const { extracted } = (await sr.json()) as { extracted?: { booking_email?: string; general_email?: string } };
          const email = extracted?.booking_email || extracted?.general_email;
          if (email) setEmails(prev => ({ ...prev, [p.place_id]: email }));
          onVenuesChanged();
        }
      } catch { /* the venue is saved; a failed scan just means no email yet */ }
    }
    setStep('done');
  };

  const clear = (): void => { abortRef.current?.abort(); setResults([]); setCity(''); setState(''); setError(''); setSearching(false); };
  const inList = results.filter(r => r.already_added).length;

  return (
    <section className="venues-discover" aria-labelledby="discover-title">
      <div className="venues-discover-head">
        <div>
          <h2 className="venues-section-title" id="discover-title">Discover</h2>
          <p className="venues-hint">Search Google for rooms in a town you’re routing through.</p>
        </div>
        <form className="venues-discover-form" onSubmit={e => void search(e)}>
          <label className="sr-only" htmlFor="discover-city">City</label>
          <input id="discover-city" className="input" placeholder="City" value={city} onChange={e => setCity(e.target.value)} />
          <label className="sr-only" htmlFor="discover-state">State</label>
          <input id="discover-state" className="input venues-state-input" placeholder="ST" maxLength={2}
            value={state} onChange={e => setState(e.target.value.toUpperCase())} />
          <button type="submit" className="btn btn-primary" disabled={searching || !city.trim() || !state.trim()}>
            {searching ? 'Searching…' : 'Search'}
          </button>
          {(results.length > 0 || error) && <button type="button" className="btn btn-ghost" onClick={clear}>Clear</button>}
        </form>
      </div>

      {error && <p className="venues-error" role="alert">{error}</p>}

      {results.length > 0 && (
        <>
          <p className="venues-result-summary" role="status">
            {searchSummary(results, results[0]?.searched_city ?? city.trim())} · {inList} already in your list
          </p>
          <ul className="venues-results">
            {results.map(p => {
              const step = steps[p.place_id];
              const busy = !!step && step !== 'done';
              const existingId = p.already_added ? venueFor(p.place_id) : null;
              const tag = nearbyTag(p);
              return (
                <li key={p.place_id} className={`venues-result${p.already_added ? ' venues-result--in' : ''}`}>
                  <div className="venues-result-main">
                    <span className="venues-result-name">
                      {p.name}
                      {p.already_added && <span className="tour-badge tour-badge--live">In your list</span>}
                      {tag && <span className="tour-badge tour-badge--outline">{tag}</span>}
                    </span>
                    <span className="venues-result-meta">
                      {p.formatted_address}
                      {p.rating ? ` · ★ ${p.rating}` : ''}
                    </span>
                    {emails[p.place_id] && <span className="venues-accent">✉ {emails[p.place_id]}</span>}
                    {busy && <span className="venues-hint" role="status">{STEP_LABEL[step]}</span>}
                  </div>
                  <div className="venues-result-actions">
                    <a href={p.google_maps_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                      Maps ↗<span className="sr-only"> for {p.name} (new tab)</span>
                    </a>
                    {!p.already_added && (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => void add(p)} disabled={busy}
                        aria-label={`Add ${p.name} to your venues`}>
                        {busy ? '…' : '+ Add'}
                      </button>
                    )}
                    {existingId && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenVenue(existingId)}
                        aria-label={`Open ${p.name}`}>
                        Open →
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
