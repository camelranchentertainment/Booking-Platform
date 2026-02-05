'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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

export default function BookingCalendar() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadAllEvents();
    }
  }, [year, user]);

  const checkAuth = async () => {
    try {
      const loggedInUser = localStorage.getItem('loggedInUser');
      if (loggedInUser) {
        setUser(JSON.parse(loggedInUser));
      }
    } catch (error) {
      console.error('Auth error:', error);
    }
  };

  const loadAllEvents = async () => {
    setLoading(true);
    await Promise.all([
      loadBookings(),
      syncGoogleCalendar()
    ]);
    setLoading(false);
  };

  const loadBookings = async () => {
    try {
      // Get all confirmed bookings for the year
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const { data: campaignVenues } = await supabase
        .from('campaign_venues')
        .select(`
          id,
          status,
          booking_date,
          campaign:campaigns(id, name),
          venue:venues(id, name, city, state, address, phone)
        `)
        .eq('status', 'booked')
        .gte('booking_date', startDate)
        .lte('booking_date', endDate)
        .not('booking_date', 'is', null);

      const bookingsList = (campaignVenues || []).map((cv: any) => ({
        id: cv.id,
        date: cv.booking_date,
        venue_name: cv.venue?.name || 'Unknown Venue',
        venue_city: cv.venue?.city || '',
        venue_state: cv.venue?.state || '',
        venue_address: cv.venue?.address,
        venue_phone: cv.venue?.phone,
        campaign_name: cv.campaign?.name,
        status: cv.status,
        type: 'booking' as const
      }));

      setBookings(bookingsList);
    } catch (error) {
      console.error('Error loading bookings:', error);
    }
  };

  const syncGoogleCalendar = async () => {
    if (!user) return;

    try {
      setSyncStatus('Syncing calendar...');
      
      const response = await fetch(`/api/calendar/sync?userId=${user.id}&year=${year}`);
      
      if (!response.ok) {
        console.error('Calendar sync failed:', response.status);
        setSyncStatus('');
        return;
      }

      const data = await response.json();
      
      if (data.events && data.events.length > 0) {
        setCalendarEvents(data.events);
        setSyncStatus(`✓ Synced ${data.events.length} calendar events`);
        setTimeout(() => setSyncStatus(''), 3000);
      } else {
        setSyncStatus('');
      }
    } catch (error) {
      console.error('Error syncing calendar:', error);
      setSyncStatus('');
    }
  };

  const getAllEventsForDate = (dateStr: string) => {
    const bookingsForDate = bookings.filter(b => b.date === dateStr);
    const eventsForDate = calendarEvents.filter(e => e.date === dateStr);
    
    return [
      ...bookingsForDate,
      ...eventsForDate.map(e => ({
        id: e.id,
        date: e.date,
        venue_name: e.title,
        venue_city: '',
        venue_state: '',
        venue_address: e.location,
        venue_phone: '',
        campaign_name: e.description,
        status: 'calendar_event',
        type: 'calendar_event' as const,
        source: e.source
      }))
    ];
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const totalEvents = bookings.length + calendarEvents.length;

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📅</div>
          <p style={{ color: '#C8A882', fontSize: '1.1rem' }}>Loading calendar...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        * { box-sizing: border-box; }
        
        .calendar-container {
          background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
          min-height: 100vh;
          padding: 2rem;
        }
        
        .year-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
          margin-top: 2rem;
        }
        
        .month-card {
          background: linear-gradient(135deg, rgba(45, 35, 25, 0.95), rgba(61, 40, 23, 0.95));
          border: 2px solid rgba(200, 168, 130, 0.3);
          borderRadius: 12px;
          padding: 1.5rem;
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        }
        
        .day-cell {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-weight: 600;
          position: relative;
        }
        
        .day-cell:hover {
          transform: scale(1.1);
        }
        
        .booked-day {
          background: linear-gradient(135deg, #87AE73 0%, #6B8E5C 100%);
          color: white;
          box-shadow: 0 4px 12px rgba(135, 174, 115, 0.4);
        }
        
        .calendar-event-day {
          background: linear-gradient(135deg, #5D9CEC 0%, #4A89DC 100%);
          color: white;
          box-shadow: 0 4px 12px rgba(93, 156, 236, 0.4);
        }
        
        .mixed-day {
          background: linear-gradient(135deg, #C8A882 0%, #B7410E 100%);
          color: white;
          box-shadow: 0 4px 12px rgba(200, 168, 130, 0.4);
        }
        
        .today {
          border: 2px solid #C8A882;
        }
        
        @media (max-width: 1024px) {
          .year-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        
        @media (max-width: 767px) {
          .calendar-container {
            padding: 1rem;
          }
          
          .year-grid {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }
        }
      `}</style>

      <div className="calendar-container">
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '2rem',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div>
              <h1 style={{
                fontSize: '2.5rem',
                fontWeight: '700',
                color: '#C8A882',
                margin: 0,
                marginBottom: '0.5rem'
              }}>
                Booking Calendar
              </h1>
              <p style={{ color: '#9B8A7A', margin: 0, fontSize: '1.1rem' }}>
                {bookings.length} booking{bookings.length !== 1 ? 's' : ''} • {calendarEvents.length} calendar event{calendarEvents.length !== 1 ? 's' : ''} in {year}
              </p>
              {syncStatus && (
                <p style={{ color: '#87AE73', margin: '0.5rem 0 0 0', fontSize: '0.95rem' }}>
                  {syncStatus}
                </p>
              )}
            </div>

            {/* Year Navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                onClick={syncGoogleCalendar}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg, #5D9CEC 0%, #4A89DC 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '0.95rem'
                }}
              >
                🔄 Sync Calendar
              </button>
              
              <button
                onClick={() => setYear(year - 1)}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg, #5D4E37 0%, #8B7355 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '1rem'
                }}
              >
                ← {year - 1}
              </button>
              
              <div style={{
                padding: '0.75rem 2rem',
                background: 'linear-gradient(135deg, #C8A882 0%, #B8987A 100%)',
                color: '#2d2d2d',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '1.3rem'
              }}>
                {year}
              </div>
              
              <button
                onClick={() => setYear(year + 1)}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg, #5D4E37 0%, #8B7355 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '1rem'
                }}
              >
                {year + 1} →
              </button>
            </div>
          </div>

          {/* Legend */}
          <div style={{
            display: 'flex',
            gap: '1.5rem',
            marginBottom: '2rem',
            flexWrap: 'wrap',
            padding: '1rem',
            background: 'rgba(45, 35, 25, 0.5)',
            borderRadius: '8px',
            border: '1px solid rgba(200, 168, 130, 0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: '20px',
                height: '20px',
                background: 'linear-gradient(135deg, #87AE73 0%, #6B8E5C 100%)',
                borderRadius: '4px'
              }} />
              <span style={{ color: '#E8DCC4', fontSize: '0.95rem' }}>Confirmed Bookings</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: '20px',
                height: '20px',
                background: 'linear-gradient(135deg, #5D9CEC 0%, #4A89DC 100%)',
                borderRadius: '4px'
              }} />
              <span style={{ color: '#E8DCC4', fontSize: '0.95rem' }}>Calendar Events</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: '20px',
                height: '20px',
                background: 'linear-gradient(135deg, #C8A882 0%, #B7410E 100%)',
                borderRadius: '4px'
              }} />
              <span style={{ color: '#E8DCC4', fontSize: '0.95rem' }}>Multiple Events</span>
            </div>
          </div>

          {/* Year Grid */}
          <div className="year-grid">
            {months.map((monthName, monthIndex) => (
              <MonthCard
                key={monthIndex}
                year={year}
                monthIndex={monthIndex}
                monthName={monthName}
                bookings={bookings}
                calendarEvents={calendarEvents}
                onDateClick={(date) => setSelectedDate(date)}
              />
            ))}
          </div>
        </div>

        {/* Event Detail Modal */}
        {selectedDate && (
          <EventModal
            date={selectedDate}
            events={getAllEventsForDate(selectedDate)}
            onClose={() => setSelectedDate(null)}
          />
        )}
      </div>
    </>
  );
}

function MonthCard({ 
  year, 
  monthIndex, 
  monthName, 
  bookings,
  calendarEvents,
  onDateClick 
}: { 
  year: number;
  monthIndex: number;
  monthName: string;
  bookings: Booking[];
  calendarEvents: CalendarEvent[];
  onDateClick: (date: string) => void;
}) {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();
  
  const today = new Date();
  const isCurrentMonth = today.getMonth() === monthIndex && today.getFullYear() === year;

  const days: React.ReactElement[] = [];
  
  // Empty cells for days before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(<div key={`empty-${i}`} />);
  }
  
  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayBookings = bookings.filter(b => b.date === dateStr);
    const dayEvents = calendarEvents.filter(e => e.date === dateStr);
    const isToday = isCurrentMonth && today.getDate() === day;
    const totalCount = dayBookings.length + dayEvents.length;
    const hasBooking = dayBookings.length > 0;
    const hasEvent = dayEvents.length > 0;
    const hasBoth = hasBooking && hasEvent;

    let className = 'day-cell';
    if (hasBoth) className += ' mixed-day';
    else if (hasBooking) className += ' booked-day';
    else if (hasEvent) className += ' calendar-event-day';
    if (isToday) className += ' today';

    days.push(
      <div
        key={day}
        className={className}
        onClick={() => totalCount > 0 && onDateClick(dateStr)}
        style={{
          background: totalCount > 0 ? undefined : 'rgba(200, 168, 130, 0.1)',
          color: totalCount > 0 ? 'white' : '#9B8A7A',
          cursor: totalCount > 0 ? 'pointer' : 'default'
        }}
      >
        {day}
        {totalCount > 1 && (
          <div style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            background: '#B7410E',
            color: 'white',
            borderRadius: '50%',
            width: '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.7rem',
            fontWeight: '700'
          }}>
            {totalCount}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="month-card">
      <h3 style={{
        color: '#C8A882',
        fontSize: '1.3rem',
        fontWeight: '700',
        margin: '0 0 1rem 0',
        textAlign: 'center'
      }}>
        {monthName}
      </h3>

      {/* Day Headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '4px',
        marginBottom: '0.5rem'
      }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <div
            key={i}
            style={{
              textAlign: 'center',
              color: '#9B8A7A',
              fontSize: '0.8rem',
              fontWeight: '700',
              padding: '0.25rem'
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '4px'
      }}>
        {days}
      </div>
    </div>
  );
}

function EventModal({ 
  date, 
  events, 
  onClose 
}: { 
  date: string;
  events: Booking[];
  onClose: () => void;
}) {
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #2d2d2d 0%, #3d3d3d 100%)',
          border: '2px solid #C8A882',
          borderRadius: '16px',
          padding: '2rem',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
          marginBottom: '1.5rem'
        }}>
          <div>
            <h2 style={{
              color: '#C8A882',
              fontSize: '1.8rem',
              fontWeight: '700',
              margin: '0 0 0.5rem 0'
            }}>
              {formattedDate}
            </h2>
            <p style={{ color: '#9B8A7A', margin: 0, fontSize: '1rem' }}>
              {events.length} event{events.length !== 1 ? 's' : ''}
            </p>
          </div>
          
          <button
            onClick={onClose}
            style={{
              background: 'rgba(200, 168, 130, 0.2)',
              border: '2px solid rgba(200, 168, 130, 0.5)',
              color: '#C8A882',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '700'
            }}
          >
            ×
          </button>
        </div>

        {/* Events */}
        <div style={{ display: 'grid', gap: '1rem' }}>
          {events.map((event) => {
            const isCalendarEvent = event.type === 'calendar_event';
            const borderColor = isCalendarEvent 
              ? 'rgba(93, 156, 236, 0.4)' 
              : 'rgba(135, 174, 115, 0.4)';
            const bgColor = isCalendarEvent
              ? 'rgba(93, 156, 236, 0.2)'
              : 'rgba(135, 174, 115, 0.2)';
            const titleColor = isCalendarEvent ? '#5D9CEC' : '#87AE73';

            return (
              <div
                key={event.id}
                style={{
                  background: `linear-gradient(135deg, ${bgColor}, ${bgColor})`,
                  border: `2px solid ${borderColor}`,
                  borderRadius: '12px',
                  padding: '1.5rem'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'start',
                  marginBottom: '0.75rem'
                }}>
                  <h3 style={{
                    color: titleColor,
                    fontSize: '1.4rem',
                    fontWeight: '700',
                    margin: 0
                  }}>
                    {event.venue_name}
                  </h3>
                  {isCalendarEvent && (
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      background: 'rgba(93, 156, 236, 0.3)',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      color: '#5D9CEC',
                      fontWeight: '600'
                    }}>
                      {event.source}
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {event.venue_city && event.venue_state && (
                    <div style={{ color: '#E8DCC4', fontSize: '1rem' }}>
                      📍 {event.venue_city}, {event.venue_state}
                    </div>
                  )}

                  {event.venue_address && (
                    <div style={{ color: '#9B8A7A', fontSize: '0.95rem' }}>
                      🏠 {event.venue_address}
                    </div>
                  )}

                  {event.venue_phone && (
                    <div style={{ color: '#9B8A7A', fontSize: '0.95rem' }}>
                      📞 {event.venue_phone}
                    </div>
                  )}

                  {event.campaign_name && (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      background: 'rgba(200, 168, 130, 0.2)',
                      borderRadius: '6px',
                      color: '#C8A882',
                      fontSize: '0.9rem',
                      fontWeight: '600'
                    }}>
                      {isCalendarEvent ? 'Description: ' : 'Campaign: '}{event.campaign_name}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
