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

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

// ─── Main component ───────────────────────────────────────────────────────────
export default function BookingCalendar() {
  const [year, setYear]                   = useState(new Date().getFullYear());
  const [bookings, setBookings]           = useState<Booking[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate]   = useState<string | null>(null);
  const [loading, setLoading]             = useState(true);
  const [syncStatus, setSyncStatus]       = useState('');
  const [user, setUser]                   = useState<any>(null);

  useEffect(() => {
    const local = localStorage.getItem('loggedInUser');
    if (local) setUser(JSON.parse(local));
  }, []);

  useEffect(() => {
    if (user) { setLoading(true); Promise.all([loadBookings(), syncGoogle()]).finally(() => setLoading(false)); }
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

      setBookings((data || []).map((cv: any) => ({
        id:           cv.id,
        date:         cv.booking_date,
        venue_name:   cv.venue?.name    || 'Unknown Venue',
        venue_city:   cv.venue?.city    || '',
        venue_state:  cv.venue?.state   || '',
        venue_address:cv.venue?.address,
        venue_phone:  cv.venue?.phone,
        campaign_name:cv.campaign?.name,
        status:       cv.status,
        type:         'booking' as const,
      })));
    } catch (err) { console.error(err); }
  };

  const syncGoogle = async () => {
    if (!user) return;
    try {
      setSyncStatus('Syncing…');
      const res = await fetch(`/api/calendar/sync?userId=${user.id}&year=${year}`);
      if (!res.ok) { setSyncStatus(''); return; }
      const data = await res.json();
      if (data.events?.length) {
        setCalendarEvents(data.events);
        setSyncStatus(`✓ ${data.events.length} calendar events`);
        setTimeout(() => setSyncStatus(''), 3000);
      } else setSyncStatus('');
    } catch { setSyncStatus(''); }
  };

  const getEventsForDate = (dateStr: string): Booking[] => [
    ...bookings.filter(b => b.date === dateStr),
    ...calendarEvents
      .filter(e => e.date === dateStr)
      .map(e => ({
        id:           e.id,
        date:         e.date,
        venue_name:   e.title,
        venue_city:   '',
        venue_state:  '',
        venue_address:e.location,
        venue_phone:  '',
        campaign_name:e.description,
        status:       'calendar_event',
        type:         'calendar_event' as const,
        source:       e.source,
      })),
  ];

  // ─── Loading ──────────────────────────────────────────────────────────────
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
        }
        /* ── Day cell ── */
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
        }
        .day-cell.has-event {
          cursor: pointer;
          color: #e8f1f8;
        }
        .day-cell.has-event:hover {
          transform: scale(1.12);
          z-index: 2;
        }
        .day-cell.booked {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          box-shadow: 0 4px 14px rgba(34,197,94,0.35);
        }
        .day-cell.cal-event {
          background: linear-gradient(135deg, #3a7fc1, #2563a8);
          box-shadow: 0 4px 14px rgba(37,99,168,0.35);
        }
        .day-cell.mixed {
          background: linear-gradient(135deg, #a78bfa, #7c3aed);
          box-shadow: 0 4px 14px rgba(167,139,250,0.35);
        }
        .day-cell.is-today {
          outline: 2px solid #4a85c8;
          outline-offset: 1px;
        }
        .day-cell.is-today:not(.booked):not(.cal-event):not(.mixed) {
          color: #4a85c8;
          background: rgba(74,133,200,0.1);
        }
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
        .legend-dot {
          width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0;
        }
        /* ── Modal ── */
        .cal-modal-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(3,13,24,0.88); backdrop-filter: blur(12px);
          display: flex; align-items: center; justify-content: center; padding: 1rem;
        }
        .cal-modal {
          background: #091828; border: 1px solid rgba(74,133,200,0.2);
          border-radius: 18px; padding: 2rem; width: 100%; max-width: 540px;
          max-height: 85vh; overflow-y: auto;
          box-shadow: 0 24px 80px rgba(0,0,0,0.6);
        }
        @media (max-width: 768px) {
          .cal-wrap { padding: 1rem; }
          .year-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
        }
        @media (max-width: 500px) {
          .year-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="cal-wrap">
        <div style={{ maxWidth: 1600, margin: '0 auto' }}>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div style={{ marginBottom: '1.75rem',
            display: 'flex', alignItems: 'flex-start',
            justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 style={{ fontFamily:"'Bebas Neue',cursive", fontWeight:400,
                fontSize:'clamp(1.8rem,3vw,2.4rem)', letterSpacing:'0.06em',
                color:'#ffffff', margin:0, lineHeight:1 }}>Band Calendar</h1>
              <p style={{ color:'#3d6285', margin:'5px 0 0', fontSize:13, fontWeight:600 }}>
                {totalShows} confirmed show{totalShows !== 1 ? 's' : ''} in {year}
                {syncStatus && (
                  <span style={{ marginLeft:12, color:'#22c55e' }}>{syncStatus}</span>
                )}
              </p>
            </div>

            {/* Year nav */}
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <button className="cal-btn" onClick={() => setYear(y => y - 1)}>
                ← {year - 1}
              </button>
              <div style={{ background:'rgba(9,24,40,0.9)',
                border:'1px solid rgba(74,133,200,0.22)', borderRadius:9,
                padding:'9px 22px', fontFamily:"'Bebas Neue',cursive",
                fontSize:'1.3rem', letterSpacing:'0.08em', color:'#e8f1f8' }}>
                {year}
              </div>
              <button className="cal-btn" onClick={() => setYear(y => y + 1)}>
                {year + 1} →
              </button>
            </div>
          </div>

          {/* ── Legend ──────────────────────────────────────────────────── */}
          <div style={{ display:'flex', gap:20, marginBottom:'1.5rem',
            flexWrap:'wrap', alignItems:'center',
            padding:'10px 16px',
            background:'rgba(9,24,40,0.6)',
            border:'1px solid rgba(74,133,200,0.1)', borderRadius:10 }}>
            {[
              { cls:'booked',    label:'Confirmed Booking',  color:'linear-gradient(135deg,#22c55e,#16a34a)' },
              { cls:'cal-event', label:'Calendar Event',     color:'linear-gradient(135deg,#3a7fc1,#2563a8)' },
              { cls:'mixed',     label:'Multiple Events',    color:'linear-gradient(135deg,#a78bfa,#7c3aed)' },
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
                onDateClick={date => setSelectedDate(date)}
              />
            ))}
          </div>

        </div>
      </div>

      {/* ── Event Modal ──────────────────────────────────────────────────── */}
      {selectedDate && (
        <EventModal
          date={selectedDate}
          events={getEventsForDate(selectedDate)}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </>
  );
}

// ─── Month card ───────────────────────────────────────────────────────────────
function MonthCard({ year, monthIndex, monthName, bookings, calendarEvents, onDateClick }: {
  year: number; monthIndex: number; monthName: string;
  bookings: Booking[]; calendarEvents: CalendarEvent[];
  onDateClick: (date: string) => void;
}) {
  const firstDay    = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const today       = new Date();
  const isCurMonth  = today.getMonth() === monthIndex && today.getFullYear() === year;

  // Count events this month for header badge
  const monthBookings = bookings.filter(b => {
    const d = new Date(b.date);
    return d.getMonth() === monthIndex && d.getFullYear() === year;
  }).length;

  const cells: React.ReactElement[] = [];

  // Empty lead-in cells
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} />);

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const ds        = `${year}-${String(monthIndex+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const hasBook   = bookings.some(b => b.date === ds);
    const hasEvt    = calendarEvents.some(e => e.date === ds);
    const hasBoth   = hasBook && hasEvt;
    const isToday   = isCurMonth && today.getDate() === day;
    const total     = bookings.filter(b=>b.date===ds).length + calendarEvents.filter(e=>e.date===ds).length;

    let cls = 'day-cell';
    if (hasBoth)       cls += ' mixed has-event';
    else if (hasBook)  cls += ' booked has-event';
    else if (hasEvt)   cls += ' cal-event has-event';
    if (isToday)       cls += ' is-today';

    cells.push(
      <div key={day} className={cls}
        onClick={() => total > 0 && onDateClick(ds)}
        title={total > 0 ? `${total} event${total!==1?'s':''}` : undefined}>
        {day}
        {total > 1 && (
          <div style={{ position:'absolute', top:2, right:2,
            background:'rgba(3,13,24,0.7)', color:'#e8f1f8',
            borderRadius:'50%', width:14, height:14,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:9, fontWeight:800, lineHeight:1 }}>
            {total}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="month-card">
      {/* Month header */}
      <div style={{ display:'flex', alignItems:'center',
        justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontFamily:"'Nunito',sans-serif", fontWeight:800,
          fontSize:14, color:'#ffffff', letterSpacing:'0.02em' }}>
          {monthName}
        </div>
        {monthBookings > 0 && (
          <span style={{ background:'rgba(34,197,94,0.12)',
            border:'1px solid rgba(34,197,94,0.28)', borderRadius:99,
            padding:'2px 9px', color:'#22c55e', fontSize:11, fontWeight:700 }}>
            {monthBookings} show{monthBookings!==1?'s':''}
          </span>
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

      {/* Days */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>
        {cells}
      </div>
    </div>
  );
}

// ─── Event detail modal ───────────────────────────────────────────────────────
function EventModal({ date, events, onClose }: {
  date: string; events: Booking[]; onClose: () => void;
}) {
  return (
    <div className="cal-modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cal-modal">
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between',
          alignItems:'flex-start', marginBottom:'1.5rem' }}>
          <div>
            <div style={{ fontFamily:"'Bebas Neue',cursive", fontWeight:400,
              fontSize:'1.6rem', letterSpacing:'0.05em', color:'#ffffff',
              lineHeight:1, marginBottom:4 }}>
              {fmtDate(date)}
            </div>
            <div style={{ color:'#3d6285', fontSize:13, fontWeight:600 }}>
              {events.length} event{events.length!==1?'s':''}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background:'transparent', border:'none',
              color:'#3d6285', fontSize:22, cursor:'pointer', lineHeight:1,
              padding:'4px 8px', borderRadius:6, transition:'color .15s' }}
            onMouseEnter={e=>(e.currentTarget.style.color='#e8f1f8')}
            onMouseLeave={e=>(e.currentTarget.style.color='#3d6285')}>
            ✕
          </button>
        </div>

        {/* Event list */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {events.map(ev => {
            const isCalEvt = ev.type === 'calendar_event';
            const accentColor = isCalEvt ? '#3a7fc1' : '#22c55e';
            const accentBg    = isCalEvt ? 'rgba(58,127,193,0.08)' : 'rgba(34,197,94,0.08)';
            const accentBord  = isCalEvt ? 'rgba(58,127,193,0.2)' : 'rgba(34,197,94,0.2)';

            return (
              <div key={ev.id} style={{ background:accentBg,
                border:`1px solid ${accentBord}`, borderRadius:12, padding:'16px 18px' }}>
                {/* Type badge */}
                <div style={{ marginBottom:10 }}>
                  <span style={{ background:isCalEvt?'rgba(58,127,193,0.15)':'rgba(34,197,94,0.12)',
                    border:`1px solid ${accentBord}`, borderRadius:99,
                    padding:'3px 12px', color:accentColor, fontSize:11, fontWeight:700 }}>
                    {isCalEvt ? 'Calendar Event' : 'Confirmed Show'}
                  </span>
                </div>

                {/* Venue / event name */}
                <div style={{ color:'#ffffff', fontWeight:800, fontSize:16,
                  marginBottom:6, lineHeight:1.3 }}>
                  {ev.venue_name}
                </div>

                {/* Details */}
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  {(ev.venue_city || ev.venue_state) && (
                    <div style={{ color:'#7aa5c4', fontSize:13, fontWeight:600 }}>
                      📍 {[ev.venue_city, ev.venue_state].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {ev.venue_address && (
                    <div style={{ color:'#3d6285', fontSize:12 }}>{ev.venue_address}</div>
                  )}
                  {ev.venue_phone && (
                    <div style={{ color:'#7aa5c4', fontSize:13 }}>☎ {ev.venue_phone}</div>
                  )}
                  {ev.campaign_name && (
                    <div style={{ marginTop:4 }}>
                      <span style={{ background:'rgba(74,133,200,0.1)',
                        border:'1px solid rgba(74,133,200,0.2)', borderRadius:99,
                        padding:'2px 10px', color:'#6baed6', fontSize:11, fontWeight:700 }}>
                        {ev.campaign_name}
                      </span>
                    </div>
                  )}
                  {ev.source && (
                    <div style={{ color:'#3d6285', fontSize:11, marginTop:4 }}>
                      Source: {ev.source}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Close button */}
        <button onClick={onClose}
          style={{ marginTop:'1.5rem', width:'100%', padding:'11px',
            background:'transparent', border:'1px solid rgba(74,133,200,0.25)',
            borderRadius:9, color:'#6baed6', fontFamily:"'Nunito',sans-serif",
            fontSize:14, fontWeight:700, cursor:'pointer', transition:'background .15s' }}
          onMouseEnter={e=>(e.currentTarget.style.background='rgba(74,133,200,0.1)')}
          onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
          Close
        </button>
      </div>
    </div>
  );
}
