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
  const [loading, setLoading]   = useState(true);
  const [responding, setResponding] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Find the act this user owns
    const { data: acts } = await supabase.from('acts').select('*').eq('owner_id', user.id).eq('is_active', true).limit(1);
    const act = acts?.[0] || null;
    setMyAct(act);

    if (!act) { setLoading(false); return; }

    const [bookingsRes, linksRes] = await Promise.all([
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
    ]);

    const all = bookingsRes.data || [];
    const today = new Date().toISOString().substring(0, 10);
    setUpcoming(all.filter((b: any) => b.show_date && b.show_date >= today).slice(0, 5));
    setShows(all);
    setPendingLinks(linksRes.data || []);
    setLoading(false);
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
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/band/settings" className="btn btn-secondary">Band Settings</Link>
          <Link href="/bookings/new" className="btn btn-primary">+ New Booking</Link>
        </div>
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
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>NO BAND PROFILE</div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Your account isn't connected to a band yet.</p>
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
                  No bookings yet. <Link href="/bookings/new" style={{ color: 'var(--accent)' }}>Add your first booking →</Link>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
