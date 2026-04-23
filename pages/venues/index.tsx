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

  // Bulk import
  const [showImport, setShowImport]     = useState(false);
  const [importText, setImportText]     = useState('');
  const [importRows, setImportRows]     = useState<any[]>([]);
  const [importParsed, setImportParsed] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importDone, setImportDone]     = useState<{added:number;skipped:number} | null>(null);
  const [importError, setImportError]   = useState('');
  const autocompleteRef             = useRef<any>(null);
  const inputRef                    = useRef<HTMLInputElement>(null);

  // Prospecting state
  const [prospectCity, setProspectCity]   = useState('');
  const [prospectState, setProspectState] = useState('');
  const [prospecting, setProspecting]     = useState(false);
  const [prospects, setProspects]         = useState<ProspectResult[]>([]);
  const [prospectErr, setProspectErr]     = useState('');
  const [prospectStatus, setProspectStatus] = useState<Record<string, string>>({});
  const [prospectEmails, setProspectEmails] = useState<Record<string, string>>({});

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

  const parseImport = () => {
    setImportError('');
    setImportDone(null);
    const lines = importText.trim().split('\n').filter(l => l.trim());
    if (!lines.length) { setImportError('Paste your venue list first.'); return; }

    // Detect markdown table (lines contain |) or CSV
    const isTable = lines[0].includes('|');
    const rows: any[] = [];

    const clean = (s: string) => s?.trim().replace(/^["']|["']$/g, '').trim() || '';

    if (isTable) {
      // Strip header separator line (---|---)
      const dataLines = lines.filter(l => !/^\s*\|?\s*[-:]+\s*\|/.test(l));
      // First data line is headers
      const headers = dataLines[0].split('|').map(h => clean(h).toLowerCase().replace(/[^a-z0-9]/g, '_'));
      for (let i = 1; i < dataLines.length; i++) {
        const cells = dataLines[i].split('|').map(clean);
        const obj: any = {};
        headers.forEach((h, idx) => { if (h) obj[h] = cells[idx] || ''; });
        if (obj.venue_name || obj.name) rows.push(obj);
      }
    } else {
      // CSV — first line is headers
      const headers = lines[0].split(',').map(h => clean(h).toLowerCase().replace(/[^a-z0-9]/g, '_'));
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map(clean);
        const obj: any = {};
        headers.forEach((h, idx) => { if (h) obj[h] = cells[idx] || ''; });
        if (obj.venue_name || obj.name) rows.push(obj);
      }
    }

    if (!rows.length) { setImportError('Could not parse any venue rows. Make sure the first line is a header row.'); return; }

    // Normalize field names to internal keys
    const norm = rows.map(r => ({
      name:         clean(r.venue_name || r.name || ''),
      address:      clean(r.address || ''),
      city:         clean(r.city || ''),
      state:        clean(r.state || ''),
      phone:        clean(r.phone || r.phone_number || ''),
      email:        clean(r.booking_email || r.general___info_email || r.general_email || r.email || ''),
      website:      clean(r.website || ''),
      venue_type:   clean(r.type || r.venue_type || '').toLowerCase(),
      capacity:     clean(r.capacity || ''),
      contact_first: clean((r.contact_name || r.booking_contact_name || '').split(' ')[0] || ''),
      contact_last:  clean((r.contact_name || r.booking_contact_name || '').split(' ').slice(1).join(' ') || ''),
      contact_title: clean(r.contact_title || r.booking_contact_title || ''),
      contact_email: clean(r.booking_email || r.contact_email || ''),
      notes:         clean(r.notes || ''),
      _selected:     true,
    })).filter(r => r.name && r.city);

    if (!norm.length) { setImportError('Rows found but none had a Venue Name and City — check your column headers.'); return; }
    setImportRows(norm);
    setImportParsed(true);
  };

  const runImport = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setImportSaving(true);
    let added = 0; let skipped = 0;

    for (const row of importRows.filter(r => r._selected)) {
      // Check for existing venue (same name + city)
      const { data: existing } = await supabase
        .from('venues').select('id').eq('agent_id', user.id)
        .ilike('name', row.name).ilike('city', row.city).maybeSingle();

      if (existing) {
        // Update with new info
        await supabase.from('venues').update({
          address:    row.address    || null,
          phone:      row.phone      || null,
          email:      row.email      || null,
          website:    row.website    || null,
          venue_type: row.venue_type || null,
          capacity:   row.capacity   ? Number(row.capacity) : null,
          notes:      row.notes      || null,
        }).eq('id', existing.id);
        skipped++;
      } else {
        const { data: newV } = await supabase.from('venues').insert({
          agent_id:   user.id,
          name:       row.name,
          city:       row.city,
          state:      row.state      || null,
          address:    row.address    || null,
          phone:      row.phone      || null,
          email:      row.email      || null,
          website:    row.website    || null,
          venue_type: row.venue_type || null,
          capacity:   row.capacity   ? Number(row.capacity) : null,
          notes:      row.notes      || null,
          source:     'import',
          country:    'US',
        }).select('id').single();

        // Create contact if name provided
        if (newV?.id && (row.contact_first || row.contact_email)) {
          await supabase.from('contacts').insert({
            agent_id:   user.id,
            venue_id:   newV.id,
            first_name: row.contact_first || '',
            last_name:  row.contact_last  || '',
            title:      row.contact_title || null,
            email:      row.contact_email || null,
            status:     'not_contacted',
          });
        }
        added++;
      }
    }

    await loadVenues();
    setImportDone({ added, skipped });
    setImportSaving(false);
  };

  const set = (k: keyof VenueForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const openAddToTour = async (venue: Venue) => {
    setTourTarget(venue);
    setAddTourDone(null);
    if (!toursLoaded) {
      const { data: { user } } = await supabase.auth.getUser();
      // Fetch tours created by user + tours for acts they manage
      const [createdRes, managedActsRes] = await Promise.all([
        supabase.from('tours').select('id, name, act:acts(act_name), status').eq('created_by', user!.id).neq('status', 'cancelled').order('created_at', { ascending: false }),
        supabase.from('acts').select('id').or(`agent_id.eq.${user!.id},owner_id.eq.${user!.id}`),
      ]);
      const actIds = (managedActsRes.data || []).map((a: any) => a.id);
      const actToursRes = actIds.length > 0
        ? await supabase.from('tours').select('id, name, act:acts(act_name), status').in('act_id', actIds).neq('status', 'cancelled').order('created_at', { ascending: false })
        : { data: [] as any[] };
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const t of [...(createdRes.data || []), ...(actToursRes.data || [])]) {
        if (!seen.has(t.id)) { seen.add(t.id); merged.push(t); }
      }
      setTours(merged);
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
    const setStatus = (s: string) =>
      setProspectStatus(prev => ({ ...prev, [p.place_id]: s }));

    setStatus('fetching');
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    // Step 1: Fetch Place Details for website + phone
    let website: string | null = null;
    let phone: string | null = null;
    try {
      const dr = await fetch(`/api/venues/place-details?place_id=${encodeURIComponent(p.place_id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (dr.ok) { const d = await dr.json(); website = d.website; phone = d.phone; }
    } catch { /* continue without */ }

    setStatus('saving');

    // Step 2: Insert venue with full details
    const { data: { user } } = await supabase.auth.getUser();
    const { data: newVenue } = await supabase.from('venues').insert({
      agent_id:        user!.id,
      name:            p.name,
      city:            p.city,
      state:           p.state,
      address:         p.address         || null,
      place_id:        p.place_id,
      google_maps_url: p.google_maps_url,
      website:         website           || null,
      phone:           phone             || null,
    }).select().single();

    setProspects(prev => prev.map(r => r.place_id === p.place_id ? { ...r, already_added: true } : r));
    await loadVenues();

    // Step 3: Auto-scrape website for booking email + contacts
    if (website && newVenue?.id) {
      setStatus('scraping');
      try {
        const sr = await fetch('/api/venues/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url: website, venueId: newVenue.id }),
        });
        if (sr.ok) {
          const { extracted } = await sr.json();
          const email = extracted?.booking_email || extracted?.general_email || null;
          if (email) setProspectEmails(prev => ({ ...prev, [p.place_id]: email }));
          await loadVenues();
        }
      } catch { /* scrape failed — not critical */ }
    }

    setStatus('done');
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
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="btn btn-secondary" onClick={() => { setShowImport(true); setImportParsed(false); setImportText(''); setImportRows([]); setImportDone(null); setImportError(''); }}>⬆ Bulk Import</button>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Add Venue</button>
        </div>
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
            {prospects.map(p => {
              const status = prospectStatus[p.place_id];
              const email  = prospectEmails[p.place_id];
              const busy   = !!(status && status !== 'done');
              const statusLabel: Record<string, string> = {
                fetching: 'Fetching details…',
                saving:   'Saving…',
                scraping: 'Scanning for email…',
                done:     '✓ Done',
              };
              return (
                <div key={p.place_id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)',
                  background: p.already_added ? 'rgba(52,211,153,0.06)' : 'var(--bg-overlay)',
                  border: `1px solid ${p.already_added ? 'rgba(52,211,153,0.2)' : 'var(--border)'}`,
                  cursor: p.already_added ? 'default' : 'pointer',
                }}
                  onClick={() => { if (p.already_added) { const v = venues.find(v => v.place_id === p.place_id); if (v) router.push(`/venues/${v.id}`); } }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {p.name}
                      {p.already_added && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#34d399', letterSpacing: '0.1em', textTransform: 'uppercase' }}>✓ In DB</span>}
                      {p.rating && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: '#fbbf24' }}>★ {p.rating}</span>}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.formatted_address}
                    </div>
                    {email && (
                      <div style={{ color: 'var(--accent)', fontSize: '0.78rem', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                        ✉ {email}
                      </div>
                    )}
                    {busy && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                        {statusLabel[status]}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <a href={p.google_maps_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>Maps ↗</a>
                    {!p.already_added && (
                      <button className="btn btn-primary btn-sm" onClick={() => addProspect(p)} disabled={busy} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', minWidth: 52 }}>
                        {busy ? '…' : '+ Add'}
                      </button>
                    )}
                    {p.already_added && (
                      <button className="btn btn-ghost btn-sm" onClick={() => { const v = venues.find(v => v.place_id === p.place_id); if (v) router.push(`/venues/${v.id}`); }} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>
                        View →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
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
      {/* Bulk Import Modal */}
      {showImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
          onClick={() => !importSaving && setShowImport(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title">BULK IMPORT VENUES</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowImport(false)}>✕</button>
            </div>

            {!importParsed ? (
              <>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Paste your venue list below. Accepted formats:
                  <ul style={{ marginTop: '0.4rem', paddingLeft: '1.2rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    <li>Markdown table from the AI research prompt (recommended)</li>
                    <li>CSV with a header row</li>
                  </ul>
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Required columns: <code style={{ background: 'var(--bg-overlay)', padding: '0 4px', borderRadius: 2 }}>Venue Name</code> and <code style={{ background: 'var(--bg-overlay)', padding: '0 4px', borderRadius: 2 }}>City</code>.
                    If a venue already exists it will be updated, not duplicated.
                  </div>
                </div>
                <textarea
                  className="textarea"
                  rows={12}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', resize: 'vertical' }}
                  placeholder="Paste markdown table or CSV here..."
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                />
                {importError && <div style={{ color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.83rem' }}>{importError}</div>}
                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => setShowImport(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={parseImport} disabled={!importText.trim()}>Parse →</button>
                </div>
              </>
            ) : importDone ? (
              <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--accent)', marginBottom: '0.5rem' }}>Done</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                  {importDone.added} venue{importDone.added !== 1 ? 's' : ''} added &nbsp;·&nbsp; {importDone.skipped} updated (already existed)
                </div>
                <button className="btn btn-primary" style={{ marginTop: '1.25rem' }} onClick={() => setShowImport(false)}>Close</button>
              </div>
            ) : (
              <>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  {importRows.length} venue{importRows.length !== 1 ? 's' : ''} ready to import. Uncheck any you want to skip.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 340, overflowY: 'auto' }}>
                  {importRows.map((row, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={row._selected} onChange={e => setImportRows(rows => rows.map((r, idx) => idx === i ? { ...r, _selected: e.target.checked } : r))} style={{ marginTop: 3, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{row.name}</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                          {[row.city, row.state].filter(Boolean).join(', ')}
                          {row.phone && ` · ${row.phone}`}
                          {row.email && ` · ${row.email}`}
                          {row.capacity && ` · cap ${row.capacity}`}
                        </div>
                        {row.contact_first && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--accent)', marginTop: '0.1rem' }}>Contact: {row.contact_first} {row.contact_last} {row.contact_title ? `(${row.contact_title})` : ''}</div>}
                      </div>
                    </label>
                  ))}
                </div>
                {importError && <div style={{ color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.83rem' }}>{importError}</div>}
                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setImportParsed(false)}>← Back</button>
                  <div style={{ display: 'flex', gap: '0.6rem' }}>
                    <button className="btn btn-secondary" onClick={() => setShowImport(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={runImport} disabled={importSaving || !importRows.some(r => r._selected)}>
                      {importSaving ? 'Importing…' : `Import ${importRows.filter(r => r._selected).length} Venues`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </AppShell>
  );
}
