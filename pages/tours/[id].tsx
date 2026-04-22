import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { BOOKING_STATUS_LABELS } from '../../lib/types';
import Link from 'next/link';

type OutreachStatus = 'target' | 'pitched' | 'followup' | 'negotiating' | 'confirmed' | 'declined';
type Platform = 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'discord';

const PLATFORM_INFO: Record<Platform, { label: string; color: string; icon: string }> = {
  instagram: { label: 'Instagram', color: '#e1306c', icon: '📸' },
  facebook:  { label: 'Facebook',  color: '#1877f2', icon: '👥' },
  youtube:   { label: 'YouTube',   color: '#ff0000', icon: '▶' },
  tiktok:    { label: 'TikTok',   color: '#69c9d0', icon: '♪' },
  discord:   { label: 'Discord',   color: '#5865f2', icon: '◈' },
};

const STATUS_LABELS: Record<OutreachStatus, string> = {
  target:      'Target',
  pitched:     'Pitched',
  followup:    'Follow-up',
  negotiating: 'Negotiating',
  confirmed:   'Confirmed',
  declined:    'Declined',
};

const STATUS_COLOR: Record<OutreachStatus, string> = {
  target:      'var(--text-muted)',
  pitched:     '#60a5fa',
  followup:    '#fbbf24',
  negotiating: '#a78bfa',
  confirmed:   '#34d399',
  declined:    '#f87171',
};

const FILTER_TABS: (OutreachStatus | 'all')[] = ['all', 'target', 'pitched', 'followup', 'negotiating', 'confirmed', 'declined'];

