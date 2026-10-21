// pages/venues/index.tsx
//
// Venues — the band's rolodex of rooms and talent buyers.
//
// Layout (Phase 3 redesign, Oct 2026 — matches the Tours page):
//   1. Illustrated main-street hero with "+ Add venue".
//   2. Four metric trackers built around contact coverage: how many venues,
//      how many have a booking email, how many can be scanned for one, and
//      how many need a hand search. "Find emails" lives on its tracker.
//   3. Discover: Google search for rooms in a town.
//   4. Toolbar (By state / Table, search, filters, import tools) and the list.
//
// Counting and filtering live in lib/domain/venueStats.ts and the paste
// parser in lib/domain/venueImport.ts (both unit-tested). The dialogs are in
// components/venues/. This file loads rows, holds UI state and renders.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import PageHero from '../../components/layout/PageHero';
import MainStreetScene from '../../components/venues/MainStreetScene';
import StateTileGrid from '../../components/venues/StateTileGrid';
import DiscoverPanel from '../../components/venues/DiscoverPanel';
import AddVenueModal from '../../components/venues/AddVenueModal';
import BulkImportModal from '../../components/venues/BulkImportModal';
import AddToTourModal from '../../components/venues/AddToTourModal';
import DeleteVenueDialog from '../../components/venues/DeleteVenueDialog';
import { getVenueSession, authHeader } from '../../components/venues/venueSession';
import VenueDrawer from '../../components/VenueDrawer';
import ImportModal from '../../components/ImportModal';
import VenueTownCheck from '../../components/VenueTownCheck';
import { Venue } from '../../lib/types';
import { useLookup } from '../../lib/hooks/useLookup';
import { mergeSavedVenue } from '../../lib/venueList';
import {
  summarizeVenues, enrichable, filterVenues, groupByState, filterOptions,
} from '../../lib/domain/venueStats';

type LoadState = 'loading' | 'ready' | 'error';
type View = 'state' | 'table';

/** Per-venue email scan status. `found` carries the address that was found. */
type EnrichStatus = { kind: 'scanning' } | { kind: 'found'; email: string } | { kind: 'notfound' } | { kind: 'error' };

interface BulkRun { done: number; total: number; found: number; missed: number; running: boolean }

const VIEW_LABELS: Readonly<Record<View, string>> = { state: 'By state', table: 'Table' };

const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** Loads the band's venues through the server route (it scopes to the caller's band). Never throws. */
async function fetchVenues(): Promise<Venue[] | null> {
  try {
    const s = await getVenueSession();
    if (!s) return null;
    const res = await fetch('/api/venues/list', { headers: authHeader(s.token) });
    if (!res.ok) { console.error('[venues] list failed', res.status); return null; }
    return (await res.json()) as Venue[];
  } catch (err) {
    console.error('[venues] list threw', err);
    return null;
  }
}

/** Scans one venue's website for a booking email. Never throws. */
async function scanVenue(venue: Pick<Venue, 'id' | 'website'>, token: string): Promise<EnrichStatus> {
  if (!venue.website) return { kind: 'notfound' };
  try {
    const res = await fetch('/api/venues/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify({ url: venue.website, venueId: venue.id }),
    });
    if (!res.ok) return { kind: 'error' };
    const { extracted } = (await res.json()) as { extracted?: { booking_email?: string; general_email?: string } };
    const email = extracted?.booking_email || extracted?.general_email;
    return email ? { kind: 'found', email } : { kind: 'notfound' };
  } catch {
    return { kind: 'error' };
  }
}

