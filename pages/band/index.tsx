import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { BOOKING_STATUS_LABELS, AgentActLink } from '../../lib/types';
import Link from 'next/link';

export default function BandPortal() {
  const [myAct, setMyAct]       = useState<any>(null);
  const [shows, setShows]       = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [pendingLinks, setPendingLinks] = useState<any[]>([]);
  const [tours, setTours]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [responding, setResponding] = useState('');

  // Add show modal
  const [showModal, setShowModal]   = useState(false);
  const [showForm, setShowForm]     = useState({ venueName: '', city: '', state: '', show_date: '', status: 'confirmed', fee: '', notes: '' });
  const [venueSearch, setVenueSearch] = useState<any[]>([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<any>(null);
  const [showSaving, setShowSaving]   = useState(false);
  const [showError, setShowError]     = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Find the act: first by direct ownership, then by act_id on the profile (agent-created acts)
    let { data: acts } = await supabase.from('acts').select('*').eq('owner_id', user.id).eq('is_active', true).limit(1);
    if (!acts?.length) {
      const { data: prof } = await supabase.from('user_profiles').select('act_id').eq('id', user.id).single();
      if (prof?.act_id) {
        const { data: linked } = await supabase.from('acts').select('*').eq('id', prof.act_id).eq('is_active', true).limit(1);
        acts = linked;
      }
    }
    const act = acts?.[0] || null;
    setMyAct(act);

    if (!act) { setLoading(false); return; }

    const [bookingsRes, linksRes, toursRes] = await Promise.all([
      supabase.from('bookings')
        .select('id, status, show_date, set_time, load_in_time, door_time, set_length_min, advance_notes, fee, venue:venues(name, city, state, address, phone)')
        .eq('act_id', act.id)
        .neq('status', 'cancelled')
        .order('show_date', { ascending: true }),
      supabase.from('agent_act_links')
        .select(`id, status, permissions, message, invited_at,
          agent:agent_id(id, display_name, agency_name, email)`)
        .eq('act_id', act.id)
        .eq('status', 'pending'),
      supabase.from('tours').select('id, name, status, start_date, end_date').or(`act_id.eq.${act.id},created_by.eq.${user.id}`).neq('status', 'cancelled').order('start_date', { ascending: true }).limit(5),
    ]);

    const all = bookingsRes.data || [];
    const today = new Date().toISOString().substring(0, 10);
    setUpcoming(all.filter((b: any) => b.show_date && b.show_date >= today).slice(0, 5));
    setShows(all);
    setPendingLinks(linksRes.data || []);
    setTours(toursRes.data || []);
    setLoading(false);
  };

  const openShowModal = () => {
    setShowForm({ venueName: '', city: '', state: '', show_date: '', status: 'confirmed', fee: '', notes: '' });
    setSelectedVenue(null);
    setVenueSearch([]);
    setShowError('');
    setShowModal(true);
  };

  const searchVenues = async (q: string) => {
    setShowForm(f => ({ ...f, venueName: q }));
    setSelectedVenue(null);
    if (q.length < 2) { setVenueSearch([]); return; }
    setVenueSearching(true);
    const { data: { user } } = await supabase.auth.getUser();
    // Search agent's venues if act is agent-managed, otherwise user's own venues
    const lookupId = myAct?.agent_id || user!.id;
    const { data } = await supabase.from('venues').select('id, name, city, state, address, phone, email')
      .eq('agent_id', lookupId).ilike('name', `%${q}%`).order('name').limit(8);
    setVenueSearch(data || []);
    setVenueSearching(false);
  };

  const saveShow = async () => {
    if (!myAct) return;
    if (!showForm.venueName.trim()) { setShowError('Venue name is required'); return; }
    if (!showForm.show_date) { setShowError('Show date is required'); return; }
    setShowSaving(true);
    setShowError('');

    const { data: { user } } = await supabase.auth.getUser();
    let venueId: string | null = selectedVenue?.id || null;

    // If no venue selected from search, find or create one under the appropriate owner
    if (!venueId && showForm.venueName.trim()) {
      const ownerAgentId = myAct?.agent_id || user!.id;
      const city = showForm.city.trim() || '';
      const { data: existing } = await supabase.from('venues').select('id')
        .eq('agent_id', ownerAgentId).ilike('name', showForm.venueName.trim())
        .maybeSingle();
      if (existing) {
        venueId = existing.id;
      } else {
        // New venues created by band admins go under their own user id (RLS allows this)
        const { data: newV } = await supabase.from('venues').insert({
          agent_id: user!.id, name: showForm.venueName.trim(),
          city: city || 'Unknown', state: showForm.state.trim() || null,
          source: 'manual', country: 'US',
        }).select('id').single();
        venueId = newV?.id || null;
      }
    }

    const { error } = await supabase.from('bookings').insert({
      created_by: user!.id,
      act_id:     myAct.id,
      venue_id:   venueId,
      status:     showForm.status,
      show_date:  showForm.show_date,
      fee:        showForm.fee ? Number(showForm.fee) : null,
      deal_notes: showForm.notes || null,
    });

    if (error) { setShowError(error.message); setShowSaving(false); return; }
    setShowModal(false);
    await load();
    setShowSaving(false);
  };

  const respondToLink = async (linkId: string, action: 'accept' | 'decline') => {
    setResponding(linkId);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/agent-link/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ linkId, action }),
    });
    await load();
    setResponding('');
  };

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">{myAct?.act_name || 'My Band'}</h1>
          <div className="page-sub">
            {myAct?.agent_id
              ? 'Agent-managed · Your booking agent has visibility'
              : 'Self-managed · No agent connected'}
          </div>
        </div>
        {myAct && (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link href="/band/settings" className="btn btn-secondary">Band Settings</Link>
            <button className="btn btn-primary" onClick={openShowModal}>+ Add Show</button>
          </div>
        )}
      </div>

      {/* Pending agent link requests */}
      {pendingLinks.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          {pendingLinks.map((link: any) => (
            <div key={link.id} style={{ background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.35)', borderRadius: 'var(--radius)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '0.3rem' }}>
                  Agent Link Request
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                  {(link.agent as any)?.agency_name || (link.agent as any)?.display_name} wants to represent your band
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                  {(link.agent as any)?.email} · {link.permissions === 'manage' ? 'Full management access' : 'View access only'}
                </div>
                {link.message && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.5rem', lineHeight: 1.5 }}>"{link.message}"</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!!responding}
                  onClick={() => respondToLink(link.id, 'decline')}
                  style={{ color: '#f87171', borderColor: '#f87171' }}>
                  {responding === link.id ? '...' : 'Decline'}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!!responding}
                  onClick={() => respondToLink(link.id, 'accept')}
                  style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#000' }}>
                  {responding === link.id ? '...' : 'Accept'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No act yet */}
      {!myAct && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--accent)', marginBottom: '1rem' }}>GET STARTED</div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Your account isn't connected to a band yet. Create your band profile to manage bookings, share your calendar, and connect with agents.
          </p>
          <Link href="/band/settings" className="btn btn-primary">Set Up Your Band →</Link>
        </div>
      )}

      {myAct && (
        <>
          {/* Upcoming shows */}
          {upcoming.length > 0 && (
            <div className="card mb-6">
              <div className="card-header"><span className="card-title">UPCOMING SHOWS</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {upcoming.map((b: any) => (
                  <div key={b.id} style={{ display: 'flex', gap: '1rem', padding: '0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ minWidth: 56, textAlign: 'center', borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--accent)', lineHeight: 1 }}>
                        {b.show_date ? new Date(b.show_date + 'T00:00:00').getDate() : '?'}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {b.show_date ? new Date(b.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' }) : ''}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{b.venue?.name || 'TBD'}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'var(--font-mono)', marginTop: '0.1rem' }}>
                        {b.venue?.city ? `${b.venue.city}, ${b.venue.state}` : ''}
                        {b.set_time ? ` · Set: ${b.set_time}` : ''}
                        {b.fee ? ` · $${Number(b.fee).toLocaleString()}` : ''}
                      </div>
                      {b.advance_notes && <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.4rem' }}>{b.advance_notes}</div>}
                    </div>
                    <span className={`badge badge-${b.status}`}>{BOOKING_STATUS_LABELS[b.status as keyof typeof BOOKING_STATUS_LABELS]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All shows */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">ALL BOOKINGS ({shows.length})</span>
              <Link href="/bookings" className="btn btn-ghost btn-sm">Pipeline View</Link>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Date</th><th>Venue</th><th>Location</th><th>Status</th><th>Fee</th></tr>
                </thead>
                <tbody>
                  {shows.map((b: any) => (
                    <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/bookings/${b.id}`}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                        {b.show_date ? new Date(b.show_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{b.venue?.name || 'TBD'}</td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.83rem' }}>{b.venue?.city ? `${b.venue.city}, ${b.venue.state}` : '—'}</td>
                      <td><span className={`badge badge-${b.status}`}>{BOOKING_STATUS_LABELS[b.status as keyof typeof BOOKING_STATUS_LABELS]}</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--accent)' }}>{b.fee ? `$${Number(b.fee).toLocaleString()}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shows.length === 0 && !loading && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.84rem' }}>
                  No bookings yet. <button onClick={openShowModal} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, font: 'inherit' }}>Add your first booking →</button>
                </div>
              )}
            </div>
          </div>

          {/* Tours */}
          {tours.length > 0 && (
            <div className="card" style={{ marginTop: '1.5rem' }}>
              <div className="card-header">
                <span className="card-title">TOURS ({tours.length})</span>
                <Link href="/band/tours" className="btn btn-ghost btn-sm">View All</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {tours.map((t: any) => (
                  <Link key={t.id} href={`/tours/${t.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', textDecoration: 'none' }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.88rem' }}>{t.name}</div>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: t.status === 'active' ? '#34d399' : 'var(--text-muted)' }}>{t.status}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {/* Add Show Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#2c2e45', borderRadius: 'var(--radius)', padding: '2rem', width: '100%', maxWidth: 480, position: 'relative' }}>
            <button onClick={() => setShowModal(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>✕</button>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: '1.5rem' }}>ADD SHOW</div>

            {showError && (
              <div style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.9rem', color: '#f87171', fontSize: '0.84rem', marginBottom: '1rem' }}>{showError}</div>
            )}

            {/* Venue name with live search */}
            <div style={{ marginBottom: '1rem', position: 'relative' }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Venue Name *</label>
              <input
                type="text"
                className="input"
                placeholder="Search or type a venue name…"
                value={showForm.venueName}
                onChange={e => searchVenues(e.target.value)}
                autoComplete="off"
              />
              {venueSearching && <div style={{ position: 'absolute', right: '0.75rem', top: '2.2rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>…</div>}
              {venueSearch.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e2035', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
                  {venueSearch.map((v: any) => (
                    <div key={v.id}
                      onClick={() => {
                        setSelectedVenue(v);
                        setShowForm(f => ({ ...f, venueName: v.name, city: v.city || '', state: v.state || '' }));
                        setVenueSearch([]);
                      }}
                      style={{ padding: '0.6rem 0.85rem', cursor: 'pointer', fontSize: '0.88rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontWeight: 500 }}>{v.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>{v.city}{v.state ? `, ${v.state}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* City / State row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>City</label>
                <input type="text" className="input" placeholder="City" value={showForm.city} onChange={e => setShowForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>State</label>
                <input type="text" className="input" placeholder="CO" value={showForm.state} onChange={e => setShowForm(f => ({ ...f, state: e.target.value }))} maxLength={2} />
              </div>
            </div>

            {/* Show date */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Show Date *</label>
              <input type="date" className="input" value={showForm.show_date} onChange={e => setShowForm(f => ({ ...f, show_date: e.target.value }))} />
            </div>

            {/* Status / Fee row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Status</label>
                <select className="input" value={showForm.status} onChange={e => setShowForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                  <option value="hold">Hold</option>
                  <option value="advance">Advance</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Fee ($)</label>
                <input type="number" className="input" placeholder="0" value={showForm.fee} onChange={e => setShowForm(f => ({ ...f, fee: e.target.value }))} min="0" />
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Notes</label>
              <textarea className="input" rows={3} placeholder="Deal notes, load-in time, contacts…" value={showForm.notes} onChange={e => setShowForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={showSaving}>Cancel</button>
              <button className="btn btn-primary" onClick={saveShow} disabled={showSaving} style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#000' }}>
                {showSaving ? 'Saving…' : 'Add Show'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
