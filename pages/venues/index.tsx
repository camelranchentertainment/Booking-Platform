import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { Venue } from '../../lib/types';
import { useLookup } from '../../lib/hooks/useLookup';

declare global {
  interface Window { google: any; initGooglePlaces: () => void; }
}

type VenueForm = {
  name: string; city: string; state: string; address: string;
  phone: string; email: string; website: string; venue_type: string;
  capacity: string; place_id: string; google_maps_url: string;
};

const BLANK: VenueForm = {
  name: '', city: '', state: '', address: '', phone: '',
  email: '', website: '', venue_type: '', capacity: '',
  place_id: '', google_maps_url: '',
};

type ProspectResult = {
  place_id: string; name: string; address: string; city: string; state: string;
  formatted_address: string; rating: number | null; user_ratings_total: number;
  types: string[]; google_maps_url: string; already_added: boolean;
};

export default function VenuesPage() {
  const router = useRouter();
  const { values: venueTypes } = useLookup('venue_type');
  const [venues, setVenues]         = useState<Venue[]>([]);
  const [search, setSearch]         = useState('');
  const [filterState, setFilterState] = useState('');
  const [showNew, setShowNew]       = useState(false);
  const [form, setForm]             = useState<VenueForm>(BLANK);
  const [saving, setSaving]         = useState(false);
  const [mapsReady, setMapsReady]   = useState(false);
  const autocompleteRef             = useRef<any>(null);
  const inputRef                    = useRef<HTMLInputElement>(null);

  // Prospecting state
  const [prospectCity, setProspectCity]   = useState('');
  const [prospectState, setProspectState] = useState('');
  const [prospecting, setProspecting]     = useState(false);
  const [prospects, setProspects]         = useState<ProspectResult[]>([]);
  const [prospectErr, setProspectErr]     = useState('');
  const [addingId, setAddingId]           = useState<string | null>(null);

  useEffect(() => { loadVenues(); loadGoogleMaps(); }, []);

  const loadGoogleMaps = () => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) return;
    if (window.google?.maps?.places) { setMapsReady(true); return; }
    window.initGooglePlaces = () => setMapsReady(true);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=initGooglePlaces`;
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  };

  // Bind autocomplete once modal opens and Maps is ready
  useEffect(() => {
    if (!showNew || !mapsReady || !inputRef.current) return;
    autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['establishment'],
      fields: ['name','formatted_address','address_components','geometry',
               'formatted_phone_number','website','place_id','url'],
    });
    autocompleteRef.current.addListener('place_changed', () => {
      const p = autocompleteRef.current.getPlace();
      if (!p || !p.name) return;
      const get = (type: string, short = false) => {
        const c = p.address_components?.find((x: any) => x.types.includes(type));
        return c ? (short ? c.short_name : c.long_name) : '';
      };
      setForm(f => ({
        ...f,
        name:            p.name || f.name,
        address:         p.formatted_address || f.address,
        city:            get('locality') || get('sublocality') || f.city,
        state:           get('administrative_area_level_1', true) || f.state,
        phone:           p.formatted_phone_number || f.phone,
        website:         p.website || f.website,
        place_id:        p.place_id || '',
        google_maps_url: p.url || '',
      }));
    });
  }, [showNew, mapsReady]);

  const loadVenues = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('venues').select('*').order('name');
    setVenues(data || []);
  };

  const saveVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('venues').insert({
      agent_id:       user!.id,
      name:           form.name,
      city:           form.city,
      state:          form.state,
      address:        form.address        || null,
      phone:          form.phone          || null,
      email:          form.email          || null,
      website:        form.website        || null,
      venue_type:     form.venue_type     || null,
      capacity:       form.capacity ? Number(form.capacity) : null,
      place_id:       form.place_id       || null,
      google_maps_url: form.google_maps_url || null,
    });
    setForm(BLANK);
    setShowNew(false);
    await loadVenues();
    setSaving(false);
  };

  const set = (k: keyof VenueForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const searchProspects = async () => {
    if (!prospectCity.trim() || !prospectState.trim()) return;
    setProspecting(true);
    setProspectErr('');
    setProspects([]);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`/api/venues/prospect?city=${encodeURIComponent(prospectCity.trim())}&state=${encodeURIComponent(prospectState.trim())}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { setProspectErr(json.error || 'Search failed'); }
    else { setProspects(json); }
    setProspecting(false);
  };

  const addProspect = async (p: ProspectResult) => {
    setAddingId(p.place_id);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('venues').insert({
      agent_id: user!.id,
      name: p.name,
      city: p.city,
      state: p.state,
      address: p.address || null,
      place_id: p.place_id,
      google_maps_url: p.google_maps_url,
    });
    setProspects(prev => prev.map(r => r.place_id === p.place_id ? { ...r, already_added: true } : r));
    await loadVenues();
    setAddingId(null);
  };

  const states = [...new Set(venues.map(v => v.state).filter(Boolean))].sort();
  const filtered = venues.filter(v => {
    const q = search.toLowerCase();
    const nameMatch = !q || v.name.toLowerCase().includes(q) || v.city?.toLowerCase().includes(q);
    const stateMatch = !filterState || v.state === filterState;
    return nameMatch && stateMatch;
  });

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">Venues</h1>
          <div className="page-sub">{venues.length} in database</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Add Venue</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search name or city..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="select" style={{ width: 160 }} value={filterState} onChange={e => setFilterState(e.target.value)}>
          <option value="">All States</option>
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Venue</th><th>Location</th><th>Type</th>
                <th>Capacity</th><th>Email</th><th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/venues/${v.id}`)}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{v.name}</td>
                  <td>{v.city}, {v.state}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{v.venue_type || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{v.capacity ? v.capacity.toLocaleString() : '—'}</td>
                  <td style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>{v.email || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{v.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
              {venues.length === 0 ? 'No venues yet — add your first.' : 'No matches.'}
            </div>
          )}
        </div>
      </div>

      {/* Discover Venues Section */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <span className="card-title">DISCOVER VENUES</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            Search Google for live music venues in any city
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
            <label className="field-label">City</label>
            <input
              className="input"
              placeholder="Austin"
              value={prospectCity}
              onChange={e => setProspectCity(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchProspects()}
            />
          </div>
          <div className="field" style={{ width: 100, marginBottom: 0 }}>
            <label className="field-label">State</label>
            <input
              className="input"
              placeholder="TX"
              maxLength={2}
              value={prospectState}
              onChange={e => setProspectState(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && searchProspects()}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={searchProspects}
            disabled={prospecting || !prospectCity.trim() || !prospectState.trim()}
            style={{ flexShrink: 0 }}
          >
            {prospecting ? 'Searching…' : 'Search Google'}
          </button>
          {prospects.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setProspects([]); setProspectCity(''); setProspectState(''); }}>
              Clear
            </button>
          )}
        </div>

        {prospectErr && (
          <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)', color: '#f87171', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', marginBottom: '1rem' }}>
            {prospectErr}
          </div>
        )}

        {prospects.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
              {prospects.length} results — {prospects.filter(p => p.already_added).length} already in your database
            </div>
            {prospects.map(p => (
              <div
                key={p.place_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem', borderRadius: 'var(--radius-sm)',
                  background: p.already_added ? 'rgba(52,211,153,0.06)' : 'var(--bg-overlay)',
                  border: `1px solid ${p.already_added ? 'rgba(52,211,153,0.2)' : 'var(--border)'}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {p.name}
                    {p.already_added && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: '#34d399', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        ✓ In Database
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.formatted_address}
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                    {p.rating && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#fbbf24' }}>
                        ★ {p.rating} ({p.user_ratings_total.toLocaleString()})
                      </span>
                    )}
                    {p.types.slice(0, 3).map(t => (
                      <span key={t} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                        {t.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <a
                    href={p.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}
                  >
                    Maps ↗
                  </a>
                  {!p.already_added && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => addProspect(p)}
                      disabled={addingId === p.place_id}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}
                    >
                      {addingId === p.place_id ? 'Adding…' : '+ Add'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!prospecting && prospects.length === 0 && !prospectErr && (
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
            Enter a city and state to find live music venues, bars, and clubs via Google Places.
            Results you add go straight into your database.
          </div>
        )}
      </div>

      {/* Add Venue Modal */}
      {showNew && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <h3 className="modal-title">Add Venue</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowNew(false); setForm(BLANK); }}>✕</button>
            </div>

            {/* Google Places search bar */}
            <div className="field" style={{ marginBottom: '1rem' }}>
              <label className="field-label">
                {mapsReady ? '🔍 Search Google Maps (auto-fill)' : 'Search (add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable)'}
              </label>
              <input
                ref={inputRef}
                className="input"
                placeholder={mapsReady ? 'Type venue name or address…' : 'Google Maps not configured'}
                disabled={!mapsReady}
                style={{ borderColor: mapsReady ? 'rgba(0,229,255,0.4)' : undefined }}
                autoFocus={mapsReady}
              />
              {mapsReady && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Select a result to auto-fill the fields below
                </div>
              )}
            </div>

            <div style={{ height: '1px', background: 'var(--border)', margin: '0.5rem 0 1rem' }} />

            <form onSubmit={saveVenue} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="field">
                <label className="field-label">Venue Name *</label>
                <input className="input" value={form.name} onChange={set('name')} required autoFocus={!mapsReady} />
              </div>
              <div className="field">
                <label className="field-label">Address</label>
                <input className="input" value={form.address} onChange={set('address')} />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label className="field-label">City *</label>
                  <input className="input" value={form.city} onChange={set('city')} required />
                </div>
                <div className="field">
                  <label className="field-label">State *</label>
                  <input className="input" value={form.state} onChange={set('state')} placeholder="TX" required maxLength={2} />
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label className="field-label">Email</label>
                  <input className="input" type="email" value={form.email} onChange={set('email')} />
                </div>
                <div className="field">
                  <label className="field-label">Phone</label>
                  <input className="input" type="tel" value={form.phone} onChange={set('phone')} />
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label className="field-label">Venue Type</label>
                  <select className="select" value={form.venue_type} onChange={set('venue_type')}>
                    <option value="">—</option>
                    {venueTypes.length > 0
                      ? venueTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)
                      : ['bar','club','concert_hall','festival','restaurant','winery','outdoor','theater','other'].map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)
                    }
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Capacity</label>
                  <input className="input" type="number" value={form.capacity} onChange={set('capacity')} />
                </div>
              </div>
              <div className="field">
                <label className="field-label">Website</label>
                <input className="input" value={form.website} onChange={set('website')} placeholder="https://..." />
              </div>
              {form.google_maps_url && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--accent)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  ✓ Google Maps linked
                  <a href={form.google_maps_url} target="_blank" style={{ color: 'var(--text-muted)' }}>view →</a>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowNew(false); setForm(BLANK); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Add Venue'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
