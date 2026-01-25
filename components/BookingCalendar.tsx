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
}

export default function BookingCalendar() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBookings();
  }, [year]);

  const loadBookings = async () => {
    try {
      setLoading(true);

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
        status: cv.status
      }));

      setBookings(bookingsList);
      setLoading(false);
    } catch (error) {
      console.error('Error loading bookings:', error);
      setLoading(false);
    }
  };

  const getBookingsForDate = (dateStr: string) => {
    return bookings.filter(b => b.date === dateStr);
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

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
          border-radius: 12px;
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
                {bookings.length} confirmed booking{bookings.length !== 1 ? 's' : ''} in {year}
              </p>
            </div>

            {/* Year Navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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

          {/* Year Grid */}
          <div className="year-grid">
            {months.map((monthName, monthIndex) => (
              <MonthCard
                key={monthIndex}
                year={year}
                monthIndex={monthIndex}
                monthName={monthName}
                bookings={bookings}
                onDateClick={(date) => setSelectedDate(date)}
              />
            ))}
          </div>
        </div>

        {/* Booking Detail Modal */}
        {selectedDate && (
          <BookingModal
            date={selectedDate}
            bookings={getBookingsForDate(selectedDate)}
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
  onDateClick 
}: { 
  year: number;
  monthIndex: number;
  monthName: string;
  bookings: Booking[];
  onDateClick: (date: string) => void;
}) {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();
  
  const today = new Date();
  const isCurrentMonth = today.getMonth() === monthIndex && today.getFullYear() === year;

  const days: JSX.Element[] = [];
  
  // Empty cells for days before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(<div key={`empty-${i}`} />);
  }
  
  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayBookings = bookings.filter(b => b.date === dateStr);
    const isToday = isCurrentMonth && today.getDate() === day;
    const hasBooking = dayBookings.length > 0;

    days.push(
      <div
        key={day}
        className={`day-cell ${hasBooking ? 'booked-day' : ''} ${isToday ? 'today' : ''}`}
        onClick={() => hasBooking && onDateClick(dateStr)}
        style={{
          background: hasBooking ? undefined : 'rgba(200, 168, 130, 0.1)',
          color: hasBooking ? 'white' : '#9B8A7A',
          cursor: hasBooking ? 'pointer' : 'default'
        }}
      >
        {day}
        {dayBookings.length > 1 && (
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
            {dayBookings.length}
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

function BookingModal({ 
  date, 
  bookings, 
  onClose 
}: { 
  date: string;
  bookings: Booking[];
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
              {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
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

        {/* Bookings */}
        <div style={{ display: 'grid', gap: '1rem' }}>
          {bookings.map((booking) => (
            <div
              key={booking.id}
              style={{
                background: 'linear-gradient(135deg, rgba(135, 174, 115, 0.2), rgba(107, 142, 92, 0.2))',
                border: '2px solid rgba(135, 174, 115, 0.4)',
                borderRadius: '12px',
                padding: '1.5rem'
              }}
            >
              <h3 style={{
                color: '#87AE73',
                fontSize: '1.4rem',
                fontWeight: '700',
                margin: '0 0 0.75rem 0'
              }}>
                {booking.venue_name}
              </h3>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <div style={{ color: '#E8DCC4', fontSize: '1rem' }}>
                  📍 {booking.venue_city}, {booking.venue_state}
                </div>

                {booking.venue_address && (
                  <div style={{ color: '#9B8A7A', fontSize: '0.95rem' }}>
                    🏠 {booking.venue_address}
                  </div>
                )}

                {booking.venue_phone && (
                  <div style={{ color: '#9B8A7A', fontSize: '0.95rem' }}>
                    📞 {booking.venue_phone}
                  </div>
                )}

                {booking.campaign_name && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    background: 'rgba(200, 168, 130, 0.2)',
                    borderRadius: '6px',
                    color: '#C8A882',
                    fontSize: '0.9rem',
                    fontWeight: '600'
                  }}>
                    Campaign: {booking.campaign_name}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
