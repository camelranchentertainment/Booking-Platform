'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Booking {
  id: string;
  date: string;
  venue_name: string;
  venue_city: string;
  venue_state: string;
  venue_address?: string;
  venue_phone?: string;
  campaign_name?: string;
  status: string;
  type: 'booking' | 'calendar_event';
  source?: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  date: string;
  start_time?: string;
  end_time?: string;
  source: string;
  type: 'calendar_event';
}

interface ExpandedMonth { year: number; monthIndex: number; }

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DOW_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

// ─── Main component ───────────────────────────────────────────────────────────
export default function BookingCalendar() {
  const [year, setYear]                     = useState(new Date().getFullYear());
  const [bookings, setBookings]             = useState<Booking[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading]               = useState(true);
  const [syncStatus, setSyncStatus]         = useState('');
  const [user, setUser]                     = useState<{ id: string; email: string; token?: string } | null>(null);
  const [expandedMonth, setExpandedMonth]   = useState<ExpandedMonth | null>(null);

  useEffect(() => {
    const local = localStorage.getItem('loggedInUser');
    if (local) setUser(JSON.parse(local));
  }, []);

  useEffect(() => {
    if (user) {
      setLoading(true);
      Promise.all([loadBookings(), syncGoogle()]).finally(() => setLoading(false));
    }
  }, [year, user]);

  // ── Data ─────────────────────────────────────────────────────────────────
  const loadBookings = async () => {
    try {
      const { data } = await supabase
        .from('campaign_venues')
        .select(`id, status, booking_date,
          campaign:campaigns(id, name),
          venue:venues(id, name, city, state, address, phone)`)
        .eq('status', 'booked')
        .gte('booking_date', `${year}-01-01`)
        .lte('booking_date', `${year}-12-31`)
        .not('booking_date', 'is', null);

      setBookings((data || []).map((cv: {
        id: string; booking_date: string; status: string;
        venue?: { name?: string; city?: string; state?: string; address?: string; phone?: string } | { name?: string; city?: string; state?: string; address?: string; phone?: string }[];
        campaign?: { name?: string } | { name?: string }[];
      }) => {
        const venue = Array.isArray(cv.venue) ? cv.venue[0] : cv.venue;
        const campaign = Array.isArray(cv.campaign) ? cv.campaign[0] : cv.campaign;
        return {
          id:            cv.id,
          date:          cv.booking_date,
          venue_name:    venue?.name    || 'Unknown Venue',
          venue_city:    venue?.city    || '',
          venue_state:   venue?.state   || '',
          venue_address: venue?.address,
          venue_phone:   venue?.phone,
          campaign_name: campaign?.name,
          status:        cv.status,
          type:          'booking' as const,
        };
      }));
    } catch (err) { console.error(err); }
  };

  const syncGoogle = async () => {
    if (!user) return;
    try {
      setSyncStatus('Syncing…');
      const headers: Record<string, string> = {};
      if (user.token) headers['Authorization'] = `Bearer ${user.token}`;
      const res = await fetch(`/api/calendar/sync?userId=${user.id}&year=${year}`, { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setSyncStatus(`Sync error: ${errData.error ?? res.status}`);
        console.error('[BookingCalendar] syncGoogle failed:', res.status, errData);
        return;
      }
      const data = await res.json();
      console.log('[BookingCalendar] syncGoogle response:', data);
      if (data.message) console.log('[BookingCalendar] sync message:', data.message);
      if (data.events?.length) {
        setCalendarEvents(data.events);
        setSyncStatus(`✓ ${data.events.length} calendar events`);
        setTimeout(() => setSyncStatus(''), 3000);
      } else {
        setSyncStatus(data.message ? `Calendar: ${data.message}` : '0 events');
        setTimeout(() => setSyncStatus(''), 4000);
      }
    } catch (err) {
      console.error('[BookingCalendar] syncGoogle exception:', err);
      setSyncStatus('Sync failed');
      setTimeout(() => setSyncStatus(''), 4000);
    }
  };

  const getEventsForDate = (dateStr: string): Booking[] => [
    ...bookings.filter(b => b.date === dateStr),
    ...calendarEvents
      .filter(e => e.date === dateStr)
      .map(e => ({
        id:            e.id,
        date:          e.date,
        venue_name:    e.title,
        venue_city:    '',
        venue_state:   '',
        venue_address: e.location,
        venue_phone:   '',
        campaign_name: e.description,
        status:        'calendar_event',
        type:          'calendar_event' as const,
        source:        e.source,
      })),
  ];

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:400, background:'#030d18', fontFamily:"'Nunito',sans-serif",
      color:'#3d6285', fontSize:15 }}>
      Loading calendar…
    </div>
  );

  const totalShows = bookings.length;

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .cal-wrap {
          background: #030d18; min-height: 100vh;
          padding: 2rem; font-family: 'Nunito', sans-serif;
        }
        /* ── Year grid ── */
        .year-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 18px;
        }
        /* ── Month card ── */
        .month-card {
          background: rgba(9,24,40,0.8);
          border: 1px solid rgba(74,133,200,0.12);
          border-radius: 14px;
          padding: 18px;
          cursor: pointer;
          transition: border-color .18s, box-shadow .18s, transform .18s;
        }
        .month-card:hover {
          border-color: rgba(74,133,200,0.35);
          box-shadow: 0 8px 32px rgba(58,127,193,0.12);
          transform: translateY(-2px);
        }
        /* ── Small day cell (year view) ── */
        .day-cell {
          aspect-ratio: 1;
          display: flex; align-items: center; justify-content: center;
          border-radius: 7px;
          font-family: 'Nunito', sans-serif;
          font-size: 12px; font-weight: 700;
          position: relative;
          transition: transform .15s, box-shadow .15s;
          color: #3d6285;
          background: transparent;
          pointer-events: none;
        }
        .day-cell.has-event { color: #e8f1f8; }
        .day-cell.booked    { background: linear-gradient(135deg,#22c55e,#16a34a); box-shadow: 0 4px 14px rgba(34,197,94,0.35); }
        .day-cell.cal-event { background: linear-gradient(135deg,#3a7fc1,#2563a8); box-shadow: 0 4px 14px rgba(37,99,168,0.35); }
        .day-cell.mixed     { background: linear-gradient(135deg,#a78bfa,#7c3aed); box-shadow: 0 4px 14px rgba(167,139,250,0.35); }
        .day-cell.is-today  { outline: 2px solid #4a85c8; outline-offset: 1px; }
        .day-cell.is-today:not(.booked):not(.cal-event):not(.mixed) { color: #4a85c8; background: rgba(74,133,200,0.1); }
        /* ── Large day cell (expanded modal) ── */
        .day-cell-lg {
          display: flex; align-items: center; justify-content: center;
          border-radius: 9px;
          font-family: 'Nunito', sans-serif;
          font-size: 15px; font-weight: 700;
          position: relative;
          color: #3d6285;
          background: transparent;
          height: 52px;
          transition: transform .14s, box-shadow .14s, filter .14s;
        }
        .day-cell-lg.has-event {
          color: #e8f1f8;
          cursor: pointer;
        }
        .day-cell-lg.has-event:hover {
          transform: scale(1.1);
          filter: brightness(1.15);
          z-index: 2;
        }
        .day-cell-lg.booked    { background: linear-gradient(135deg,#22c55e,#16a34a); box-shadow: 0 4px 18px rgba(34,197,94,0.4); }
        .day-cell-lg.cal-event { background: linear-gradient(135deg,#3a7fc1,#2563a8); box-shadow: 0 4px 18px rgba(37,99,168,0.4); }
        .day-cell-lg.mixed     { background: linear-gradient(135deg,#a78bfa,#7c3aed); box-shadow: 0 4px 18px rgba(167,139,250,0.4); }
        .day-cell-lg.is-today  { outline: 2px solid #4a85c8; outline-offset: 2px; }
        .day-cell-lg.is-today:not(.booked):not(.cal-event):not(.mixed) { color: #4a85c8; background: rgba(74,133,200,0.12); }
        .day-cell-lg.selected  { outline: 2px solid #e8f1f8; outline-offset: 2px; }
        /* ── Btn nav ── */
        .cal-btn {
          background: rgba(9,24,40,0.9);
          border: 1px solid rgba(74,133,200,0.22);
          border-radius: 9px; padding: 9px 20px;
          color: #6baed6; font-family: 'Nunito', sans-serif;
          font-size: 14px; font-weight: 800; cursor: pointer;
          transition: background .15s, border-color .15s;
        }
        .cal-btn:hover { background: rgba(74,133,200,0.12); border-color: rgba(74,133,200,0.4); }
        /* ── Legend dot ── */
        .legend-dot { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
        /* ── Expanded month modal ── */
        .month-modal-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(3,13,24,0.9); backdrop-filter: blur(14px);
          display: flex; align-items: center; justify-content: center; padding: 1rem;
        }
        .month-modal {
          background: #07111e;
          border: 1px solid rgba(74,133,200,0.22);
          border-radius: 20px;
          width: 100%; max-width: 860px;
          max-height: 92vh; overflow-y: auto;
          box-shadow: 0 32px 100px rgba(0,0,0,0.7);
          display: flex; flex-direction: column;
        }
        .month-modal-header {
          padding: 1.5rem 1.75rem 1rem;
          border-bottom: 1px solid rgba(74,133,200,0.1);
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          position: sticky; top: 0; background: #07111e; border-radius: 20px 20px 0 0; z-index: 10;
        }
        .month-modal-body { padding: 1.5rem 1.75rem; flex: 1; }
        .week-row {
          display: grid; grid-template-columns: repeat(7,1fr); gap: 6px;
          padding: 4px 0;
          border-bottom: 1px solid rgba(74,133,200,0.06);
        }
        .week-row:last-child { border-bottom: none; }
        /* ── Day detail panel ── */
        .day-detail-panel {
          margin-top: 1.5rem;
          background: rgba(9,24,40,0.6);
          border: 1px solid rgba(74,133,200,0.18);
          border-radius: 14px;
          overflow: hidden;
          animation: slideUp .18s ease;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .event-row {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(74,133,200,0.08);
          transition: background .15s;
        }
        .event-row:last-child { border-bottom: none; }
        .event-row:hover { background: rgba(74,133,200,0.04); }
        @media (max-width: 1023px) {
          .cal-wrap { padding: 1.25rem; }
          .year-grid { grid-template-columns: repeat(3,1fr); gap: 14px; }
        }
        @media (max-width: 767px) {
          .cal-wrap { padding: 1rem; }
          .year-grid { grid-template-columns: repeat(2,1fr); gap: 12px; }
          .month-modal { max-width: 100%; border-radius: 16px; }
          .month-modal-header { padding: 1rem; }
          .month-modal-body { padding: 1rem; }
          .day-cell-lg { height: 44px; font-size: 13px; }
          .cal-btn { padding: 10px 14px; font-size: 13px; min-height: 44px; }
          .cal-year-nav { flex-wrap: wrap; gap: 8px; }
        }
        @media (max-width: 480px) {
          .year-grid { grid-template-columns: 1fr; }
          .day-cell-lg { height: 38px; font-size: 12px; }
        }
      `}</style>

      <div className="cal-wrap">
        <div style={{ maxWidth: 1600, margin: '0 auto' }}>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div style={{ marginBottom:'1.75rem',
            display:'flex', alignItems:'flex-start',
            justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
            <div>
              <h1 style={{ fontFamily:"'Bebas Neue',cursive", fontWeight:400,
                fontSize:'clamp(1.8rem,3vw,2.4rem)', letterSpacing:'0.06em',
                color:'#ffffff', margin:0, lineHeight:1 }}>Band Calendar</h1>
              <p style={{ color:'#3d6285', margin:'5px 0 0', fontSize:13, fontWeight:600 }}>
                {totalShows} confirmed show{totalShows !== 1 ? 's' : ''} in {year}
                {syncStatus && <span style={{ marginLeft:12, color:'#22c55e' }}>{syncStatus}</span>}
              </p>
            </div>
            <div className="cal-year-nav" style={{ display:'flex', alignItems:'center', gap:10 }}>
              <button className="cal-btn" onClick={() => setYear(y => y - 1)}>← {year - 1}</button>
              <div style={{ background:'rgba(9,24,40,0.9)',
                border:'1px solid rgba(74,133,200,0.22)', borderRadius:9,
                padding:'9px 22px', fontFamily:"'Bebas Neue',cursive",
                fontSize:'1.3rem', letterSpacing:'0.08em', color:'#e8f1f8' }}>
                {year}
              </div>
              <button className="cal-btn" onClick={() => setYear(y => y + 1)}>{year + 1} →</button>
            </div>
          </div>

          {/* ── Legend ──────────────────────────────────────────────────── */}
          <div style={{ display:'flex', gap:20, marginBottom:'1.5rem',
            flexWrap:'wrap', alignItems:'center',
            padding:'10px 16px', background:'rgba(9,24,40,0.6)',
            border:'1px solid rgba(74,133,200,0.1)', borderRadius:10 }}>
            {[
              { cls:'booked',    label:'Confirmed Booking', color:'linear-gradient(135deg,#22c55e,#16a34a)' },
              { cls:'cal-event', label:'Calendar Event',    color:'linear-gradient(135deg,#3a7fc1,#2563a8)' },
              { cls:'mixed',     label:'Multiple Events',   color:'linear-gradient(135deg,#a78bfa,#7c3aed)' },
            ].map(l => (
              <div key={l.cls} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div className="legend-dot" style={{ background:l.color }} />
                <span style={{ color:'#7aa5c4', fontSize:13, fontWeight:600 }}>{l.label}</span>
              </div>
            ))}
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:12, height:12, borderRadius:3,
                border:'2px solid #4a85c8', background:'rgba(74,133,200,0.1)' }} />
              <span style={{ color:'#7aa5c4', fontSize:13, fontWeight:600 }}>Today</span>
            </div>
            <div style={{ marginLeft:'auto', color:'#3d6285', fontSize:12, fontWeight:600 }}>
              Click any month to expand ↗
            </div>
          </div>

          {/* ── 12-month year grid ───────────────────────────────────────── */}
          <div className="year-grid">
            {MONTHS.map((name, idx) => (
              <MonthCard
                key={idx}
                year={year}
                monthIndex={idx}
                monthName={name}
                bookings={bookings}
                calendarEvents={calendarEvents}
                onExpand={() => setExpandedMonth({ year, monthIndex: idx })}
              />
            ))}
          </div>

        </div>
      </div>

      {/* ── Expanded Month Modal ─────────────────────────────────────────── */}
      {expandedMonth && (
        <ExpandedMonthModal
          initialYear={expandedMonth.year}
          initialMonthIndex={expandedMonth.monthIndex}
          bookings={bookings}
          calendarEvents={calendarEvents}
          getEventsForDate={getEventsForDate}
          onClose={() => setExpandedMonth(null)}
        />
      )}
    </>
  );
}

// ─── Small month card (year view) ─────────────────────────────────────────────
function MonthCard({ year, monthIndex, monthName, bookings, calendarEvents, onExpand }: {
  year: number; monthIndex: number; monthName: string;
  bookings: Booking[]; calendarEvents: CalendarEvent[];
  onExpand: () => void;
}) {
  const firstDay    = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const today       = new Date();
  const isCurMonth  = today.getMonth() === monthIndex && today.getFullYear() === year;

  const monthBookings = bookings.filter(b => {
    const d = new Date(b.date + 'T00:00:00');
    return d.getMonth() === monthIndex && d.getFullYear() === year;
  }).length;

  const cells: React.ReactElement[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} />);

  for (let day = 1; day <= daysInMonth; day++) {
    const ds      = `${year}-${String(monthIndex+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const hasBook = bookings.some(b => b.date === ds);
    const hasEvt  = calendarEvents.some(e => e.date === ds);
    const hasBoth = hasBook && hasEvt;
    const isToday = isCurMonth && today.getDate() === day;
    const total   = bookings.filter(b=>b.date===ds).length + calendarEvents.filter(e=>e.date===ds).length;

    let cls = 'day-cell';
    if (hasBoth)      cls += ' mixed has-event';
    else if (hasBook) cls += ' booked has-event';
    else if (hasEvt)  cls += ' cal-event has-event';
    if (isToday)      cls += ' is-today';

    cells.push(
      <div key={day} className={cls} title={total > 0 ? `${total} event${total!==1?'s':''}` : undefined}>
        {day}
        {total > 1 && (
          <div style={{ position:'absolute', top:2, right:2,
            background:'rgba(3,13,24,0.7)', color:'#e8f1f8', borderRadius:'50%',
            width:14, height:14, display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:9, fontWeight:800, lineHeight:1 }}>
            {total}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="month-card" onClick={onExpand} role="button" aria-label={`Expand ${monthName}`}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontFamily:"'Nunito',sans-serif", fontWeight:800,
          fontSize:14, color:'#ffffff', letterSpacing:'0.02em' }}>
          {monthName}
        </div>
        {monthBookings > 0 ? (
          <span style={{ background:'rgba(34,197,94,0.12)',
            border:'1px solid rgba(34,197,94,0.28)', borderRadius:99,
            padding:'2px 9px', color:'#22c55e', fontSize:11, fontWeight:700 }}>
            {monthBookings} show{monthBookings!==1?'s':''}
          </span>
        ) : (
          <span style={{ color:'rgba(74,133,200,0.3)', fontSize:11 }}>↗</span>
        )}
      </div>

      {/* Day-of-week headers */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3, marginBottom:4 }}>
        {['S','M','T','W','T','F','S'].map((d,i) => (
          <div key={i} style={{ textAlign:'center', color:'#3d6285',
            fontSize:10, fontWeight:800, padding:'2px 0',
            textTransform:'uppercase', letterSpacing:'0.05em' }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>
        {cells}
      </div>
    </div>
  );
}

// ─── Expanded month modal ─────────────────────────────────────────────────────
function ExpandedMonthModal({ initialYear, initialMonthIndex, bookings, calendarEvents, getEventsForDate, onClose }: {
  initialYear: number; initialMonthIndex: number;
  bookings: Booking[]; calendarEvents: CalendarEvent[];
  getEventsForDate: (date: string) => Booking[];
  onClose: () => void;
}) {
  const [viewYear, setViewYear]       = useState(initialYear);
  const [viewMonth, setViewMonth]     = useState(initialMonthIndex);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const goToPrev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null);
  };
  const goToNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null);
  };

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const today       = new Date();
  const isCurMonth  = today.getMonth() === viewMonth && today.getFullYear() === viewYear;

  // Build weeks (arrays of 7 day slots)
  const slots: Array<{ day: number | null; ds: string | null }> = [];
  for (let i = 0; i < firstDay; i++) slots.push({ day: null, ds: null });
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    slots.push({ day, ds });
  }
  // Pad to complete last week
  while (slots.length % 7 !== 0) slots.push({ day: null, ds: null });

  const weeks: Array<typeof slots> = [];
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i+7));

  const selectedEvents = selectedDay ? getEventsForDate(selectedDay) : [];

  const monthBookings = bookings.filter(b => {
    const d = new Date(b.date + 'T00:00:00');
    return d.getMonth() === viewMonth && d.getFullYear() === viewYear;
  }).length;

  return (
    <div className="month-modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="month-modal">

        {/* ── Modal Header ─────────────────────────────────────────────── */}
        <div className="month-modal-header">
          <button className="cal-btn" onClick={goToPrev} style={{ padding:'8px 16px', fontSize:13 }}>
            ← {MONTHS[(viewMonth + 11) % 12].slice(0,3)}
          </button>

          <div style={{ textAlign:'center', flex:1 }}>
            <div style={{ fontFamily:"'Bebas Neue',cursive", fontWeight:400,
              fontSize:'clamp(1.6rem,3vw,2.2rem)', letterSpacing:'0.08em',
              color:'#ffffff', lineHeight:1 }}>
              {MONTHS[viewMonth]} {viewYear}
            </div>
            {monthBookings > 0 && (
              <div style={{ color:'#22c55e', fontSize:12, fontWeight:700, marginTop:4 }}>
                {monthBookings} confirmed show{monthBookings !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button className="cal-btn" onClick={goToNext} style={{ padding:'8px 16px', fontSize:13 }}>
              {MONTHS[(viewMonth + 1) % 12].slice(0,3)} →
            </button>
            <button onClick={onClose}
              style={{ background:'rgba(255,255,255,0.04)',
                border:'1px solid rgba(74,133,200,0.2)',
                borderRadius:8, width:36, height:36,
                color:'#7aa5c4', fontSize:18, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                transition:'background .15s, color .15s' }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(248,113,113,0.12)'; e.currentTarget.style.color='#f87171'; }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.04)'; e.currentTarget.style.color='#7aa5c4'; }}>
              ✕
            </button>
          </div>
        </div>

        {/* ── Modal Body ───────────────────────────────────────────────── */}
        <div className="month-modal-body">

          {/* Day-of-week headers */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6, marginBottom:8 }}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
              <div key={i} style={{ textAlign:'center', color:'#3d6285',
                fontSize:11, fontWeight:800,
                textTransform:'uppercase', letterSpacing:'0.07em', padding:'4px 0' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {weeks.map((week, wi) => (
              <div key={wi} className="week-row">
                {week.map((slot, si) => {
                  if (!slot.day || !slot.ds) {
                    return <div key={si} />;
                  }
                  const ds      = slot.ds;
                  const hasBook = bookings.some(b => b.date === ds);
                  const hasEvt  = calendarEvents.some(e => e.date === ds);
                  const hasBoth = hasBook && hasEvt;
                  const isToday = isCurMonth && today.getDate() === slot.day;
                  const total   = bookings.filter(b=>b.date===ds).length + calendarEvents.filter(e=>e.date===ds).length;
                  const isSel   = selectedDay === ds;

                  let cls = 'day-cell-lg';
                  if (hasBoth)      cls += ' mixed has-event';
                  else if (hasBook) cls += ' booked has-event';
                  else if (hasEvt)  cls += ' cal-event has-event';
                  if (isToday)      cls += ' is-today';
                  if (isSel)        cls += ' selected';

                  return (
                    <div key={si} className={cls}
                      onClick={() => total > 0 && setSelectedDay(isSel ? null : ds)}
                      title={total > 0 ? `${total} event${total!==1?'s':''} — click to view` : DOW_FULL[si]}>
                      {slot.day}
                      {total > 1 && (
                        <div style={{ position:'absolute', top:3, right:3,
                          background:'rgba(3,13,24,0.75)', color:'#e8f1f8',
                          borderRadius:'50%', width:16, height:16,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:9, fontWeight:800, lineHeight:1 }}>
                          {total}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* ── Day Detail Panel ─────────────────────────────────────── */}
          {selectedDay && selectedEvents.length > 0 && (
            <div className="day-detail-panel">
              {/* Panel header */}
              <div style={{ padding:'14px 20px 12px',
                borderBottom:'1px solid rgba(74,133,200,0.12)',
                display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontFamily:"'Bebas Neue',cursive", fontSize:'1.2rem',
                    letterSpacing:'0.05em', color:'#ffffff', lineHeight:1 }}>
                    {fmtDate(selectedDay)}
                  </div>
                  <div style={{ color:'#3d6285', fontSize:12, fontWeight:600, marginTop:3 }}>
                    {selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <button onClick={() => setSelectedDay(null)}
                  style={{ background:'transparent', border:'none',
                    color:'#3d6285', fontSize:18, cursor:'pointer',
                    padding:'4px 8px', borderRadius:6, lineHeight:1,
                    transition:'color .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#e8f1f8')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#3d6285')}>
                  ✕
                </button>
              </div>

              {/* Event rows */}
              {selectedEvents.map(ev => {
                const isCalEvt    = ev.type === 'calendar_event';
                const accentColor = isCalEvt ? '#3a7fc1' : '#22c55e';
                const accentBg    = isCalEvt ? 'rgba(58,127,193,0.06)' : 'rgba(34,197,94,0.06)';
                const accentBord  = isCalEvt ? 'rgba(58,127,193,0.15)' : 'rgba(34,197,94,0.15)';

                return (
                  <div key={ev.id} className="event-row">
                    <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                      {/* Accent stripe */}
                      <div style={{ width:3, borderRadius:99, alignSelf:'stretch',
                        background: isCalEvt
                          ? 'linear-gradient(180deg,#3a7fc1,#2563a8)'
                          : 'linear-gradient(180deg,#22c55e,#16a34a)',
                        flexShrink:0, minHeight:48 }} />

                      <div style={{ flex:1, minWidth:0 }}>
                        {/* Badge */}
                        <div style={{ marginBottom:8 }}>
                          <span style={{ background: isCalEvt ? 'rgba(58,127,193,0.12)' : 'rgba(34,197,94,0.1)',
                            border:`1px solid ${accentBord}`,
                            borderRadius:99, padding:'2px 10px',
                            color:accentColor, fontSize:11, fontWeight:700 }}>
                            {isCalEvt ? 'Calendar Event' : 'Confirmed Show'}
                          </span>
                        </div>

                        {/* Venue name */}
                        <div style={{ color:'#ffffff', fontWeight:800,
                          fontSize:16, lineHeight:1.3, marginBottom:8 }}>
                          {ev.venue_name}
                        </div>

                        {/* Details grid */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 16px' }}>
                          {(ev.venue_city || ev.venue_state) && (
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <span style={{ color:'#3d6285', fontSize:12 }}>📍</span>
                              <span style={{ color:'#7aa5c4', fontSize:13, fontWeight:600 }}>
                                {[ev.venue_city, ev.venue_state].filter(Boolean).join(', ')}
                              </span>
                            </div>
                          )}
                          {ev.venue_phone && (
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <span style={{ color:'#3d6285', fontSize:12 }}>☎</span>
                              <a href={`tel:${ev.venue_phone}`}
                                style={{ color:'#6baed6', fontSize:13, fontWeight:600,
                                  textDecoration:'none' }}
                                onMouseEnter={e=>(e.currentTarget.style.textDecoration='underline')}
                                onMouseLeave={e=>(e.currentTarget.style.textDecoration='none')}>
                                {ev.venue_phone}
                              </a>
                            </div>
                          )}
                          {ev.venue_address && (
                            <div style={{ display:'flex', alignItems:'flex-start', gap:6, gridColumn:'1/-1' }}>
                              <span style={{ color:'#3d6285', fontSize:12, marginTop:1 }}>🏠</span>
                              <span style={{ color:'#3d6285', fontSize:12 }}>{ev.venue_address}</span>
                            </div>
                          )}
                          {ev.campaign_name && (
                            <div style={{ display:'flex', alignItems:'center', gap:6, gridColumn:'1/-1' }}>
                              <span style={{ color:'#3d6285', fontSize:12 }}>🛣️</span>
                              <span style={{ background:'rgba(74,133,200,0.1)',
                                border:'1px solid rgba(74,133,200,0.2)', borderRadius:99,
                                padding:'2px 10px', color:'#6baed6', fontSize:11, fontWeight:700 }}>
                                {ev.campaign_name}
                              </span>
                            </div>
                          )}
                          {ev.date && (
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <span style={{ color:'#3d6285', fontSize:12 }}>📅</span>
                              <span style={{ color:'#7aa5c4', fontSize:12, fontWeight:600 }}>
                                {new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', {
                                  month:'short', day:'numeric', year:'numeric' })}
                              </span>
                            </div>
                          )}
                          {ev.source && ev.source !== 'booking' && (
                            <div style={{ color:'#3d6285', fontSize:11 }}>
                              via {ev.source}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
