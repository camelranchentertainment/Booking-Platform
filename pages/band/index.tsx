import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { BOOKING_STATUS_LABELS } from '../../lib/types';
import Link from 'next/link';

export default function BandPortal() {
  const [actName, setActName] = useState('');
  const [shows, setShows]     = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [loading, setLoading]  = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from('user_profiles').select('act_id, role').eq('id', user.id).maybeSingle();
      if (!profile?.act_id) { setLoading(false); return; }

      const { data: act } = await supabase.from('acts').select('act_name').eq('id', profile.act_id).maybeSingle();
      if (act) setActName(act.act_name);

      const { data: bookings } = await supabase.from('bookings')
        .select('id, status, show_date, set_time, fee, advance_notes, venue:venues(name, city, state, address, phone)')
        .eq('act_id', profile.act_id)
        .neq('status', 'cancelled')
        .order('show_date', { ascending: true });

      const all = bookings || [];
      const today = new Date().toISOString().substring(0, 10);
      setUpcoming(all.filter(b => b.show_date && b.show_date >= today).slice(0, 5));
      setShows(all);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">{actName || 'Band Portal'}</h1>
          <div className="page-sub">Your shows & schedule</div>
        </div>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="card mb-6">
          <div className="card-header"><span className="card-title">UPCOMING SHOWS</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {upcoming.map((b: any) => (
              <div key={b.id} style={{ display: 'flex', gap: '1rem', padding: '0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ minWidth: 64, textAlign: 'center', borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--accent)', lineHeight: 1 }}>
                    {b.show_date ? new Date(b.show_date + 'T00:00:00').getDate() : '?'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {b.show_date ? new Date(b.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' }) : ''}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{b.venue?.name || 'TBD'}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                    {b.venue?.city ? `${b.venue.city}, ${b.venue.state}` : ''}
                    {b.set_time ? ` · ${b.set_time}` : ''}
                  </div>
                  {b.venue?.address && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.2rem' }}>{b.venue.address}</div>}
                  {b.advance_notes && <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.4rem', lineHeight: 1.5 }}>{b.advance_notes}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                  <span className={`badge badge-${b.status}`}>{BOOKING_STATUS_LABELS[b.status as keyof typeof BOOKING_STATUS_LABELS]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All shows */}
      <div className="card">
        <div className="card-header"><span className="card-title">ALL SHOWS ({shows.length})</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Venue</th><th>Location</th><th>Status</th></tr>
            </thead>
            <tbody>
              {shows.map((b: any) => (
                <tr key={b.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                    {b.show_date ? new Date(b.show_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{b.venue?.name || 'TBD'}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.83rem' }}>
                    {b.venue?.city ? `${b.venue.city}, ${b.venue.state}` : '—'}
                  </td>
                  <td><span className={`badge badge-${b.status}`}>{BOOKING_STATUS_LABELS[b.status as keyof typeof BOOKING_STATUS_LABELS]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {shows.length === 0 && !loading && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>No shows yet.</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