/** Loads the Google Maps Places script once, for the Add-venue search. Resolves false when Maps isn't configured. */
async function loadGoogleMaps(): Promise<boolean> {
  if (window.google?.maps?.places) return true;
  try {
    const res = await fetch('/api/admin/public-config');
    if (!res.ok) return false;
    const { googleMapsApiKey } = (await res.json()) as { googleMapsApiKey?: string };
    if (!googleMapsApiKey) return false;
    return await new Promise<boolean>(resolve => {
      window.initGooglePlaces = () => resolve(true);
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsApiKey)}&libraries=places&callback=initGooglePlaces`;
      s.async = true;
      s.defer = true;
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  } catch {
    return false;
  }
}

// ── Row pieces ────────────────────────────────────────────────────────────────

/** What we know about a venue's booking email, including a scan in progress. */
function EmailStatus({ venue, status }: { venue: Venue; status: EnrichStatus | undefined }) {
  if (venue.email) return <span className="venues-email">✉ {venue.email}</span>;
  if (status?.kind === 'scanning') return <span className="venues-muted" role="status">Scanning site…</span>;
  if (status?.kind === 'found') return <span className="venues-email venues-email--new">✓ {status.email}</span>;
  if (status?.kind === 'error') return <span className="venues-muted">Scan failed</span>;
  if (status?.kind === 'notfound' || venue.last_enriched_at) return <span className="venues-muted">No email on site</span>;
  if (!venue.website) return <span className="venues-muted">No website</span>;
  return <span className="venues-muted">No email yet</span>;
}

interface RowActionsProps {
  venue: Venue;
  status: EnrichStatus | undefined;
  onScan: (v: Venue) => void;
  onTour: (v: Venue) => void;
  onDelete: (v: Venue) => void;
}

function RowActions({ venue, status, onScan, onTour, onDelete }: RowActionsProps) {
  return (
    <div className="venues-row-actions">
      {venue.website && !venue.email && status?.kind !== 'found' && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={status?.kind === 'scanning'}
          onClick={() => onScan(venue)} aria-label={`Find a booking email for ${venue.name}`}>
          {status?.kind === 'scanning' ? '…' : 'Find email'}
        </button>
      )}
      <button type="button" className="btn btn-ghost btn-sm venues-accent" onClick={() => onTour(venue)}
        aria-label={`Add ${venue.name} to a tour`}>
        + Tour
      </button>
      <button type="button" className="btn btn-ghost btn-sm venues-danger" onClick={() => onDelete(venue)}
        aria-label={`Delete ${venue.name}`}>
        ✕
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VenuesPage() {
  const { values: venueTypes } = useLookup('venue_type');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [mapsReady, setMapsReady] = useState(false);

  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterGenre, setFilterGenre] = useState('');
  const [view, setView] = useState<View>('state');
  const [openState, setOpenState] = useState<string | null>(null);
  const statePanelRef = useRef<HTMLDivElement>(null);

  const [enrich, setEnrich] = useState<Record<string, EnrichStatus>>({});
  const [bulk, setBulk] = useState<BulkRun | null>(null);
  const stopBulk = useRef(false);

  const [showAdd, setShowAdd] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showFileImport, setShowFileImport] = useState(false);
  const [tourTarget, setTourTarget] = useState<Venue | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Venue | null>(null);
  const [drawerVenueId, setDrawerVenueId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchVenues().then(list => {
      if (cancelled) return;
      if (list === null) { setLoadState('error'); return; }
      setVenues(list);
      setLoadState('ready');
    });
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    void loadGoogleMaps().then(ok => { if (!cancelled) setMapsReady(ok); });
    return () => { cancelled = true; };
  }, []);

  /** Re-reads the list in place (no loading skeleton), after a save, scan or delete. */
  const refresh = useCallback(async (): Promise<void> => {
    const list = await fetchVenues();
    if (list) setVenues(list);
  }, []);

  // Bring a newly opened state's venue list into view under the tiles.
  useEffect(() => {
    if (!openState) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    statePanelRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [openState]);

  // Stop a bulk scan if the page goes away mid-run.
  useEffect(() => () => { stopBulk.current = true; }, []);

  const summary = useMemo(() => summarizeVenues(venues), [venues]);
  const options = useMemo(() => filterOptions(venues), [venues]);
  const filtered = useMemo(
    () => filterVenues(venues, { search, state: filterState, genre: filterGenre }),
    [venues, search, filterState, filterGenre],
  );
  const groups = useMemo(() => groupByState(filtered), [filtered]);
  const toScan = useMemo(() => enrichable(venues), [venues]);
  const shownState = openState && groups.some(g => g.state === openState) ? openState : null;
  const filtersOn = !!(search.trim() || filterState || filterGenre);

  const scanOne = async (v: Venue): Promise<void> => {
    const s = await getVenueSession();
    if (!s) return;
    setEnrich(prev => ({ ...prev, [v.id]: { kind: 'scanning' } }));
    const result = await scanVenue(v, s.token);
    setEnrich(prev => ({ ...prev, [v.id]: result }));
    void refresh();
  };

  const scanAll = async (): Promise<void> => {
    const list = toScan;
    if (list.length === 0 || bulk?.running) return;
    const s = await getVenueSession();
    if (!s) return;
    stopBulk.current = false;
    const run: BulkRun = { done: 0, total: list.length, found: 0, missed: 0, running: true };
    setBulk({ ...run });
    // One at a time: the scraper fetches third-party sites, so be polite and predictable.
    for (const v of list) {
      if (stopBulk.current) break;
      setEnrich(prev => ({ ...prev, [v.id]: { kind: 'scanning' } }));
      const result = await scanVenue(v, s.token);
      setEnrich(prev => ({ ...prev, [v.id]: result }));
      run.done++;
      if (result.kind === 'found') run.found++; else run.missed++;
      setBulk({ ...run });
    }
    setEnrich(prev => {
      // Anything left "scanning" by a stop goes back to idle.
      const next = { ...prev };
      for (const [id, st] of Object.entries(next)) if (st.kind === 'scanning') delete next[id];
      return next;
    });
    setBulk({ ...run, running: false });
    void refresh();
  };

  const heroSummary = loadState === 'ready' && summary.total > 0
    ? `${plural(summary.total, 'venue')} across ${plural(summary.states, 'state')} — ${summary.withEmail === summary.total ? 'every one has a booking email.' : `${(summary.total - summary.withEmail).toLocaleString()} still need a booking email.`}`
    : undefined;

  const rowProps = { onScan: (v: Venue) => void scanOne(v), onTour: setTourTarget, onDelete: setDeleteTarget };

  return (
    <AppShell requireRole="band_admin">
      <PageHero
        title="Venues"
        subtitle="Rooms, talent buyers & contacts"
        summary={heroSummary}
        scene={<MainStreetScene />}
        actions={<button type="button" className="btn btn-primary tours-new-btn" onClick={() => setShowAdd(true)}>+ Add venue</button>}
      />

      {loadState === 'loading' && (
        <div className="tours-body" aria-busy="true">
          <span className="sr-only" role="status">Loading venues…</span>
          <div className="tours-metrics">{[0, 1, 2, 3].map(i => <div key={i} className="tour-metric tour-skeleton" />)}</div>
          <div className="venues-discover tour-skeleton venues-skeleton-strip" />
          <div className="tours-grid">{[0, 1, 2, 3].map(i => <div key={i} className="tour-card tour-skeleton" />)}</div>
        </div>
      )}

      {loadState === 'error' && (
        <div className="card tours-empty" role="alert">
          <div className="tours-empty-title">Venues didn’t load</div>
          <p>Something went wrong reaching the database. Your venues are safe — try again.</p>
          <button type="button" className="btn btn-primary" onClick={() => { setLoadState('loading'); setReloadKey(k => k + 1); }}>Try again</button>
        </div>
      )}

      {loadState === 'ready' && (
        <div className="tours-body">
          {summary.total > 0 && (
            <section className="tours-metrics" aria-label="Venue contact coverage">
              <div className="tour-metric">
                <span className="tour-metric-label">Venues</span>
                <div className="tour-metric-value"><strong>{summary.total.toLocaleString()}</strong><span>across {plural(summary.states, 'state')}</span></div>
                <span className="tour-metric-note">{plural(options.genres.length, 'genre tag')} in use</span>
              </div>
              <div className="tour-metric">
                <span className="tour-metric-label">Booking emails</span>
                <div className="tour-metric-value"><strong>{summary.withEmail.toLocaleString()}</strong><span>of {summary.total.toLocaleString()} · {summary.emailPct}%</span></div>
                <div className="tour-meter" role="progressbar" aria-label="Venues with a booking email"
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.emailPct}>
                  <div className="tour-meter-bar" style={{ width: `${summary.emailPct}%` }} />
                </div>
              </div>
              <div className="tour-metric">
                <span className="tour-metric-label">Ready to scan</span>
                <div className="tour-metric-value">
                  <strong className={summary.canEnrich > 0 ? 'tour-metric-hot' : undefined}>{summary.canEnrich.toLocaleString()}</strong>
                  <span>have a website, no email</span>
                </div>
                {bulk?.running ? (
                  <div className="venues-bulk" role="status">
                    <span>Scanning {bulk.done} of {bulk.total} · {bulk.found} found</span>
                    <button type="button" className="venues-link-btn" onClick={() => { stopBulk.current = true; }}>Stop</button>
                  </div>
                ) : summary.canEnrich > 0 ? (
                  <button type="button" className="btn btn-secondary btn-sm venues-metric-btn" onClick={() => void scanAll()}>
                    Find {plural(summary.canEnrich, 'email')}
                  </button>
                ) : (
                  <span className="tour-metric-note">Nothing left to scan</span>
                )}
              </div>
              <div className="tour-metric">
                <span className="tour-metric-label">Hand search</span>
                <div className="tour-metric-value"><strong>{summary.noLead.toLocaleString()}</strong><span>no email or website</span></div>
                <span className="tour-metric-note">Try their Facebook or Instagram, then add it in the venue drawer.</span>
              </div>
            </section>
          )}

          {bulk && !bulk.running && (
            <div className="venues-banner" role="status">
              <span><strong>{bulk.found}</strong> new email{bulk.found === 1 ? '' : 's'} found · {bulk.missed} without one on their site{bulk.done < bulk.total ? ` · stopped after ${bulk.done} of ${bulk.total}` : ''}</span>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Dismiss" onClick={() => setBulk(null)}>✕</button>
            </div>
          )}

          <DiscoverPanel venues={venues} onOpenVenue={setDrawerVenueId} onVenuesChanged={() => void refresh()} />

          <div className="tours-toolbar venues-toolbar">
            <div className="tours-tabs" role="group" aria-label="Show venues">
              {(Object.keys(VIEW_LABELS) as View[]).map(k => (
                <button key={k} type="button" className={`tours-tab${view === k ? ' tours-tab--on' : ''}`}
                  aria-pressed={view === k} onClick={() => setView(k)}>
                  {VIEW_LABELS[k]}
                </button>
              ))}
            </div>
            <div className="venues-tools">
              <VenueTownCheck endpoint="/api/venues/towns" onApplied={() => void refresh()} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowFileImport(true)}>Import file</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowBulkImport(true)}>Paste a list</button>
            </div>
          </div>

          {venues.length > 0 && <div className="venues-filters" role="search">
            <label className="sr-only" htmlFor="venue-search">Search venues</label>
            <input id="venue-search" className="input venues-search" type="search" placeholder="Search name or city…"
              value={search} onChange={e => setSearch(e.target.value)} />
            <label className="sr-only" htmlFor="venue-filter-state">State</label>
            <select id="venue-filter-state" className="select" value={filterState} onChange={e => setFilterState(e.target.value)}>
              <option value="">All states</option>
              {options.states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {options.genres.length > 0 && (
              <>
                <label className="sr-only" htmlFor="venue-filter-genre">Genre</label>
                <select id="venue-filter-genre" className="select" value={filterGenre} onChange={e => setFilterGenre(e.target.value)}>
                  <option value="">All genres</option>
                  {options.genres.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </>
            )}
            <span className="tours-sort-note" role="status">
              {filtersOn ? `${plural(filtered.length, 'match', 'matches')}` : `${plural(venues.length, 'venue')}`}
            </span>
            {filtersOn && (
              <button type="button" className="venues-link-btn" onClick={() => { setSearch(''); setFilterState(''); setFilterGenre(''); }}>Clear filters</button>
            )}
          </div>}

          {venues.length === 0 ? (
            <div className="card tours-empty">
              <div className="tours-empty-title">No venues yet</div>
              <p>Search a town under Discover, paste a list you already have, or add a room by hand.</p>
              <button type="button" className="btn btn-primary" onClick={() => setShowAdd(true)}>Add your first venue</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="card tours-empty">
              <div className="tours-empty-title">No matches</div>
              <p>Nothing fits those filters.</p>
              <button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); setFilterState(''); setFilterGenre(''); }}>Clear filters</button>
            </div>
          ) : view === 'state' ? (
            <div>
              <StateTileGrid
                tiles={groups.map(g => ({ state: g.state, venueCount: g.venues.length, emailCount: g.emailCount }))}
                selected={shownState}
                onSelect={st => setOpenState(prev => (prev === st ? null : st))}
                panelId="state-venues-panel"
              />
              {shownState && (() => {
                const group = groups.find(g => g.state === shownState)!;
                return (
                  <section ref={statePanelRef} id="state-venues-panel" className="venues-state-panel" aria-labelledby="state-panel-title">
                    <header className="venues-state-head">
                      <h2 className="venues-state-code" id="state-panel-title">{group.state}</h2>
                      <span className="venues-muted">{plural(group.venues.length, 'venue')} · {group.emailCount} with email</span>
                      <button type="button" className="btn btn-ghost btn-sm venues-state-close" onClick={() => setOpenState(null)}
                        aria-label={`Close ${group.state} venues`}>✕</button>
                    </header>
                    <ul className="venues-list">
                      {group.venues.map(v => (
                        <li key={v.id} className="venues-row">
                          <div className="venues-row-main">
                            <button type="button" className="venues-row-name" onClick={() => setDrawerVenueId(v.id)}>{v.name}</button>
                            <span className="venues-row-meta">
                              {[v.city, v.venue_type?.replace(/_/g, ' '), v.capacity ? `cap ${v.capacity.toLocaleString()}` : null].filter(Boolean).join(' · ')}
                            </span>
                            <span className="venues-row-contact">
                              <EmailStatus venue={v} status={enrich[v.id]} />
                              {v.phone && <a className="venues-muted" href={`tel:${v.phone}`}>{v.phone}</a>}
                            </span>
                          </div>
                          <RowActions venue={v} status={enrich[v.id]} {...rowProps} />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })()}
              {!shownState && <p className="venues-hint venues-tile-hint">Pick a state to see its venues.</p>}
            </div>
          ) : (
            <div className="venues-table-wrap">
              <table className="venues-table">
                <caption className="sr-only">Venues</caption>
                <thead>
                  <tr>
                    <th scope="col">Venue</th><th scope="col">Location</th><th scope="col">Type</th>
                    <th scope="col">Capacity</th><th scope="col">Booking email</th><th scope="col">Phone</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(v => (
                    <tr key={v.id}>
                      <td><button type="button" className="venues-row-name" onClick={() => setDrawerVenueId(v.id)}>{v.name}</button></td>
                      <td>{[v.city, v.state].filter(Boolean).join(', ')}</td>
                      <td className="venues-cap">{v.venue_type?.replace(/_/g, ' ') || '—'}</td>
                      <td>{v.capacity ? v.capacity.toLocaleString() : '—'}</td>
                      <td><EmailStatus venue={v} status={enrich[v.id]} /></td>
                      <td>{v.phone ? <a className="venues-muted" href={`tel:${v.phone}`}>{v.phone}</a> : '—'}</td>
                      <td><RowActions venue={v} status={enrich[v.id]} {...rowProps} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <AddVenueModal mapsReady={mapsReady} venueTypes={venueTypes} onClose={() => setShowAdd(false)} onSaved={() => void refresh()} />
      )}
      {showBulkImport && <BulkImportModal onClose={() => setShowBulkImport(false)} onImported={() => void refresh()} />}
      {tourTarget && <AddToTourModal venue={tourTarget} onClose={() => setTourTarget(null)} />}
      {deleteTarget && (
        <DeleteVenueDialog venue={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => void refresh()} />
      )}
      {drawerVenueId && (
        <VenueDrawer
          venueId={drawerVenueId}
          isOpen={true}
          onClose={() => setDrawerVenueId(null)}
          onSaved={saved => {
            // Show the saved details at once, then re-sync with the server.
            setVenues(vs => mergeSavedVenue(vs, saved as Partial<Venue> & { id: string }));
            void refresh();
          }}
        />
      )}
      {showFileImport && (
        <ImportModal defaultType="venues" onClose={() => setShowFileImport(false)} onComplete={() => void refresh()} />
      )}
    </AppShell>
  );
}
