import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { getActId, getBandBookings } from '../lib/bookingQueries';
import { BOOKING_STATUS_LABELS } from '../lib/types';
import { STATUS_COLORS } from '../lib/statusSync';
import { buildIcal, downloadIcal } from '../lib/ical';
import Link from 'next/link';

type ViewMode = 'month' | 'week' | 'list';

const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const ACT_COLORS = [
  '#E07820','#BF5FFF','#FF3CAC','#34d399','#60a5fa','#f97316','#e879f9','#22d3ee',
];

const STATUS_LEGEND: [string, string][] = [
  ['#34d399', 'Confirmed'],
  ['#60a5fa', 'Advancing'],
  ['#fbbf24', 'Negotiation'],
  ['#a78bfa', 'Contract'],
  ['#f97316', 'Hold'],
  ['#94a3b8', 'Pitch'],
  ['#6b7280', 'Completed'],
];

export default function AgentCalendar() {
  const router = useRouter();
  const [shows, setShows]         = useState<any[]>([]);
  const [acts, setActs]           = useState<any[]>([]);
  const [venueList, setVenueList] = useState<any[]>([]);
  const [actId, setActId]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [today]     = useState(new Date());
  const [current, setCurrent]     = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected]   = useState<string | null>(null);
  const [filterAct, setFilterAct] = useState<string>('all');
  const [view, setView]           = useState<ViewMode>('month');

  const [addDate, setAddDate]     = useState<string | null>(null);
  const [quickForm, setQuickForm] = useState({ venue_id: '', status: 'pitch', set_time: '', fee: '', notes: '' });
  const [saving, setSaving]       = useState(false);
  const [saveErr, setSaveErr]     = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return;
      const aid = await getActId(supabase, user.id);
      if (!aid) return;
      setActId(aid);
      const [data, actRes, venueRes] = await Promise.all([
        getBandBookings(supabase, aid),
        supabase.from('acts').select('id, act_name').eq('id', aid).single(),
        supabase.from('venues').select('id, name, city, state').order('name').limit(300),
      ]);
      if (actRes.data) setActs([actRes.data]);
      setShows(data.filter((b: any) => b.status !== 'cancelled' && b.show_date));
      setVenueList(venueRes.data || []);
    } catch (err) {
      console.error('calendar load:', err);
    } finally {
      setLoading(false);
    }
  };

  const prevPeriod = () => {
    if (view === 'week') { setWeekOffset(w => w - 1); return; }
    setCurrent(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 });
  };
  const nextPeriod = () => {
    if (view === 'week') { setWeekOffset(w => w + 1); return; }
    setCurrent(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 });
  };

  const actColorMap = Object.fromEntries(acts.map((a, i) => [a.id, ACT_COLORS[i % ACT_COLORS.length]]));
  const filtered    = filterAct === 'all' ? shows : shows.filter(s => s.act_id === filterAct);
  const showsByDate = filtered.reduce((acc: Record<string, any[]>, s) => {
    const d = s.show_date?.substring(0, 10);
    if (d) { acc[d] = acc[d] || []; acc[d].push(s); }
    return acc;
  }, {});

  const todayStr     = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const selectedShows = selected ? (showsByDate[selected] || []) : [];
  const upcoming     = filtered.filter(s => s.show_date >= todayStr).sort((a, b) => a.show_date < b.show_date ? -1 : 1).slice(0, 12);
  const actName      = (id: string) => acts.find(a => a.id === id)?.act_name || '';
  const tileColor    = (status: string) => STATUS_COLORS[status] || '#64748b';

  const getWeekDays = () => {
    const base = new Date(today);
    base.setDate(base.getDate() - base.getDay() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  };

  const openAddModal = (dateStr: string) => {
    setAddDate(dateStr);
    setQuickForm({ venue_id: '', status: 'pitch', set_time: '', fee: '', notes: '' });
    setSaveErr('');
    setSelected(null);
  };

  const saveShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actId) return;
    setSaveErr('');
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      const { data, error } = await supabase.from('bookings').insert({
        act_id:     actId,
        created_by: user!.id,
        show_date:  addDate,
        venue_id:   quickForm.venue_id  || null,
        status:     quickForm.status,
        set_time:   quickForm.set_time  || null,
        agreed_amount: quickForm.fee ? Number(quickForm.fee) : null,
        notes:      quickForm.notes     || null,
      }).select().single();
      if (error) throw error;
      setAddDate(null);
      await load();
      if (data) router.push(`/bookings/${data.id}`);
    } catch (err: any) {
      setSaveErr(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell requireRole="band_admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Calendar</h1>
          <div className="page-sub">{filtered.length} shows scheduled</div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {(['month', 'week', 'list'] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  padding: '0.4rem 1rem', border: 'none', cursor: 'pointer',
                  background: view === v ? 'var(--accent)' : 'transparent',
                  color: view === v ? '#000' : 'var(--text-muted)',
                  transition: 'background 0.15s',
                }}
              >{v}</button>
            ))}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => downloadIcal(buildIcal(filtered, 'Camel Ranch Shows', actName), 'camel-ranch-shows.ics')}
            title="Export to Google/Apple/Outlook Calendar"
          >↓ Export</button>
          <button className="btn btn-primary" onClick={() => openAddModal(todayStr)}>+ Add Show</button>
        </div>
      </div>

      {/* Act filter */}
      {acts.length > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {[{ id: 'all', act_name: 'All Acts' }, ...acts].map((a: any) => (
            <button
              key={a.id}
              onClick={() => setFilterAct(a.id)}
              style={{
                fontFamily: 'var(--font-body)', fontSize: '0.84rem', fontWeight: 600,
                letterSpacing: '0.04em', textTransform: 'uppercase', padding: '0.3rem 0.75rem',
                border: `1px solid ${filterAct === a.id ? (a.id === 'all' ? 'var(--accent)' : actColorMap[a.id]) : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: filterAct === a.id ? (a.id === 'all' ? 'var(--accent-glow)' : `${actColorMap[a.id]}18`) : 'transparent',
                color: filterAct === a.id ? (a.id === 'all' ? 'var(--accent)' : actColorMap[a.id]) : 'var(--text-muted)',
              }}
            >{a.act_name}</button>
          ))}
        </div>
      )}

      {/* Status legend */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center', padding: '0.6rem 1rem', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
        {STATUS_LEGEND.map(([color, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}88` }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <div className="card">
          <div className="card-header"><span className="card-title">ALL SHOWS</span></div>
          {loading && <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>Loading...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>No shows found.</div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Venue</th><th>Location</th><th>Status</th><th>Fee</th><th></th>
                </tr>
              </thead>
              <tbody>
                {[...filtered].sort((a, b) => a.show_date < b.show_date ? -1 : 1).map(s => (
                  <tr key={s.id} style={{ opacity: s.show_date < todayStr ? 0.55 : 1 }}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {new Date(s.show_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td style={{ fontWeight: 700 }}>{s.venue?.name || 'TBD'}</td>
                    <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {s.venue?.city ? `${s.venue.city}, ${s.venue.state}` : '—'}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block', background: tileColor(s.status),
                        color: '#fff', borderRadius: 4, padding: '0.2rem 0.55rem',
                        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                        boxShadow: `0 1px 4px ${tileColor(s.status)}66`,
                      }}>
                        {BOOKING_STATUS_LABELS[s.status as keyof typeof BOOKING_STATUS_LABELS] || s.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 700 }}>
                      {(s.agreed_amount ?? s.fee) ? `$${Number(s.agreed_amount ?? s.fee).toLocaleString()}` : '—'}
                    </td>
                    <td><Link href={`/bookings/${s.id}`} style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>View →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MONTH VIEW ── */}
      {view === 'month' && (
        <div className="calendar-layout">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Month nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <button
                className="btn btn-ghost"
                onClick={prevPeriod}
                style={{ fontSize: '1.1rem', padding: '0.4rem 0.9rem', fontWeight: 700 }}
              >←</button>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', letterSpacing: '0.06em', color: 'var(--text-primary)', userSelect: 'none' }}>
                {MONTHS[current.month]} {current.year}
              </div>
              <button
                className="btn btn-ghost"
                onClick={nextPeriod}
                style={{ fontSize: '1.1rem', padding: '0.4rem 0.9rem', fontWeight: 700 }}
              >→</button>
            </div>

            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', background: 'var(--bg-overlay)' }}>
              {DAYS.map(d => (
                <div key={d} style={{
                  padding: '0.6rem 0.4rem', textAlign: 'center',
                  fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--text-secondary)',
                }}>{d}</div>
              ))}
            </div>

            {/* Day grid */}
            {(() => {
              const firstDay    = new Date(current.year, current.month, 1).getDay();
              const daysInMonth = new Date(current.year, current.month + 1, 0).getDate();
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {Array.from({ length: firstDay }).map((_, i) => (
                    <div key={`e${i}`} style={{
                      minHeight: 130,
                      borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                      background: 'rgba(0,0,0,0.25)',
                    }} />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day      = i + 1;
                    const dateStr  = `${current.year}-${String(current.month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                    const dayShows = showsByDate[dateStr] || [];
                    const isToday    = dateStr === todayStr;
                    const isSelected = dateStr === selected;
                    return (
                      <div
                        key={day}
                        onClick={() => {
                          if (dayShows.length) {
                            setSelected(isSelected ? null : dateStr);
                          } else {
                            openAddModal(dateStr);
                          }
                        }}
                        style={{
                          minHeight: 130,
                          padding: '0.45rem 0.4rem',
                          borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                          background: isSelected ? 'rgba(224,120,32,0.18)' : 'transparent',
                          cursor: 'pointer',
                          transition: 'background 0.12s',
                          display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                          overflow: 'hidden', minWidth: 0,
                        }}
                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(224,120,32,0.06)'; }}
                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                      >
                        {/* Date number */}
                        <div style={{
                          fontFamily: 'var(--font-body)', fontSize: '1rem', fontWeight: isToday ? 900 : 600,
                          color: isToday ? '#000' : isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: '50%',
                          background: isToday ? 'var(--accent)' : 'transparent',
                          marginBottom: '0.3rem', flexShrink: 0,
                        }}>{day}</div>

                        {/* Event tiles */}
                        {dayShows.slice(0, 3).map((s: any) => (
                          <div key={s.id} style={{
                            fontSize: '0.78rem', padding: '0.3rem 0.45rem',
                            borderRadius: 5, marginBottom: '0.2rem',
                            background: tileColor(s.status),
                            color: '#fff', fontWeight: 700,
                            fontFamily: 'var(--font-body)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            width: '100%', minWidth: 0, boxSizing: 'border-box',
                            boxShadow: `0 2px 4px rgba(0,0,0,0.35)`,
                            letterSpacing: '0.01em',
                          }}>
                            {s.venue?.name || actName(s.act_id) || 'TBD'}
                          </div>
                        ))}
                        {dayShows.length > 3 && (
                          <div style={{
                            fontSize: '0.74rem', color: 'var(--accent)', fontFamily: 'var(--font-body)',
                            fontWeight: 700, paddingLeft: '0.25rem',
                          }}>
                            +{dayShows.length - 3} more
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Side panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {selected && selectedShows.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title" style={{ fontSize: '0.85rem' }}>
                    {new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>✕</button>
                </div>
                {selectedShows.map((s: any) => (
                  <Link key={s.id} href={`/bookings/${s.id}`} style={{
                    display: 'block', textDecoration: 'none',
                    padding: '0.75rem 0.85rem',
                    background: 'var(--bg-overlay)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '0.5rem',
                    borderLeft: `4px solid ${tileColor(s.status)}`,
                    transition: 'background 0.12s',
                  }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.92rem' }}>{s.venue?.name || 'TBD'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.35rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'var(--font-body)' }}>
                        {s.venue?.city ? `${s.venue.city}, ${s.venue.state}` : ''}
                        {s.set_time ? ` · ${s.set_time}` : ''}
                      </span>
                      <span style={{
                        background: tileColor(s.status), color: '#fff',
                        borderRadius: 4, padding: '0.12rem 0.45rem',
                        fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                        boxShadow: `0 1px 4px ${tileColor(s.status)}66`,
                      }}>
                        {BOOKING_STATUS_LABELS[s.status as keyof typeof BOOKING_STATUS_LABELS] || s.status}
                      </span>
                    </div>
                    {(s.agreed_amount ?? s.fee) != null && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent)', marginTop: '0.25rem' }}>${Number(s.agreed_amount ?? s.fee).toLocaleString()}</div>}
                  </Link>
                ))}
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: '0.25rem', fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 700 }}
                  onClick={() => openAddModal(selected)}
                >+ Add show on this date</button>
              </div>
            )}

            <div className="card">
              <div className="card-header"><span className="card-title">UPCOMING</span></div>
              {loading && <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading...</div>}
              {!loading && upcoming.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No upcoming shows.</div>}
              {upcoming.map((s: any) => (
                <Link key={s.id} href={`/bookings/${s.id}`} style={{
                  display: 'flex', gap: '0.75rem', alignItems: 'center',
                  padding: '0.6rem 0', borderBottom: '1px solid var(--border)',
                  textDecoration: 'none',
                  borderLeft: `3px solid ${tileColor(s.status)}`,
                  paddingLeft: '0.65rem', marginLeft: '-0.75rem',
                  transition: 'background 0.1s',
                }}>
                  <div style={{ minWidth: 36, textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: tileColor(s.status), lineHeight: 1, fontWeight: 700 }}>
                      {new Date(s.show_date + 'T12:00:00').getDate()}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {new Date(s.show_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.venue?.name || 'TBD'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'var(--font-body)', marginTop: '0.1rem' }}>{s.venue?.city || ''}</div>
                  </div>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: tileColor(s.status), flexShrink: 0, boxShadow: `0 0 6px ${tileColor(s.status)}88` }} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── WEEK VIEW ── */}
      {view === 'week' && (() => {
        const weekDays  = getWeekDays();
        const weekLabel = `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        return (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" onClick={prevPeriod} style={{ fontSize: '1.1rem', padding: '0.4rem 0.9rem', fontWeight: 700 }}>←</button>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', letterSpacing: '0.06em', color: 'var(--text-primary)', userSelect: 'none' }}>{weekLabel}</div>
              <button className="btn btn-ghost" onClick={nextPeriod} style={{ fontSize: '1.1rem', padding: '0.4rem 0.9rem', fontWeight: 700 }}>→</button>
            </div>

            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', background: 'var(--bg-overlay)' }}>
              {weekDays.map((d, i) => {
                const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                const isToday = dateStr === todayStr;
                return (
                  <div key={i} style={{
                    padding: '0.85rem 0.4rem',
                    borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
                      {DAYS[d.getDay()]}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontSize: '1.6rem', lineHeight: 1.2, fontWeight: 700,
                      color: isToday ? '#000' : 'var(--text-primary)', marginTop: '0.2rem',
                      width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%', background: isToday ? 'var(--accent)' : 'transparent',
                      margin: '0.2rem auto 0',
                    }}>
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Day content */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: 200 }}>
              {weekDays.map((d, i) => {
                const dateStr  = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                const dayShows = showsByDate[dateStr] || [];
                return (
                  <div
                    key={i}
                    onClick={() => { if (!dayShows.length) openAddModal(dateStr); }}
                    style={{
                      borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                      padding: '0.5rem 0.4rem', cursor: dayShows.length ? 'default' : 'pointer',
                      minHeight: 160, display: 'flex', flexDirection: 'column',
                      overflow: 'hidden', minWidth: 0,
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { if (!dayShows.length) (e.currentTarget as HTMLDivElement).style.background = 'rgba(224,120,32,0.05)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                  >
                    {dayShows.map((s: any) => (
                      <Link key={s.id} href={`/bookings/${s.id}`}
                        style={{ display: 'block', textDecoration: 'none', marginBottom: '0.3rem', minWidth: 0 }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{
                          background: tileColor(s.status), color: '#fff',
                          fontWeight: 700, fontSize: '0.78rem',
                          padding: '0.3rem 0.45rem', borderRadius: 5,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          width: '100%', boxSizing: 'border-box',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.35)',
                        }}>
                          {s.venue?.name || 'TBD'}
                        </div>
                        {s.set_time && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem', paddingLeft: '0.15rem' }}>
                            {s.set_time}
                          </div>
                        )}
                      </Link>
                    ))}
                    {dayShows.length === 0 && (
                      <div style={{ color: 'rgba(224,120,32,0.2)', fontSize: '1.4rem', textAlign: 'center', marginTop: '1rem', lineHeight: 1, userSelect: 'none', fontWeight: 700 }}>+</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── QUICK ADD MODAL ── */}
      {addDate && (
        <div className="modal-backdrop" onClick={() => setAddDate(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">ADD SHOW</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddDate(null)}>✕</button>
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.92rem', color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '1.25rem', fontWeight: 700 }}>
              {new Date(addDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
            <form onSubmit={saveShow} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="field">
                <label className="field-label">Venue</label>
                <select className="select" value={quickForm.venue_id} onChange={e => setQuickForm(f => ({ ...f, venue_id: e.target.value }))}>
                  <option value="">No venue / TBD</option>
                  {venueList.map(v => (
                    <option key={v.id} value={v.id}>{v.name} — {v.city}, {v.state}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Status</label>
                <select className="select" value={quickForm.status} onChange={e => setQuickForm(f => ({ ...f, status: e.target.value }))}>
                  {(Object.entries(BOOKING_STATUS_LABELS) as [string, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label className="field-label">Set Time</label>
                  <input className="input" type="time" value={quickForm.set_time} onChange={e => setQuickForm(f => ({ ...f, set_time: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label">Fee ($)</label>
                  <input className="input" type="number" min="0" step="0.01" placeholder="0" value={quickForm.fee} onChange={e => setQuickForm(f => ({ ...f, fee: e.target.value }))} />
                </div>
              </div>
              <div className="field">
                <label className="field-label">Notes</label>
                <input className="input" value={quickForm.notes} onChange={e => setQuickForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional..." />
              </div>
              {saveErr && <div style={{ color: '#f87171', fontSize: '0.82rem', fontFamily: 'var(--font-body)' }}>{saveErr}</div>}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setAddDate(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Create & Open'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
