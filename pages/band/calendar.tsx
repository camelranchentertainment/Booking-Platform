import { useState, useEffect } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { BOOKING_STATUS_LABELS } from '../../lib/types';
import { buildIcal, downloadIcal } from '../../lib/ical';
import Link from 'next/link';

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const STATUS_DOT: Record<string, string> = {
  confirmed: '#34d399', advancing: '#60a5fa', completed: '#64748b',
  pitch: '#fbbf24', contract: '#a78bfa', hold: '#f97316',
};

export default function BandCalendar() {
  const [shows, setShows]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [today]   = useState(new Date());
  const [current, setCurrent] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [selected, setSelected] = useState<string | null>(null);
  const [detailBooking, setDetailBooking] = useState<any>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: ownedActs } = await supabase.from('acts').select('id').eq('owner_id', user.id).eq('is_active', true);
    let actId: string | null = ownedActs?.[0]?.id || null;

    if (!actId) {
      const { data: profile } = await supabase.from('user_profiles').select('act_id').eq('id', user.id).single();
      actId = profile?.act_id || null;
    }

    if (!actId) { setLoading(false); return; }

    const { data } = await supabase.from('bookings')
      .select('id, status, show_date, set_time, load_in_time, door_time, set_length_min, advance_notes, fee, venue:venues(name, city, state, address, phone)')
      .eq('act_id', actId)
      .neq('status', 'cancelled')
      .not('show_date', 'is', null)
      .order('show_date');
    setShows(data || []);
    setLoading(false);
  };

  const prev = () => setCurrent(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 });
  const next = () => setCurrent(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 });

  const firstDay    = new Date(current.year, current.month, 1).getDay();
  const daysInMonth = new Date(current.year, current.month + 1, 0).getDate();

  const showsByDate = shows.reduce((acc: Record<string, any[]>, s) => {
    const d = s.show_date?.substring(0, 10);
    if (d) { acc[d] = acc[d] || []; acc[d].push(s); }
    return acc;
  }, {});

  const todayStr     = today.toISOString().substring(0, 10);
  const selectedShows = selected ? (showsByDate[selected] || []) : [];
  const upcoming      = shows.filter(s => s.show_date >= todayStr).slice(0, 8);

  const goToday = () => setCurrent({ year: today.getFullYear(), month: today.getMonth() });
  const isCurrentMonth = current.year === today.getFullYear() && current.month === today.getMonth();

  return (
    <AppShell requireRole="act_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Calendar</h1>
          <div className="page-sub">{shows.length} booking{shows.length !== 1 ? 's' : ''} scheduled</div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {!isCurrentMonth && (
            <button className="btn btn-ghost btn-sm" onClick={goToday}>Today</button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => downloadIcal(buildIcal(shows, 'Band Shows'), 'band-shows.ics')}
            title="Export to Google / Apple / Outlook"
          >
            ↓ Export
          </button>
          <Link href="/band" className="btn btn-primary">+ Add Show</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.25rem', alignItems: 'start' }}>
        {/* Calendar grid */}
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
              const day      = i + 1;
              const dateStr  = `${current.year}-${String(current.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayShows = showsByDate[dateStr] || [];
              const isToday  = dateStr === todayStr;
              const isSel    = dateStr === selected;
              return (
                <div
                  key={day}
                  onClick={() => setSelected(isSel ? null : dateStr)}
                  style={{
                    minHeight: 80, padding: '0.4rem', cursor: dayShows.length ? 'pointer' : 'default',
                    borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                    background: isSel ? 'var(--accent-glow)' : 'transparent', transition: 'background 0.15s',
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.84rem', fontWeight: isToday ? 700 : 400,
                    color: isToday ? 'var(--accent)' : 'var(--text-secondary)',
                    width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '50%', background: isToday ? 'var(--accent-glow)' : 'transparent',
                    marginBottom: '0.2rem',
                  }}>
                    {day}
                  </div>
                  {dayShows.slice(0, 2).map((s: any) => (
                    <div key={s.id} style={{
                      fontSize: '0.72rem', padding: '0.1rem 0.25rem', borderRadius: '2px',
                      background: `${STATUS_DOT[s.status] || '#64748b'}22`,
                      color: STATUS_DOT[s.status] || '#64748b',
                      fontFamily: 'var(--font-body)', fontWeight: 500,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '0.1rem',
                    }}>
                      {s.venue?.name || 'TBD'}
                    </div>
                  ))}
                  {dayShows.length > 2 && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>+{dayShows.length - 2}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Side panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {selected && selectedShows.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title" style={{ fontSize: '0.85rem' }}>
                  {new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
              </div>
              {selectedShows.map((s: any) => (
                <div key={s.id} onClick={() => setDetailBooking(s)} style={{ display: 'block', cursor: 'pointer', padding: '0.75rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', marginBottom: '0.5rem', borderLeft: `3px solid ${STATUS_DOT[s.status] || 'var(--accent)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{s.venue?.name || 'TBD'}</div>
                    <span className={`badge badge-${s.status}`}>{BOOKING_STATUS_LABELS[s.status as keyof typeof BOOKING_STATUS_LABELS]}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'var(--font-body)', marginTop: '0.25rem' }}>
                    {s.venue?.city ? `${s.venue.city}, ${s.venue.state}` : ''}
                    {s.set_time ? ` · ${s.set_time}` : ''}
                    {s.fee ? ` · $${Number(s.fee).toLocaleString()}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="card-header"><span className="card-title">UPCOMING</span></div>
            {loading && <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>Loading...</div>}
            {!loading && upcoming.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>No upcoming shows.</div>
            )}
            {upcoming.map((s: any) => (
              <div
                key={s.id}
                onClick={() => setDetailBooking(s)}
                style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', padding: '0.5rem 0.4rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.12s', borderRadius: 0 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(200,146,26,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ minWidth: 32, textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--accent)', lineHeight: 1 }}>
                    {new Date(s.show_date + 'T12:00:00').getDate()}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.66rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {new Date(s.show_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
                  </div>
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: '0.84rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.venue?.name || 'TBD'}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-body)' }}>{s.venue?.city || ''}</div>
                </div>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[s.status] || '#64748b', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      {detailBooking && (
        <div className="modal-backdrop" onClick={() => setDetailBooking(null)}>
          <div className="modal" style={{ maxWidth: 480, position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setDetailBooking(null)}>✕</button>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--accent)', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>
              {detailBooking.venue?.name || 'TBD'}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'var(--font-mono)', marginBottom: '1.5rem', letterSpacing: '0.06em' }}>
              {[detailBooking.venue?.city && `${detailBooking.venue.city}, ${detailBooking.venue.state}`, detailBooking.venue?.address].filter(Boolean).join(' · ')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {([
                ['Date',       detailBooking.show_date ? new Date(detailBooking.show_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—'],
                ['Status',     BOOKING_STATUS_LABELS[detailBooking.status as keyof typeof BOOKING_STATUS_LABELS] || detailBooking.status],
                ['Fee',        detailBooking.fee ? `$${Number(detailBooking.fee).toLocaleString()}` : '—'],
                ['Door',       detailBooking.door_time || '—'],
                ['Load In',    detailBooking.load_in_time || '—'],
                ['Set Time',   detailBooking.set_time || '—'],
                ['Set Length', detailBooking.set_length_min ? `${detailBooking.set_length_min} min` : '—'],
                ['Phone',      detailBooking.venue?.phone || '—'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="modal-row">
                  <div className="modal-row-label">{label}</div>
                  <div className="modal-row-value">{value}</div>
                </div>
              ))}
              {detailBooking.advance_notes && (
                <div className="modal-row" style={{ borderBottom: 'none' }}>
                  <div className="modal-row-label">Notes</div>
                  <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1 }}>{detailBooking.advance_notes}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