export default function TourDetail() {
  const router = useRouter();
  const { id } = router.query;

  const [tour, setTour]         = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [pool, setPool]         = useState<any[]>([]);
  const [edit, setEdit]         = useState(false);
  const [form, setForm]         = useState<any>({});
  const [saving, setSaving]     = useState(false);

  // Venue search modal
  const [showSearch, setShowSearch]       = useState(false);
  const [searchTab, setSearchTab]         = useState<'db' | 'discover'>('db');
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching]         = useState(false);
  const [adding, setAdding]               = useState<string | null>(null);

  // Discover (Google Places) tab
  const [discoverCity, setDiscoverCity]       = useState('');
  const [discoverState, setDiscoverState]     = useState('');
  const [discovering, setDiscovering]         = useState(false);
  const [discoverResults, setDiscoverResults] = useState<any[]>([]);
  const [discoverErr, setDiscoverErr]         = useState('');
  const [discoverAdding, setDiscoverAdding]   = useState<string | null>(null);

  // Confirm show modal
  const [confirmTarget, setConfirmTarget]     = useState<any>(null);
  const [confirmForm, setConfirmForm]         = useState({ show_date: '', fee: '' });
  const [confirmPlatforms, setConfirmPlatforms] = useState<Platform[]>(['instagram', 'facebook']);
  const [confirming, setConfirming]           = useState(false);
  const [confirmError, setConfirmError]       = useState('');

  // Pool filter
  const [poolFilter, setPoolFilter] = useState<OutreachStatus | 'all'>('all');

  // Notes inline edit
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesDraft, setNotesDraft]     = useState('');

  useEffect(() => { if (id) loadAll(); }, [id]);

  const loadAll = async () => {
    const [tourRes, bookingsRes] = await Promise.all([
      supabase.from('tours').select('*, act:acts(act_name)').eq('id', id).single(),
      supabase.from('bookings').select(`
        id, status, show_date, fee,
        venue:venues(name, city, state)
      `).eq('tour_id', id).order('show_date', { ascending: true }),
    ]);
    if (tourRes.data) { setTour(tourRes.data); setForm(tourRes.data); }
    setBookings(bookingsRes.data || []);
    loadPool();
  };

  const loadPool = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/tours/venues?tour_id=${id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) setPool(await res.json());
  };

  const save = async () => {
    setSaving(true);
    await supabase.from('tours').update({
      name:          form.name,
      description:   form.description  || null,
      start_date:    form.start_date   || null,
      end_date:      form.end_date     || null,
      routing_notes: form.routing_notes || null,
      status:        form.status,
    }).eq('id', id);
    await loadAll();
    setEdit(false);
    setSaving(false);
  };

  const searchVenues = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('venues')
      .select('id, name, city, state, capacity, venue_type')
      .or(`name.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%`)
      .order('name')
      .limit(20);
    setSearchResults(data || []);
    setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchVenues(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchVenues]);

  const addVenue = async (venue_id: string) => {
    setAdding(venue_id);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/tours/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ tour_id: id, venue_id }),
    });
    if (res.ok) {
      const item = await res.json();
      setPool(p => [...p, item]);
    }
    setAdding(null);
  };

  const discoverVenues = async () => {
    if (!discoverCity.trim() || !discoverState.trim()) return;
    setDiscovering(true);
    setDiscoverErr('');
    setDiscoverResults([]);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `/api/venues/prospect?city=${encodeURIComponent(discoverCity.trim())}&state=${encodeURIComponent(discoverState.trim())}`,
      { headers: { Authorization: `Bearer ${session!.access_token}` } },
    );
    const json = await res.json();
    if (!res.ok) setDiscoverErr(json.error || 'Search failed');
    else setDiscoverResults(json);
    setDiscovering(false);
  };

  const addDiscoveredVenue = async (p: any) => {
    setDiscoverAdding(p.place_id);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: { session } } = await supabase.auth.getSession();

    let venueId: string | null = null;

    if (p.already_added) {
      // Look up existing venue by place_id, fall back to name+city match
      const { data: byPlaceId } = await supabase.from('venues').select('id').eq('place_id', p.place_id).maybeSingle();
      venueId = byPlaceId?.id ?? null;
      if (!venueId) {
        const { data: byName } = await supabase.from('venues').select('id').ilike('name', p.name).ilike('city', p.city).maybeSingle();
        venueId = byName?.id ?? null;
      }
    } else {
      const { data: inserted } = await supabase.from('venues').insert({
        agent_id: user!.id, name: p.name, city: p.city, state: p.state,
        address: p.address || null, place_id: p.place_id, google_maps_url: p.google_maps_url,
      }).select('id').single();
      venueId = inserted?.id ?? null;
    }

    if (venueId) {
      const res = await fetch('/api/tours/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session!.access_token}` },
        body: JSON.stringify({ tour_id: id, venue_id: venueId }),
      });
      if (res.ok) {
        const item = await res.json();
        setPool(prev => [...prev, item]);
        setDiscoverResults(prev => prev.map(r => r.place_id === p.place_id ? { ...r, in_pool: true } : r));
      }
    }
    setDiscoverAdding(null);
  };

  const updateStatus = async (tvId: string, status: OutreachStatus) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/tours/venues', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ id: tvId, status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPool(p => p.map(v => v.id === tvId ? updated : v));
    }
  };

  const saveNotes = async (tvId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/tours/venues', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ id: tvId, notes: notesDraft }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPool(p => p.map(v => v.id === tvId ? updated : v));
    }
    setEditingNotes(null);
  };

  const removeVenue = async (tvId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`/api/tours/venues?id=${tvId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setPool(p => p.filter(v => v.id !== tvId));
  };

  const confirmShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmTarget) return;
    setConfirming(true);
    setConfirmError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/tours/venue-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          tour_venue_id: confirmTarget.id,
          show_date:     confirmForm.show_date,
          fee:           confirmForm.fee || null,
          platforms:     confirmPlatforms,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to confirm show');
      setPool(p => p.map(v => v.id === confirmTarget.id ? { ...v, status: 'confirmed' } : v));
      setConfirmTarget(null);
      setConfirmForm({ show_date: '', fee: '' });
      setConfirmPlatforms(['instagram', 'facebook']);
      loadAll();
    } catch (err: any) {
      setConfirmError(err.message);
    } finally {
      setConfirming(false);
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f: any) => ({ ...f, [k]: e.target.value }));

  const alreadyInPool = new Set(pool.map(v => v.venue_id));
  const filteredPool = poolFilter === 'all' ? pool : pool.filter(v => v.status === poolFilter);
  const pendingCount = pool.filter(v => !['confirmed', 'declined'].includes(v.status)).length;

  if (!tour) return (
    <AppShell requireRole="agent">
      <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>Loading...</div>
    </AppShell>
  );

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
            {tour.act?.act_name}
          </div>
          <h1 className="page-title">{tour.name}</h1>
          {(tour.start_date || tour.end_date) && (
            <div className="page-sub">
              {tour.start_date ? new Date(tour.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '?'}
              {' — '}
              {tour.end_date ? new Date(tour.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={() => setEdit(!edit)}>Edit</button>
          <Link href={`/bookings/new?tour=${tour.id}&act=${tour.act_id}`} className="btn btn-primary">+ Add Show</Link>
        </div>
      </div>

      <div className="grid-2">
        {/* Tour Info */}
        <div className="card">
          {edit ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="field"><label className="field-label">Tour Name</label><input className="input" value={form.name || ''} onChange={set('name')} /></div>
              <div className="grid-2">
                <div className="field"><label className="field-label">Start Date</label><input className="input" type="date" value={form.start_date?.substring(0, 10) || ''} onChange={set('start_date')} /></div>
                <div className="field"><label className="field-label">End Date</label><input className="input" type="date" value={form.end_date?.substring(0, 10) || ''} onChange={set('end_date')} /></div>
              </div>
              <div className="field">
                <label className="field-label">Status</label>
                <select className="select" value={form.status || 'planning'} onChange={set('status')}>
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="field"><label className="field-label">Description</label><textarea className="textarea" value={form.description || ''} onChange={set('description')} /></div>
              <div className="field"><label className="field-label">Routing Notes</label><textarea className="textarea" value={form.routing_notes || ''} onChange={set('routing_notes')} placeholder="Drive times, lodging, routing logic..." /></div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => setEdit(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>Save</button>
              </div>
            </div>
          ) : (
            <>
              <div className="card-header"><span className="card-title">TOUR INFO</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.88rem' }}>
                {tour.description && <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.5rem' }}>{tour.description}</p>}
                {tour.routing_notes && (
                  <div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>Routing Notes</div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{tour.routing_notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Confirmed Shows */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">CONFIRMED SHOWS ({bookings.length})</span>
          </div>
          {bookings.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
              No shows yet. Use the outreach pool below to target venues, then confirm a show.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {bookings.map((b: any) => (
                <Link key={b.id} href={`/bookings/${b.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.6rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', textDecoration: 'none' }}>
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500 }}>{b.venue?.name || 'TBD'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>
                      {b.show_date ? new Date(b.show_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      {b.venue?.city ? ` · ${b.venue.city}, ${b.venue.state}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                    <span className={`badge badge-${b.status}`}>{BOOKING_STATUS_LABELS[b.status as keyof typeof BOOKING_STATUS_LABELS]}</span>
                    {b.fee && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--accent)' }}>${Number(b.fee).toLocaleString()}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Outreach Pool */}
      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-header">
          <span className="card-title">OUTREACH POOL ({pool.length}){pendingCount > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {pendingCount} active</span>}</span>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowSearch(true); setSearchTab('db'); setSearchQuery(''); setSearchResults([]); setDiscoverResults([]); setDiscoverErr(''); }}>
            + Add Venue
          </button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {FILTER_TABS.map(tab => {
            const count = tab === 'all' ? pool.length : pool.filter(v => v.status === tab).length;
            return (
              <button
                key={tab}
                onClick={() => setPoolFilter(tab)}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: '0.78rem', letterSpacing: '0.08em',
                  textTransform: 'uppercase', padding: '0.3rem 0.65rem',
                  border: `1px solid ${poolFilter === tab ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  background: poolFilter === tab ? 'rgba(196,154,60,0.12)' : 'transparent',
                  color: poolFilter === tab ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                {tab === 'all' ? 'All' : STATUS_LABELS[tab as OutreachStatus]} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>

        {filteredPool.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem', padding: '1rem 0' }}>
            {pool.length === 0
              ? 'No venues in the outreach pool yet. Click "+ Add Venue" to start targeting venues for this tour.'
              : 'No venues matching this filter.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {filteredPool.map((tv: any) => (
              <div key={tv.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto',
                gap: '0.75rem',
                alignItems: 'start',
                padding: '0.65rem 0.75rem',
                background: 'var(--bg-overlay)',
                borderRadius: 'var(--radius-sm)',
                borderLeft: `3px solid ${STATUS_COLOR[tv.status as OutreachStatus] || 'var(--border)'}`,
              }}>
                {/* Venue info */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Link href={`/venues/${tv.venue_id}`} style={{ color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none' }}>
                      {tv.venue?.name}
                    </Link>
                    {tv.venue?.capacity && (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '0.1rem 0.35rem', borderRadius: '2px' }}>
                        cap {tv.venue.capacity.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    {tv.venue?.city}, {tv.venue?.state}
                    {tv.venue?.email && <span> · {tv.venue.email}</span>}
                  </div>
                  {/* Notes */}
                  {editingNotes === tv.id ? (
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                      <input
                        className="input"
                        style={{ fontSize: '0.78rem', padding: '0.3rem 0.5rem', flex: 1 }}
                        value={notesDraft}
                        onChange={e => setNotesDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveNotes(tv.id); if (e.key === 'Escape') setEditingNotes(null); }}
                        autoFocus
                        placeholder="Add notes..."
                      />
                      <button className="btn btn-primary btn-sm" onClick={() => saveNotes(tv.id)}>Save</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingNotes(null)}>✕</button>
                    </div>
                  ) : (
                    <div
                      onClick={() => { setEditingNotes(tv.id); setNotesDraft(tv.notes || ''); }}
                      style={{ marginTop: '0.3rem', fontSize: '0.78rem', color: tv.notes ? 'var(--text-secondary)' : 'var(--text-muted)', cursor: 'pointer', fontStyle: tv.notes ? 'normal' : 'italic' }}
                    >
                      {tv.notes || 'Add notes...'}
                    </div>
                  )}
                </div>

                {/* Status selector */}
                <select
                  className="select"
                  style={{ fontSize: '0.84rem', padding: '0.3rem 0.5rem', color: STATUS_COLOR[tv.status as OutreachStatus] }}
                  value={tv.status}
                  onChange={e => updateStatus(tv.id, e.target.value as OutreachStatus)}
                >
                  {(Object.keys(STATUS_LABELS) as OutreachStatus[]).map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>

                {/* Confirm button — shown when negotiating or any active stage */}
                {tv.status !== 'confirmed' && tv.status !== 'declined' && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setConfirmTarget(tv);
                      setConfirmForm({ show_date: '', fee: '' });
                      setConfirmPlatforms(['instagram', 'facebook']);
                      setConfirmError('');
                    }}
                  >
                    Confirm Show
                  </button>
                )}

                {/* Remove */}
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}
                  onClick={() => removeVenue(tv.id)}
                  title="Remove from pool"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Venue Modal */}
      {showSearch && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className="card-header" style={{ marginBottom: '0.75rem' }}>
              <span className="card-title">ADD VENUE TO POOL</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSearch(false)}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.85rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
              {(['db', 'discover'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setSearchTab(tab)}
                  style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.8rem', letterSpacing: '0.08em',
                    textTransform: 'uppercase', padding: '0.35rem 0.8rem',
                    border: `1px solid ${searchTab === tab ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    background: searchTab === tab ? 'var(--accent-glow)' : 'transparent',
                    color: searchTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {tab === 'db' ? 'My Database' : 'Discover (Google)'}
                </button>
              ))}
            </div>

            {/* DB tab */}
            {searchTab === 'db' && (
              <>
                <input
                  className="input"
                  placeholder="Search by name, city, or state..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                  style={{ marginBottom: '0.75rem' }}
                />
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {searching && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.5rem' }}>Searching...</div>}
                  {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.5rem' }}>
                      No venues found in your database.{' '}
                      <button
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.82rem', padding: 0 }}
                        onClick={() => setSearchTab('discover')}
                      >
                        Try Discover tab →
                      </button>
                    </div>
                  )}
                  {searchQuery.length < 2 && (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.5rem' }}>
                      Type at least 2 characters to search your venue database.
                    </div>
                  )}
                  {searchResults.map(v => {
                    const inPool = alreadyInPool.has(v.id);
                    return (
                      <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.55rem 0.6rem', borderRadius: 'var(--radius-sm)', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>{v.name}</div>
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {v.city}, {v.state}{v.capacity ? ` · cap ${v.capacity.toLocaleString()}` : ''}{v.venue_type ? ` · ${v.venue_type}` : ''}
                          </div>
                        </div>
                        {inPool ? (
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#34d399' }}>✓ In Pool</span>
                        ) : (
                          <button className="btn btn-secondary btn-sm" disabled={adding === v.id} onClick={() => addVenue(v.id)}>
                            {adding === v.id ? 'Adding...' : 'Add'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Discover tab */}
            {searchTab === 'discover' && (
              <>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
                  <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="field-label">City</label>
                    <input
                      className="input"
                      placeholder="Austin"
                      value={discoverCity}
                      onChange={e => setDiscoverCity(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && discoverVenues()}
                      autoFocus
                    />
                  </div>
                  <div className="field" style={{ width: 80, marginBottom: 0 }}>
                    <label className="field-label">State</label>
                    <input
                      className="input"
                      placeholder="TX"
                      maxLength={2}
                      value={discoverState}
                      onChange={e => setDiscoverState(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && discoverVenues()}
                    />
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={discoverVenues}
                    disabled={discovering || !discoverCity.trim() || !discoverState.trim()}
                    style={{ flexShrink: 0 }}
                  >
                    {discovering ? 'Searching…' : 'Search'}
                  </button>
                </div>

                {discoverErr && (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: '#f87171', marginBottom: '0.5rem', padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)' }}>
                    {discoverErr}
                  </div>
                )}

                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {!discovering && discoverResults.length === 0 && !discoverErr && (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.5rem' }}>
                      Enter a city and state to search Google for live music venues, bars, and clubs.
                      Selecting one saves it to your database and adds it to this tour's outreach pool.
                    </div>
                  )}
                  {discoverResults.length > 0 && (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                      {discoverResults.length} results from Google
                    </div>
                  )}
                  {discoverResults.map(p => {
                    const inPool = p.in_pool || [...pool].some(tv => tv.venue?.name?.toLowerCase() === p.name.toLowerCase());
                    return (
                      <div key={p.place_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.55rem 0.6rem', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {p.name}
                            {p.already_added && !inPool && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>in DB</span>}
                          </div>
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.formatted_address}
                            {p.rating ? ` · ★ ${p.rating}` : ''}
                          </div>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          {inPool ? (
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#34d399' }}>✓ In Pool</span>
                          ) : (
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={discoverAdding === p.place_id}
                              onClick={() => addDiscoveredVenue(p)}
                              style={{ fontSize: '0.8rem' }}
                            >
                              {discoverAdding === p.place_id ? 'Adding…' : '+ Add to Pool'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirm Show Modal */}
      {confirmTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <form onSubmit={confirmShow}>
            <div className="card" style={{ width: '100%', maxWidth: 440 }}>
              <div className="card-header" style={{ marginBottom: '0.75rem' }}>
                <span className="card-title">CONFIRM SHOW</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmTarget(null)}>✕</button>
              </div>

              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                {confirmTarget.venue?.name} · {confirmTarget.venue?.city}, {confirmTarget.venue?.state}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="field">
                  <label className="field-label">Show Date <span style={{ color: '#f87171' }}>*</span></label>
                  <input
                    className="input"
                    type="date"
                    required
                    value={confirmForm.show_date}
                    onChange={e => setConfirmForm(f => ({ ...f, show_date: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label className="field-label">Fee (optional)</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 1500"
                    value={confirmForm.fee}
                    onChange={e => setConfirmForm(f => ({ ...f, fee: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label className="field-label">Draft Social Posts For</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.25rem' }}>
                    {(Object.entries(PLATFORM_INFO) as [Platform, typeof PLATFORM_INFO[Platform]][]).map(([p, info]) => (
                      <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={confirmPlatforms.includes(p)}
                          onChange={e => setConfirmPlatforms(prev =>
                            e.target.checked ? [...prev, p] : prev.filter(x => x !== p)
                          )}
                          style={{ accentColor: info.color, width: '14px', height: '14px' }}
                        />
                        <span style={{ color: confirmPlatforms.includes(p) ? info.color : 'var(--text-secondary)', fontWeight: confirmPlatforms.includes(p) ? 600 : 400 }}>
                          {info.icon} {info.label}
                        </span>
                      </label>
                    ))}
                  </div>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'block' }}>
                    AI drafts one algorithm-optimized post per platform for your approval
                  </span>
                </div>
              </div>

              {confirmError && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: '#f87171', marginTop: '0.75rem' }}>{confirmError}</div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmTarget(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={confirming}>
                  {confirming ? 'Confirming...' : 'Confirm & Create Booking'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
