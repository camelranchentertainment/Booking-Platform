import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';

type Show = {
  id: string;
  booking_id: string | null;
  status: 'pending' | 'confirmed' | 'declined';
  notes: string | null;
  responded_at: string | null;
  show_date: string | null;
  booking_status: string | null;
  load_in_time: string | null;
  set_time: string | null;
  door_time: string | null;
  soundcheck_time: string | null;
  venue: { name: string | null; address: string | null; city: string | null; state: string | null } | null;
  pay: { amount: number; source: 'confirmed' | 'estimated' } | null;
};

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const RSVP_COLOR: Record<string, string> = {
  pending:   '#fbbf24',
  confirmed: '#34d399',
  declined:  '#64748b',
};
const RSVP_LABEL: Record<string, string> = {
  pending:   'Pending',
  confirmed: 'Confirmed',
  declined:  'Declined',
};

function fmt(t: string | null | undefined) {
  if (!t) return null;
  const [h, m] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function RsvpBadge({ status }: { status: string }) {
  const color = RSVP_COLOR[status] || '#64748b';
  return (
    <span style={{
      fontFamily: 'var(--font-body)', fontSize: '0.68rem', fontWeight: 600,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      color, background: `${color}20`, padding: '0.15rem 0.45rem',
      borderRadius: '3px', flexShrink: 0, border: `1px solid ${color}40`,
    }}>
      {RSVP_LABEL[status] || status}
    </span>
  );
}

export default function MemberCalendar() {
  const [shows, setShows]     = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [today]    = useState(new Date());
  const [current, setCurrent] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/member/shows', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) { setFetchError(json.error || 'Failed to load shows'); return; }
      setShows(json.shows || []);
    } catch {
      setFetchError('Failed to load shows.');
    } finally {
      setLoading(false);
    }
  };

  const prev = () => setCurrent(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 });
  const next = () => setCurrent(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 });

  const firstDay    = new Date(current.year, current.month, 1).getDay();
  const daysInMonth = new Date(current.year, current.month + 1, 0).getDate();

  const showsByDate = shows.reduce((acc: Record<string, Show[]>, s) => {
    const d = s.show_date?.substring(0, 10);
    if (d) { acc[d] = acc[d] || []; acc[d].push(s); }
    return acc;
  }, {});

  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const selectedShows = selected ? (showsByDate[selected] || []) : [];
  const upcoming = shows.filter(s => s.show_date && s.show_date >= todayStr);

  return (
    <AppShell requireRole="member">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Shows</h1>
          <div className="page-sub">Roster assignments &amp; RSVPs</div>
        </div>
      </div>

      {fetchError && (
        <div style={{ color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {fetchError}
        </div>
      )}

      <div className="calendar-layout">
        {/* ── Calendar grid ── */}
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
              const day     = i + 1;
              const dateStr = `${current.year}-${String(current.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayShows  = showsByDate[dateStr] || [];
              const isToday    = dateStr === todayStr;
              const isSelected = dateStr === selected;
              return (
                <div
                  key={day}
                  onClick={() => dayShows.length && setSelected(isSelected ? null : dateStr)}
                  style={{
                    minHeight: 80, padding: '0.4rem',
                    cursor: dayShows.length ? 'pointer' : 'default',
                    borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                    background: isSelected ? 'rgba(200,146,26,0.06)' : 'transparent',
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: isToday ? 700 : 400,
                    color: isToday ? 'var(--accent)' : 'var(--text-secondary)',
                    width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '50%', background: isToday ? 'rgba(200,146,26,0.15)' : 'transparent',
                  }}>
                    {day}
                  </div>
                  {dayShows.slice(0, 2).map(s => (
                    <Link
                      key={s.id}
                      href={`/member/shows/${s.id}`}
                      onClick={e => e.stopPropagation()}
                      style={{
                        display: 'block', marginTop: '0.2rem', fontSize: '0.72rem',
                        padding: '0.1rem 0.3rem', borderRadius: '2px', textDecoration: 'none',
                        background: `${RSVP_COLOR[s.status] || '#64748b'}22`,
                        color: RSVP_COLOR[s.status] || '#64748b',
                        fontFamily: 'var(--font-body)', fontWeight: 500,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      {s.venue?.name || 'TBD'}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Selected-day detail */}
          {selected && selectedShows.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  {new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
              </div>
              {selectedShows.map(s => (
                <Link key={s.id} href={`/member/shows/${s.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{ padding: '0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{s.venue?.name || 'TBD'}</div>
                      <RsvpBadge status={s.status} />
                    </div>
                    {s.venue?.city && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'var(--font-body)' }}>
                        {s.venue.city}, {s.venue.state}
                      </div>
                    )}
                    {s.venue?.address && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '0.25rem' }}>{s.venue.address}</div>
                    )}
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                      {s.door_time      && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Doors: <strong style={{ color: 'var(--text-primary)' }}>{fmt(s.door_time)}</strong></span>}
                      {s.load_in_time   && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Load-in: <strong style={{ color: 'var(--text-primary)' }}>{fmt(s.load_in_time)}</strong></span>}
                      {s.soundcheck_time && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Soundcheck: <strong style={{ color: 'var(--text-primary)' }}>{fmt(s.soundcheck_time)}</strong></span>}
                      {s.set_time       && <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Set: <strong style={{ color: 'var(--accent)' }}>{fmt(s.set_time)}</strong></span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Upcoming list */}
          <div className="card">
            <div className="card-header"><span className="card-title">UPCOMING SHOWS</span></div>
            {loading && (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>Loading...</div>
            )}
            {!loading && upcoming.slice(0, 8).map(s => (
              <Link key={s.id} href={`/member/shows/${s.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ minWidth: 36, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--accent)', lineHeight: 1 }}>
                      {new Date(s.show_date! + 'T12:00:00').getDate()}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      {new Date(s.show_date! + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.venue?.name || 'TBD'}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'var(--font-body)' }}>
                      {s.set_time ? fmt(s.set_time) : (s.venue?.city || '')}
                    </div>
                  </div>
                  <RsvpBadge status={s.status} />
                </div>
              </Link>
            ))}
            {!loading && upcoming.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>No upcoming shows.</div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
