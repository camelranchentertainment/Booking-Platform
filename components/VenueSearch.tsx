'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SearchLocation { city: string; state: string; }

interface DiscoveredVenue {
  id?: string;
  name: string;
  address: string | null;
  city: string;
  state: string;
  phone: string | null;
  website: string | null;
  venue_type: string | null;
  email: string | null;
  // UI-only fields
  _searchKey: string;   // "City, ST" — which search produced this
  _savedId?: string;    // set once saved to DB
}

interface Campaign { id: string; name: string; }

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

// Persist session results so tab-switching doesn't wipe them
const SESSION_KEY = 'crb_venue_search_session';

function loadSession(): DiscoveredVenue[] {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveSession(venues: DiscoveredVenue[]) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(venues)); } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function VenueSearch() {
  // Search form
  const [locations, setLocations]   = useState<SearchLocation[]>([{ city: '', state: 'AR' }]);
  const [radius, setRadius]         = useState(25);
  const [searching, setSearching]   = useState(false);
  const [searchError, setSearchError] = useState('');

  // Session results
  const [results, setResults]       = useState<DiscoveredVenue[]>(() => loadSession());
  const [filterKey, setFilterKey]   = useState('ALL');

  // Campaigns (for "Add to Run" dropdown)
  const [campaigns, setCampaigns]   = useState<Campaign[]>([]);
  const [addingTo, setAddingTo]     = useState<{ venueId: string; campaignId: string } | null>(null);

  // Persist results to sessionStorage whenever they change
  useEffect(() => { saveSession(results); }, [results]);

  // Load active campaigns for the dropdown
  useEffect(() => {
    supabase.from('campaigns').select('id, name').eq('status', 'active')
      .order('name').then(({ data }) => setCampaigns(data || []));
  }, []);

  // ── Search form helpers ──────────────────────────────────────────────────
  const addLocation = () => setLocations(prev => [...prev, { city: '', state: 'AR' }]);
  const removeLocation = (i: number) =>
    setLocations(prev => prev.filter((_, idx) => idx !== i));
  const updateLocation = (i: number, field: keyof SearchLocation, val: string) =>
    setLocations(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));

  // ── Run search ───────────────────────────────────────────────────────────
  const handleSearch = async () => {
    const valid = locations.filter(l => l.city.trim());
    if (valid.length === 0) { setSearchError('Please enter at least one city.'); return; }
    setSearchError('');
    setSearching(true);

    try {
      const res = await fetch('/api/discover-venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: valid.map(l => ({ city: l.city.trim(), state: l.state })), radius }),
      });

      if (!res.ok) throw new Error('Search failed. Please try again.');
      const data = await res.json();

      // The discover API saves to DB and returns count — fetch what was just saved
      // We query the DB for venues matching our search cities, limited to recently created
      const cityNames = valid.map(l => l.city.trim().toLowerCase());

      const { data: fresh } = await supabase
        .from('venues')
        .select('id, name, address, city, state, phone, website, venue_type, email')
        .order('created_at', { ascending: false })
        .limit(200);

      const newVenues: DiscoveredVenue[] = (fresh || [])
        .filter((v: any) => cityNames.includes(v.city?.toLowerCase()))
        .map((v: any) => ({
          ...v,
          _searchKey: `${v.city}, ${v.state}`,
          _savedId: v.id,
        }));

      // Merge with existing session results — avoid dupes by id
      setResults(prev => {
        const existingIds = new Set(prev.map(v => v._savedId).filter(Boolean));
        const toAdd = newVenues.filter(v => !existingIds.has(v._savedId));
        return [...prev, ...toAdd];
      });

    } catch (err: any) {
      setSearchError(err.message || 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  // ── Add venue to a campaign/run ──────────────────────────────────────────
  const addToCampaign = async (venue: DiscoveredVenue, campaignId: string) => {
    if (!venue._savedId || !campaignId) return;
    setAddingTo({ venueId: venue._savedId, campaignId });
    try {
      await supabase.from('campaign_venues').upsert({
        campaign_id: campaignId,
        venue_id: venue._savedId,
        status: 'contact?',
      }, { onConflict: 'campaign_id,venue_id' });
    } catch (err) {
      console.error('Add to campaign error:', err);
    } finally {
      setAddingTo(null);
    }
  };

  // ── Derived state ────────────────────────────────────────────────────────
  const searchKeys = ['ALL', ...Array.from(new Set(results.map(v => v._searchKey))).sort()];
  const visible    = filterKey === 'ALL' ? results : results.filter(v => v._searchKey === filterKey);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .vs-wrap {
          background: #030d18;
          min-height: 100vh;
          padding: 2rem;
          font-family: 'Nunito', sans-serif;
        }
        .vs-input {
          background: rgba(9,24,40,0.9);
          border: 1px solid rgba(74,133,200,0.22);
          border-radius: 9px;
          padding: 10px 14px;
          color: #e8f1f8;
          font-family: 'Nunito', sans-serif;
          font-size: 14px;
          outline: none;
          transition: border-color .2s;
        }
        .vs-input::placeholder { color: #3d6285; }
        .vs-input:focus { border-color: rgba(74,133,200,0.55); }
        .vs-select {
          background: rgba(9,24,40,0.9);
          border: 1px solid rgba(74,133,200,0.22);
          border-radius: 9px;
          padding: 10px 12px;
          color: #e8f1f8;
          font-family: 'Nunito', sans-serif;
          font-size: 14px;
          outline: none;
          cursor: pointer;
        }
        .vs-btn-primary {
          background: linear-gradient(135deg, #3a7fc1, #2563a8);
          border: none; border-radius: 10px;
          color: #e8f1f8; font-family: 'Nunito', sans-serif;
          font-weight: 800; font-size: 15px; cursor: pointer;
          padding: 11px 28px;
          box-shadow: 0 4px 18px rgba(37,99,168,0.4);
          transition: transform .15s, box-shadow .15s;
        }
        .vs-btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(37,99,168,0.55);
        }
        .vs-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
        .vs-btn-ghost {
          background: transparent;
          border: 1px solid rgba(74,133,200,0.28);
          border-radius: 8px; color: #6baed6;
          font-family: 'Nunito', sans-serif;
          font-size: 13px; font-weight: 700; cursor: pointer;
          padding: 8px 16px; transition: background .15s;
        }
        .vs-btn-ghost:hover { background: rgba(74,133,200,0.1); }

        .vs-venue-card {
          background: rgba(9,24,40,0.75);
          border: 1px solid rgba(74,133,200,0.1);
          border-radius: 12px; padding: 16px 18px;
          display: flex; align-items: flex-start; gap: 16px;
          transition: border-color .18s, background .18s;
        }
        .vs-venue-card:hover {
          border-color: rgba(74,133,200,0.3);
          background: rgba(9,24,40,1);
        }
        .vs-tag {
          display: inline-block;
          padding: 2px 10px; border-radius: 99px;
          font-size: 11px; font-weight: 700;
          text-transform: capitalize;
        }
        .vs-filter-pill {
          padding: 6px 16px; border-radius: 99px;
          border: 1px solid rgba(74,133,200,0.2);
          background: transparent;
          color: #3d6285; font-family: 'Nunito', sans-serif;
          font-size: 12px; font-weight: 700; cursor: pointer;
          transition: all .15s; white-space: nowrap;
        }
        .vs-filter-pill:hover,
        .vs-filter-pill.active {
          background: rgba(58,127,193,0.18);
          border-color: rgba(74,133,200,0.45);
          color: #e8f1f8;
        }
        .vs-campaign-select {
          background: rgba(9,24,40,0.95);
          border: 1px solid rgba(74,133,200,0.25);
          border-radius: 7px; padding: 6px 10px;
          color: #e8f1f8; font-family: 'Nunito', sans-serif;
          font-size: 12px; outline: none; cursor: pointer;
          max-width: 160px;
        }
        @media (max-width: 1023px) {
          .vs-wrap { padding: 1.25rem; }
        }
        @media (max-width: 767px) {
          .vs-wrap { padding: 1rem; }
          .vs-btn-primary { width: 100%; min-height: 44px; margin-left: 0 !important; }
          .vs-btn-ghost { min-height: 44px; }
          .vs-input { width: 100%; }
          .vs-select { width: 100%; }
          .vs-venue-card { flex-direction: column; gap: 10px; }
          .vs-filter-row { flex-wrap: wrap; }
          .vs-results-header { flex-direction: column; align-items: flex-start !important; gap: 8px; }
        }
      `}</style>

      <div className="vs-wrap">
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div style={{ marginBottom: '1.75rem' }}>
            <h1 style={{
              fontFamily: "'Bebas Neue', cursive", fontWeight: 400,
              fontSize: 'clamp(1.8rem,3vw,2.4rem)', letterSpacing: '0.06em',
              color: '#ffffff', margin: 0, lineHeight: 1,
            }}>Venue Search</h1>
            <p style={{ color: '#3d6285', margin: '5px 0 0', fontSize: 13, fontWeight: 600 }}>
              Search for venues by city — results appear below and stay for this session.
            </p>
          </div>

          {/* ── Search Panel ──────────────────────────────────────────────── */}
          <div style={{
            background: 'rgba(9,24,40,0.85)',
            border: '1px solid rgba(74,133,200,0.15)',
            borderRadius: 16, padding: '1.5rem',
            marginBottom: '1.75rem',
          }}>
            <div style={{ marginBottom: 14 }}>
              <span style={{
                color: '#ffffff', fontWeight: 800, fontSize: 14,
                fontFamily: "'Nunito', sans-serif",
              }}>Search Locations</span>
              <span style={{ color: '#3d6285', fontSize: 12, marginLeft: 10 }}>
                Add multiple cities for the same search run
              </span>
            </div>

            {/* Location rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              {locations.map((loc, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    className="vs-input"
                    placeholder="City"
                    value={loc.city}
                    style={{ flex: '1 1 180px', minWidth: 140 }}
                    onChange={e => updateLocation(i, 'city', e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                  />
                  <select
                    className="vs-select"
                    value={loc.state}
                    style={{ width: 90 }}
                    onChange={e => updateLocation(i, 'state', e.target.value)}
                  >
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {locations.length > 1 && (
                    <button className="vs-btn-ghost" style={{ padding: '8px 12px', color: '#f87171', borderColor: 'rgba(248,113,113,0.25)' }}
                      onClick={() => removeLocation(i)}>✕</button>
                  )}
                </div>
              ))}
            </div>

            {/* Radius + Add city + Search */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="vs-btn-ghost" onClick={addLocation}>+ Add City</button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ color: '#3d6285', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  Radius
                </label>
                <select className="vs-select" value={radius} style={{ width: 110 }}
                  onChange={e => setRadius(Number(e.target.value))}>
                  {[10, 15, 25, 35, 50].map(r => <option key={r} value={r}>{r} miles</option>)}
                </select>
              </div>

              <button className="vs-btn-primary" onClick={handleSearch}
                disabled={searching} style={{ marginLeft: 'auto' }}>
                {searching ? 'Searching…' : '🔍  Search Venues'}
              </button>
            </div>

            {searchError && (
              <div style={{
                marginTop: 12, padding: '10px 14px',
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.25)',
                borderRadius: 8, color: '#f87171', fontSize: 13, fontWeight: 600,
              }}>{searchError}</div>
            )}
          </div>

          {/* ── Results ───────────────────────────────────────────────────── */}
          {results.length === 0 && !searching ? (
            <div style={{
              textAlign: 'center', padding: '5rem 2rem',
              border: '1px dashed rgba(74,133,200,0.15)', borderRadius: 16,
            }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
              <div style={{ color: '#ffffff', fontWeight: 800, fontSize: 16, marginBottom: 8 }}>
                No searches yet this session
              </div>
              <p style={{ color: '#3d6285', fontSize: 14, margin: 0 }}>
                Enter a city above and hit Search Venues to discover live music spots.
              </p>
            </div>
          ) : (
            <>
              {/* Filter pills + clear */}
              <div style={{
                display: 'flex', gap: 8, alignItems: 'center',
                flexWrap: 'wrap', marginBottom: '1.25rem',
              }}>
                {searchKeys.map(key => (
                  <button key={key}
                    className={`vs-filter-pill${filterKey === key ? ' active' : ''}`}
                    onClick={() => setFilterKey(key)}>
                    {key === 'ALL' ? `All Results (${results.length})` : key}
                  </button>
                ))}
                <button className="vs-btn-ghost"
                  style={{ marginLeft: 'auto', color: '#f87171', borderColor: 'rgba(248,113,113,0.25)', fontSize: 12 }}
                  onClick={() => { setResults([]); setFilterKey('ALL'); }}>
                  Clear Session
                </button>
              </div>

              {/* Venue grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {visible.map((venue, i) => (
                  <div key={venue._savedId || i} className="vs-venue-card">

                    {/* Left: info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ color: '#ffffff', fontWeight: 800, fontSize: 15 }}>{venue.name}</span>
                        {venue.venue_type && (
                          <span className="vs-tag" style={{
                            background: 'rgba(74,133,200,0.1)',
                            border: '1px solid rgba(74,133,200,0.2)',
                            color: '#6baed6',
                          }}>{venue.venue_type}</span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
                        <span style={{ color: '#7aa5c4' }}>
                          📍 {venue.city}, {venue.state}
                          {venue.address && ` — ${venue.address}`}
                        </span>
                        {venue.phone && <span style={{ color: '#7aa5c4' }}>📞 {venue.phone}</span>}
                        {venue.email && <span style={{ color: '#22c55e' }}>✉️ {venue.email}</span>}
                        {venue.website && (
                          <a href={venue.website} target="_blank" rel="noopener noreferrer"
                            style={{ color: '#4a85c8', fontSize: 13 }}
                            onClick={e => e.stopPropagation()}>
                            Website ↗
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Right: Add to Run */}
                    {campaigns.length > 0 && venue._savedId && (
                      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select
                          className="vs-campaign-select"
                          defaultValue=""
                          onChange={e => {
                            if (e.target.value) addToCampaign(venue, e.target.value);
                            e.target.value = '';
                          }}
                        >
                          <option value="" disabled>Add to Run…</option>
                          {campaigns.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        {addingTo?.venueId === venue._savedId && (
                          <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 700 }}>✓</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

        </div>
      </div>
    </>
  );
}
