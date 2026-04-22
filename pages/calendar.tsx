import { useState, useEffect } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { BOOKING_STATUS_LABELS } from '../lib/types';
import Link from 'next/link';

const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const ACT_COLORS = [
  '#D4A843','#BF5FFF','#FF3CAC','#34d399','#60a5fa','#f97316','#e879f9','#22d3ee',
];

const STATUS_DOT: Record<string, string> = {
  confirmed:   '#34d399',
  advancing:   '#60a5fa',
  completed:   '#6b7280',
  contract:    '#a78bfa',
  hold:        '#f97316',
  negotiation: '#fbbf24',
  pitch:       '#94a3b8',
  followup:    '#c084fc',
};

export default function AgentCalendar() {
  const [shows, setShows]     = useState<any[]>([]);
  const [acts, setActs]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [today]     = useState(new Date());
  const [current, setCurrent] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [selected, setSelected]   = useState<string | null>(null);
  const [filterAct, setFilterAct] = useState<string>('all');

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load all acts managed by this agent (direct + via agent_act_links)
    const [directRes, linkedRes] = await Promise.all([
      supabase.from('acts').select('id, act_name').eq('agent_id', user.id).eq('is_active', true),
      supabase.from('agent_act_links').select('act:acts(id, act_name)').eq('agent_id', user.id).eq('status', 'active'),
    ]);

    const directActs = directRes.data || [];
    const linkedActs = (linkedRes.data || []).map((r: any) => r.act).filter(Boolean);
    const allActs = [...directActs, ...linkedActs.filter((a: any) => !directActs.find((d: any) => d.id === a.id))];
    setActs(allActs);

    if (!allActs.length) { setLoading(false); return; }

    const actIds = allActs.map((a: any) => a.id);
    const { data } = await supabase
      .from('bookings')
      .select('id, status, show_date, set_time, fee, act_id, venue:venues(name, city, state)')
      .in('act_id', actIds)
      .neq('status', 'cancelled')
      .not('show_date', 'is', null)
      .order('show_date');

    setShows(data || []);
    setLoading(false);
  };

  const prev = () => setCurrent(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 });
  const next = () => setCurrent(c => c.month === 11 ? { year: c.year + 1, month: 0  } : { ...c, month: c.month + 1 });

  const actColorMap = Object.fromEntries(acts.map((a, i) => [a.id, ACT_COLORS[i % ACT_COLORS.length]]));

  const filtered = filterAct === 'all' ? shows : shows.filter(s => s.act_id === filterAct);

  const showsByDate = filtered.reduce((acc: Record<string, any[]>, s) => {
    const d = s.show_date?.substring(0, 10);
    if (d) { acc[d] = acc[d] || []; acc[d].push(s); }
    return acc;
  }, {});

  const todayStr    = today.toISOString().substring(0, 10);
  const selectedShows = selected ? (showsByDate[selected] || []) : [];
  const firstDay    = new Date(current.year, current.month, 1).getDay();
  const daysInMonth = new Date(current.year, current.month + 1, 0).getDate();

  const upcoming = filtered.filter(s => s.show_date >= todayStr).slice(0, 10);
  const actName  = (id: string) => acts.find(a => a.id === id)?.act_name || '';

  return (
    <AppShell requireRole="agent">
      <div className="page-header">
        <div>
          <h1 className="page-title">Calendar</h1>
          <div className="page-sub">{filtered.length} shows scheduled</div>
        </div>
        <Link href="/bookings/new" className="btn btn-primary">+ Add Show</Link>
      </div>

      {/* Act filter */}
      {acts.length > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilterAct('all')}
            style={{
              fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.04em',
              textTransform: 'uppercase', padding: '0.3rem 0.75rem',
              border: `1px solid ${filterAct === 'all' ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              background: filterAct === 'all' ? 'var(--accent-glow)' : 'transparent',
              color: filterAct === 'all' ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >All Acts</button>
          {acts.map((a: any) => (
            <button
              key={a.id}
              onClick={() => setFilterAct(a.id)}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.04em',
                textTransform: 'uppercase', padding: '0.3rem 0.75rem',
                border: `1px solid ${filterAct === a.id ? actColorMap[a.id] : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: filterAct === a.id ? `${actColorMap[a.id]}18` : 'transparent',
                color: filterAct === a.id ? actColorMap[a.id] : 'var(--text-muted)',
              }}
            >{a.act_name}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.25rem', alignItems: 'start' }}>
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
              <div key={d} style={{ padding: '0.5rem', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{d}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e${i}`} style={{ minHeight: 88, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.12)' }} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day     = i + 1;
              const dateStr = `${current.year}-${String(current.month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const dayShows = showsByDate[dateStr] || [];
              const isToday    = dateStr === todayStr;
              const isSelected = dateStr === selected;
              return (
                <div
                  key={day}
                  onClick={() => dayShows.length && setSelected(isSelected ? null : dateStr)}
                  style={{
                    minHeight: 88, padding: '0.35rem',
                    borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                    background: isSelected ? 'var(--accent-glow)' : 'transparent',
                    cursor: dayShows.length ? 'pointer' : 'default',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: isToday ? 700 : 400,
                    color: isToday ? 'var(--accent)' : 'var(--text-secondary)',
                    width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '50%', background: isToday ? 'var(--accent-glow)' : 'transparent',
                    marginBottom: '0.2rem',
                  }}>{day}</div>
                  {dayShows.slice(0, 3).map((s: any) => (
                    <div key={s.id} style={{
                      fontSize: '0.72rem', padding: '0.1rem 0.25rem', borderRadius: '2px',
                      background: `${actColorMap[s.act_id] || 'var(--accent)'}25`,
                      color: actColorMap[s.act_id] || 'var(--accent)',
                      fontFamily: 'var(--font-body)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden',
                      textOverflow: 'ellipsis', marginBottom: '0.1rem',
                      borderLeft: `2px solid ${actColorMap[s.act_id] || 'var(--accent)'}`,
                    }}>
                      {s.venue?.name || actName(s.act_id) || 'TBD'}
                    </div>
                  ))}
                  {dayShows.length > 3 && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>+{dayShows.length - 3}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Side panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Selected day */}
          {selected && selectedShows.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title" style={{ fontSize: '0.85rem' }}>
                  {new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
              </div>
              {selectedShows.map((s: any) => (
                <Link key={s.id} href={`/bookings/${s.id}`} style={{ display: 'block', textDecoration: 'none', padding: '0.65rem', background: 'var(--bg-overlay)', borderRadius: 'var(--radius-sm)', marginBottom: '0.5rem', borderLeft: `3px solid ${actColorMap[s.act_id] || 'var(--accent)'}` }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600, color: actColorMap[s.act_id] || 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
                    {actName(s.act_id)}
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{s.venue?.name || 'TBD'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.3rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'var(--font-body)' }}>
                      {s.venue?.city ? `${s.venue.city}, ${s.venue.state}` : ''}
                      {s.set_time ? ` · ${s.set_time}` : ''}
                    </span>
                    <span className={`badge badge-${s.status}`}>{BOOKING_STATUS_LABELS[s.status as keyof typeof BOOKING_STATUS_LABELS]}</span>
                  </div>
                  {s.fee && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent)', marginTop: '0.2rem' }}>${Number(s.fee).toLocaleString()}</div>}
                </Link>
              ))}
            </div>
          )}

          {/* Upcoming */}
          <div className="card">
            <div className="card-header"><span className="card-title">UPCOMING</span></div>
            {loading && <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>Loading...</div>}
            {!loading && upcoming.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>No upcoming shows.</div>
            )}
            {upcoming.map((s: any) => (
              <Link key={s.id} href={`/bookings/${s.id}`} style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', padding: '0.45rem 0', borderBottom: '1px solid var(--border)', textDecoration: 'none' }}>
                <div style={{ minWidth: 32, textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: actColorMap[s.act_id] || 'var(--accent)', lineHeight: 1 }}>
                    {new Date(s.show_date + 'T12:00:00').getDate()}
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {new Date(s.show_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
                  </div>
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600, color: actColorMap[s.act_id] || 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{actName(s.act_id)}</div>
                  <div style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.venue?.name || 'TBD'}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-body)' }}>{s.venue?.city || ''}</div>
                </div>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[s.status] || '#64748b', flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
