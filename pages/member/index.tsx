import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { BOOKING_STATUS_LABELS } from '../../lib/types';

export default function MemberView() {
  const [shows, setShows]   = useState<any[]>([]);
  const [actName, setActName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('user_profiles').select('act_id').eq('id', user.id).maybeSingle();
      if (!profile?.act_id) { setLoading(false); return; }

      const { data: act } = await supabase.from('acts').select('act_name').eq('id', profile.act_id).maybeSingle();
      if (act) setActName(act.act_name);

      const { data: bookings } = await supabase.from('bookings')
        .select(`id, status, show_date, set_time, set_length_min, load_in_time, door_time, advance_notes,
          soundcheck_time, end_time, meals_provided, drinks_provided, hotel_booked, sound_system,
          special_requirements, venue_contact_name,
          venue:venues(name, city, state, address, phone)`)
        .eq('act_id', profile.act_id)
        .in('status', ['confirmed', 'advancing', 'completed'])
        .order('show_date', { ascending: true });

      setShows(bookings || []);
      setLoading(false);
    };
    load();
  }, []);

  const _td = new Date();
  const today = `${_td.getFullYear()}-${String(_td.getMonth()+1).padStart(2,'0')}-${String(_td.getDate()).padStart(2,'0')}`;
  const upcoming = shows.filter(s => s.show_date && s.show_date >= today);
  const past     = shows.filter(s => s.show_date && s.show_date < today);

  return (
    <AppShell requireRole="member">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Shows</h1>
          <div className="page-sub">{actName}</div>
        </div>
      </div>

      {upcoming.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Upcoming</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {upcoming.map((b: any) => <ShowCard key={b.id} booking={b} />)}
          </div>
        </div>
      )}

      {upcoming.length === 0 && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', marginBottom: '2rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--text-muted)' }}>NO UPCOMING SHOWS</div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Past Shows</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {past.map((b: any) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.75rem', background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', opacity: 0.7 }}>
                <div>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{b.venue?.name || 'TBD'}</span>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.82rem', marginLeft: '0.75rem' }}>
                    {b.show_date ? new Date(b.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </span>
                </div>
                <span className={`badge badge-${b.status}`}>{BOOKING_STATUS_LABELS[b.status as keyof typeof BOOKING_STATUS_LABELS]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ShowCard({ booking: b }: { booking: any }) {
  return (
    <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius)', padding: '1rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ minWidth: 52, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--accent)', lineHeight: 1 }}>
              {b.show_date ? new Date(b.show_date + 'T00:00:00').getDate() : '?'}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {b.show_date ? new Date(b.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', letterSpacing: '0.03em', color: 'var(--text-primary)' }}>{b.venue?.name || 'TBD'}</div>
            {b.venue?.city && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.1rem' }}>{b.venue.city}, {b.venue.state}</div>}
          </div>
        </div>
        <span className={`badge badge-${b.status}`}>{BOOKING_STATUS_LABELS[b.status as keyof typeof BOOKING_STATUS_LABELS]}</span>
      </div>

      {/* Times */}
      {(b.load_in_time || b.soundcheck_time || b.set_time || b.door_time || b.end_time) && (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.6rem', padding: '0.5rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)' }}>
          {b.door_time      && <span>DOORS: <span style={{ color: 'var(--text-primary)' }}>{b.door_time}</span></span>}
          {b.load_in_time   && <span>LOAD-IN: <span style={{ color: 'var(--text-primary)' }}>{b.load_in_time}</span></span>}
          {b.soundcheck_time && <span>SOUNDCHECK: <span style={{ color: 'var(--text-primary)' }}>{b.soundcheck_time}</span></span>}
          {b.set_time       && <span>SET: <span style={{ color: 'var(--accent)' }}>{b.set_time}</span>{b.set_length_min ? ` (${b.set_length_min}min)` : ''}</span>}
          {b.end_time       && <span>END: <span style={{ color: 'var(--text-primary)' }}>{b.end_time}</span></span>}
        </div>
      )}

      {/* Logistics badges */}
      {(b.meals_provided || b.drinks_provided || b.hotel_booked || b.sound_system) && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
          {b.meals_provided  && <span style={{ fontSize: '0.72rem', background: '#34d39922', color: '#34d399', padding: '0.15rem 0.5rem', borderRadius: '3px' }}>Meals Provided</span>}
          {b.drinks_provided && <span style={{ fontSize: '0.72rem', background: '#34d39922', color: '#34d399', padding: '0.15rem 0.5rem', borderRadius: '3px' }}>Drinks Provided</span>}
          {b.hotel_booked    && <span style={{ fontSize: '0.72rem', background: '#60a5fa22', color: '#60a5fa', padding: '0.15rem 0.5rem', borderRadius: '3px' }}>Hotel Booked</span>}
          {b.sound_system    && <span style={{ fontSize: '0.72rem', background: 'var(--bg-overlay)', color: 'var(--text-muted)', padding: '0.15rem 0.5rem', borderRadius: '3px', textTransform: 'uppercase', fontFamily: 'var(--font-body)' }}>Sound: {b.sound_system}</span>}
        </div>
      )}

      {b.venue?.address && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
          📍 {b.venue.address}
        </div>
      )}
      {b.venue?.phone && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
          📞 {b.venue.phone}
        </div>
      )}
      {b.venue_contact_name && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
          Contact: {b.venue_contact_name}
        </div>
      )}
      {b.special_requirements && (
        <div style={{ marginBottom: '0.4rem', fontSize: '0.8rem', color: '#f59e0b' }}>
          ⚠ {b.special_requirements}
        </div>
      )}
      {b.advance_notes && (
        <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {b.advance_notes}
        </div>
      )}
    </div>
  );
}
