import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { Venue } from '../../lib/types';

export default function VenuesPage() {
  const router = useRouter();
  const [venues, setVenues]     = useState<Venue[]>([]);
  const [search, setSearch]     = useState('');
  const [filterState, setFilterState] = useState('');
  const [showNew, setShowNew]   = useState(false);
  const [form, setForm]         = useState({ name: '', city: '', state: '', address: '', phone: '', email: '', website: '', venue_type: '', capacity: '' });
  const [saving, setSaving]     = useState(false);

  useEffect(() => { loadVenues(); }, []);

  const loadVenues = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('venues').select('*').eq('agent_id', user.id).order('name');
    setVenues(data || []);
  };

  const saveVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('venues').insert({
      agent_id:   user!.id,
      name:       form.name,
      city:       form.city,
      state:      form.state,
      address:    form.address || null,
      phone:      form.phone   || null,
      email:      form.email   || null,
      website:    form.website || null,
      venue_type: form.venue_type || null,
      capacity:   form.capacity ? Number(form.capacity) : null,
    });
    setForm({ name: '', city: '', state: '', address: '', phone: '', email: '', website: '', venue_type: '', capacity: '' });
    setShowNew(false);
    await loadVenues();
    setSaving(false);
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const states = [...new Set(venues.map(v => v.state).filter(Boolean))].sort();
  const filtered = venues.filter(v => {
    const q = search.toLowerCase();
    const nameMatch = !q || v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q);
    const stateMatch = !filterState || v.state === filterState;
    return nameMatch && stateMatch;
  });

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">Venues</h1>
          <div className="page-sub">{venues.length} venues in database</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Add Venue</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 300 }} placeholder="Search venues..." value={search} onChange={e => setSearch(e.target.value)} />
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
                <th>Venue</th>
                <th>Location</th>
                <th>Type</th>
                <th>Capacity</th>
                <th>Email</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/venues/${v.id}`)}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{v.name}</td>
                  <td>{v.city}, {v.state}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{v.venue_type || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{v.capacity ? v.capacity.toLocaleString() : '—'}</td>
                  <td style={{ color: 'var(--accent)', fontSize: '0.82rem' }}>{v.email || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{v.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
              {venues.length === 0 ? 'No venues yet.' : 'No venues match your filters.'}
            </div>
          )}
        </div>
      </div>

      {/* New Venue Modal */}
      {showNew && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3 className="modal-title">Add Venue</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}>✕</button>
            </div>
            <form onSubmit={saveVenue} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="field">
                <label className="field-label">Venue Name *</label>
                <input className="input" value={form.name} onChange={set('name')} required autoFocus />
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
              <div className="field">
                <label className="field-label">Address</label>
                <input className="input" value={form.address} onChange={set('address')} />
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
                    <option value="bar">Bar</option>
                    <option value="club">Club/Nightclub</option>
                    <option value="concert_hall">Concert Hall</option>
                    <option value="festival">Festival</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="winery">Winery/Brewery</option>
                    <option value="outdoor">Outdoor</option>
                    <option value="theater">Theater</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Capacity</label>
                  <input className="input" type="number" value={form.capacity} onChange={set('capacity')} />
                </div>
              </div>
              <div className="field">
                <label className="field-label">Website</label>
                <input className="input" type="url" value={form.website} onChange={set('website')} placeholder="https://..." />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Add Venue'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
