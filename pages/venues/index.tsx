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

  // Add to tour state
  const [tourTarget, setTourTarget]   = useState<Venue | null>(null);
  const [tours, setTours]             = useState<any[]>([]);
  const [toursLoaded, setToursLoaded] = useState(false);
  const [addingTour, setAddingTour]   = useState<string | null>(null);
  const [addTourDone, setAddTourDone] = useState<string | null>(null);

  useEffect(() => { loadVenues(); loadGoogleMaps(); }, []);

  const loadGoogleMaps = async () => {
    if (window.google?.maps?.places) { setMapsReady(true); return; }
    try {
      const res = await fetch('/api/admin/public-config');
      if (!res.ok) return;
      const { googleMapsApiKey } = await res.json();
      if (!googleMapsApiKey) return;
      window.initGooglePlaces = () => setMapsReady(true);
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${googleMapsApiKey}&libraries=places&callback=initGooglePlaces`;
      s.async = true; s.defer = true;
      document.head.appendChild(s);
    } catch { /* Maps unavailable */ }
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

  const openAddToTour = async (venue: Venue) => {
    setTourTarget(venue);
    setAddTourDone(null);
    if (!toursLoaded) {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from('tours')
        .select('id, name, act:acts(act_name), status')
        .eq('created_by', user!.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });
      setTours(data || []);
      setToursLoaded(true);
    }
  };

  const addVenueToTour = async (tourId: string) => {
    if (!tourTarget) return;
    setAddingTour(tourId);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/tours/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.access_token}` },
      body: JSON.stringify({ tour_id: tourId, venue_id: tourTarget.id }),
    });
    if (res.ok) setAddTourDone(tourId);
    setAddingTour(null);
  };

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
    <AppShell requireRole={['agent', 'act_admin']}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Venues</h1>
          <div className="page-sub">{venues.length} in database</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Add Venue</button>
      </div>

      {/* Discover Venues — city/state Google search, compact strip at top */}
      <div className="card" style={{ marginBottom: '1.25rem', padding: '0.85rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', letterSpacing: '0.06em', color: 'var(--accent)', flexShrink: 0 }}>DISCOVER</span>
          <input
            className="input"
            style={{ flex: '1 1 160px', maxWidth: 200 }}
            placeholder="City"
            value={prospectCity}
            onChange={e => setProspectCity(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchProspects()}
          />
          <input
            className="input"
            style={{ width: 80, flexShrink: 0 }}
            placeholder="ST"
            maxLength={2}
            value={prospectState}
            onChange={e => setProspectState(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && searchProspects()}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={searchProspects}
            disabled={prospecting || !prospectCity.trim() || !prospectState.trim()}
          >
            {prospecting ? 'Searching…' : 'Search Google'}
          </button>
          {prospects.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setProspects([]); setProspectCity(''); setProspectState(''); }}>
              Clear
            </button>
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)', flexShrink: 0 }}>
            Find venues not yet in your database
          </span>
        </div>

        {prospectErr && (
          <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)', color: '#f87171', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>
            {prospectErr}
          </div>
        )}

        {prospects.length > 0 && (
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              {prospects.length} results — {prospects.filter(p => p.already_added).length} already in your database
            </div>
            {prospects.map(p => (
              <div key={p.place_id} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)',
                background: p.already_added ? 'rgba(52,211,153,0.06)' : 'var(--bg-overlay)',
                border: `1px solid ${p.already_added ? 'rgba(52,211,153,0.2)' : 'var(--border)'}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {p.name}
                    {p.already_added && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#34d399', letterSpacing: '0.1em', textTransform: 'uppercase' }}>✓ In DB</span>}
                    {p.rating && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#fbbf24' }}>★ {p.rating}</span>}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.formatted_address}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                  <a href={p.google_maps_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>Maps ↗</a>
                  {!p.already_added && (
                    <button className="btn btn-primary btn-sm" onClick={() => addProspect(p)} disabled={addingId === p.place_id} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>
                      {addingId === p.place_id ? 'Adding…' : '+ Add'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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
                <th>Capacity</th><th>Email</th><th>Phone</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }} onClick={() => router.push(`/venues/${v.id}`)}>{v.name}</td>
                  <td style={{ cursor: 'pointer' }} onClick={() => router.push(`/venues/${v.id}`)}>{v.city}, {v.state}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', cursor: 'pointer' }} onClick={() => router.push(`/venues/${v.id}`)}>{v.venue_type || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', cursor: 'pointer' }} onClick={() => router.push(`/venues/${v.id}`)}>{v.capacity ? v.capacity.toLocaleString() : '—'}</td>
                  <td style={{ color: 'var(--accent)', fontSize: '0.85rem', cursor: 'pointer' }} onClick={() => router.push(`/venues/${v.id}`)}>{v.email || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', cursor: 'pointer' }} onClick={() => router.push(`/venues/${v.id}`)}>{v.phone || '—'}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', letterSpacing: '0.06em', color: 'var(--accent)', whiteSpace: 'nowrap' }}
                      onClick={e => { e.stopPropagation(); openAddToTour(v); }}
                    >
                      + Tour
                    </button>
                  </td>
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
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
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
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--accent)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
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

      {/* Add to Tour Modal */}
      {tourTarget && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3 className="modal-title">Add to Tour</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setTourTarget(null)}>✕</button>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              {tourTarget.name} · {tourTarget.city}, {tourTarget.state}
            </div>
            {!toursLoaded ? (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>Loading tours...</div>
            ) : tours.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                No active tours found.{' '}
                <a href="/tours" style={{ color: 'var(--accent)' }}>Create a tour first →</a>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {tours.map((t: any) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.65rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{t.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                        {t.act?.act_name} · {t.status}
                      </div>
                    </div>
                    {addTourDone === t.id ? (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#34d399' }}>✓ Added</span>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={addingTour === t.id}
                        onClick={() => addVenueToTour(t.id)}
                        style={{ fontSize: '0.8rem' }}
                      >
                        {addingTour === t.id ? 'Adding…' : 'Add to Pool'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setTourTarget(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
