import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { BOOKING_STATUS_LABELS } from '../../lib/types';
import { buildIcal, downloadIcal } from '../../lib/ical';
import Link from 'next/link';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function MemberCalendar() {
  const [shows, setShows]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [today]   = useState(new Date());
  const [current, setCurrent] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('user_profiles').select('act_id').eq('id', user.id).single();
    if (!profile?.act_id) { setLoading(false); return; }
    const { data } = await supabase.from('bookings')
      .select('id, status, show_date, set_time, load_in_time, door_time, set_length_min, advance_notes, venue:venues(name, city, state, address, phone)')
      .eq('act_id', profile.act_id)
      .in('status', ['confirmed', 'advancing', 'completed'])
      .not('show_date', 'is', null)
      .order('show_date');
    setShows(data || []);
    setLoading(false);
  };

  const prev = () => setCurrent(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 });
  const next = () => setCurrent(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 });

  const firstDay = new Date(current.year, current.month, 1).getDay();
  const daysInMonth = new Date(current.year, current.month + 1, 0).getDate();

  const showsByDate = shows.reduce((acc: Record<string, any[]>, s) => {
    const d = s.show_date?.substring(0, 10);
    if (d) { acc[d] = acc[d] || []; acc[d].push(s); }
    return acc;
  }, {});

  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const selectedShows = selected ? (showsByDate[selected] || []) : [];

  const STATUS_DOT: Record<string, string> = {
    confirmed: '#34d399', advancing: '#00e5ff', completed: '#64748b',
  };

  return (
    <AppShell requireRole="member">
      <div className="page-header">
        <div>
          <h1 className="page-title">Calendar</h1>
          <div className="page-sub">Confirmed shows only</div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => downloadIcal(buildIcal(shows, 'My Shows'), 'my-shows.ics')}
          title="Export shows to Google Calendar / Apple Calendar / Outlook"
        >
          ↓ Export Calendar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.25rem', alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <button className="btn btn-ghost btn-sm" onClick={prev}>←</button>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
              {MONTHS[current.month]} {current.year}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={next}>→</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
            {DAYS.map(d => (
              <div key={d} style={{ padding: '0.5rem', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{d}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e${i}`} style={{ minHeight: 80, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)' }} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${current.year}-${String(current.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayShows = showsByDate[dateStr] || [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selected;
              return (
                <div
                  key={day}
                  onClick={() => dayShows.length && setSelected(isSelected ? null : dateStr)}
                  style={{
                    minHeight: 80, padding: '0.4rem', cursor: dayShows.length ? 'pointer' : 'default',
                    borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                    background: isSelected ? 'rgba(0,229,255,0.06)' : 'transparent',
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: isToday ? 700 : 400,
                    color: isToday ? 'var(--accent)' : 'var(--text-secondary)',
                    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '50%', background: isToday ? 'rgba(0,229,255,0.15)' : 'transparent',
                  }}>
                    {day}
                  </div>
                  {dayShows.slice(0, 2).map((s: any) => (
                    <div key={s.id} style={{
                      marginTop: '0.2rem', fontSize: '0.72rem', padding: '0.1rem 0.3rem', borderRadius: '2px',
                      background: `${STATUS_DOT[s.status] || '#64748b'}22`,
                      color: STATUS_DOT[s.status] || '#64748b',
                      fontFamily: 'var(--font-body)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {s.venue?.name || 'TBD'}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {selected && selectedShows.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">{new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
              </div>
              {selectedShows.map((s: any) => (
                <div key={s.id} style={{ padding: '0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{s.venue?.name || 'TBD'}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                    {s.venue?.city ? `${s.venue.city}, ${s.venue.state}` : ''}
                  </div>
                  {s.venue?.address && <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '0.3rem' }}>{s.venue.address}</div>}
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    {s.load_in_time && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Load-in: <strong style={{ color: 'var(--text-primary)' }}>{s.load_in_time}</strong></span>}
                    {s.set_time && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Set: <strong style={{ color: 'var(--accent)' }}>{s.set_time}</strong></span>}
                    {s.door_time && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Doors: <strong style={{ color: 'var(--text-primary)' }}>{s.door_time}</strong></span>}
                    {s.set_length_min && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{s.set_length_min} min set</span>}
                  </div>
                  {s.venue?.phone && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>📞 {s.venue.phone}</div>}
                  {s.advance_notes && <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: '0.4rem' }}>{s.advance_notes}</div>}
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="card-header"><span className="card-title">UPCOMING SHOWS</span></div>
            {shows.filter(s => s.show_date >= todayStr).slice(0, 8).map((s: any) => (
              <div key={s.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setSelected(s.show_date)}>
                <div style={{ minWidth: 36, textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--accent)', lineHeight: 1 }}>
                    {new Date(s.show_date + 'T12:00:00').getDate()}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {new Date(s.show_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
                  </div>
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.venue?.name || 'TBD'}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'var(--font-body)' }}>{s.set_time || s.venue?.city || ''}</div>
                </div>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_DOT[s.status] || '#64748b', flexShrink: 0 }} />
              </div>
            ))}
            {shows.filter(s => s.show_date >= todayStr).length === 0 && !loading && (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>No upcoming shows.</div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
