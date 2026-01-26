'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface CalendarSettings {
  connected: boolean;
  calendarId?: string;
  calendarName?: string;
  syncEnabled: boolean;
}

export default function CalendarSettings() {
  const [settings, setSettings] = useState<CalendarSettings>({
    connected: false,
    syncEnabled: false
  });
  const [loading, setLoading] = useState(true);
  const [calendars, setCalendars] = useState<any[]>([]);
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      
      // Get current user
      const loggedInUser = localStorage.getItem('loggedInUser');
      if (!loggedInUser) return;
      
      const user = JSON.parse(loggedInUser);
      setUserEmail(user.email);

      // Load calendar settings
      const { data } = await supabase
        .from('user_calendar_settings')
        .select('*')
        .eq('user_email', user.email)
        .single();

      if (data && data.google_access_token) {
        setSettings({
          connected: true,
          calendarId: data.google_calendar_id,
          calendarName: data.calendar_name,
          syncEnabled: data.sync_enabled
        });

        // Load available calendars
        await loadCalendars(data.google_access_token, data.google_refresh_token);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading settings:', error);
      setLoading(false);
    }
  };

  const loadCalendars = async (accessToken: string, refreshToken: string) => {
    try {
      const response = await fetch('/api/google/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, refreshToken })
      });

      if (response.ok) {
        const data = await response.json();
        setCalendars(data.calendars || []);
      }
    } catch (error) {
      console.error('Error loading calendars:', error);
    }
  };

  const connectGoogleCalendar = () => {
    // Redirect to Google OAuth
    const authUrl = `/api/auth/google?email=${encodeURIComponent(userEmail)}`;
    window.location.href = authUrl;
  };

  const disconnectCalendar = async () => {
    if (!confirm('Disconnect Google Calendar? This will stop syncing events.')) return;

    try {
      const { error } = await supabase
        .from('user_calendar_settings')
        .delete()
        .eq('user_email', userEmail);

      if (error) throw error;

      setSettings({
        connected: false,
        syncEnabled: false
      });
      setCalendars([]);
      alert('✅ Google Calendar disconnected');
    } catch (error) {
      console.error('Error disconnecting:', error);
      alert('Error disconnecting calendar');
    }
  };

  const selectCalendar = async (calendarId: string, calendarName: string) => {
    try {
      const { error } = await supabase
        .from('user_calendar_settings')
        .update({
          google_calendar_id: calendarId,
          calendar_name: calendarName,
          updated_at: new Date().toISOString()
        })
        .eq('user_email', userEmail);

      if (error) throw error;

      setSettings({
        ...settings,
        calendarId,
        calendarName
      });
      setShowCalendarPicker(false);
      alert('✅ Calendar selected!');
    } catch (error) {
      console.error('Error selecting calendar:', error);
      alert('Error selecting calendar');
    }
  };

  const toggleSync = async () => {
    try {
      const newSyncStatus = !settings.syncEnabled;

      const { error } = await supabase
        .from('user_calendar_settings')
        .update({
          sync_enabled: newSyncStatus,
          updated_at: new Date().toISOString()
        })
        .eq('user_email', userEmail);

      if (error) throw error;

      setSettings({
        ...settings,
        syncEnabled: newSyncStatus
      });
    } catch (error) {
      console.error('Error toggling sync:', error);
      alert('Error updating sync settings');
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '400px'
      }}>
        <p style={{ color: '#708090' }}>Loading settings...</p>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        * { box-sizing: border-box; }
        
        .settings-container {
          background: linear-gradient(135deg, #F5F5F0 0%, #E8E6E1 100%);
          min-height: 100vh;
          padding: 2rem;
        }
        
        @media (max-width: 767px) {
          .settings-container {
            padding: 1rem;
          }
        }
      `}</style>

      <div className="settings-container">
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <h1 style={{
              fontSize: '2.2rem',
              fontWeight: '700',
              color: '#5D4E37',
              margin: '0 0 0.5rem 0'
            }}>
              Calendar Settings
            </h1>
            <p style={{ color: '#708090', margin: 0, fontSize: '1.05rem' }}>
              Connect your Google Calendar for two-way sync
            </p>
          </div>

          {/* Main Settings Card */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '2rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)'
          }}>
            {!settings.connected ? (
              // Not Connected
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📅</div>
                <h3 style={{ fontSize: '1.5rem', color: '#5D4E37', margin: '0 0 1rem 0' }}>
                  Connect Google Calendar
                </h3>
                <p style={{ color: '#708090', marginBottom: '2rem', lineHeight: '1.6' }}>
                  Sync your bookings with Google Calendar. Events will automatically<br />
                  appear on your calendar when venues are booked.
                </p>
                <button
                  onClick={connectGoogleCalendar}
                  style={{
                    padding: '1rem 2rem',
                    background: 'linear-gradient(135deg, #5D4E37 0%, #8B7355 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '700',
                    fontSize: '1.05rem',
                    boxShadow: '0 4px 12px rgba(93, 78, 55, 0.3)'
                  }}
                >
                  🔗 Connect Google Calendar
                </button>
              </div>
            ) : (
              // Connected
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '2rem',
                  padding: '1rem',
                  background: 'linear-gradient(135deg, rgba(135, 174, 115, 0.1), rgba(107, 142, 92, 0.1))',
                  borderRadius: '8px',
                  border: '2px solid rgba(135, 174, 115, 0.3)'
                }}>
                  <div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#87AE73', marginBottom: '0.25rem' }}>
                      ✅ Connected
                    </div>
                    <div style={{ color: '#708090', fontSize: '0.95rem' }}>
                      {settings.calendarName || 'Google Calendar'}
                    </div>
                  </div>
                  <button
                    onClick={disconnectCalendar}
                    style={{
                      padding: '0.75rem 1.5rem',
                      background: '#FEE',
                      color: '#C33',
                      border: '2px solid #C33',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    Disconnect
                  </button>
                </div>

                {/* Calendar Selection */}
                <div style={{ marginBottom: '2rem' }}>
                  <label style={{
                    display: 'block',
                    color: '#5D4E37',
                    marginBottom: '0.75rem',
                    fontWeight: '600',
                    fontSize: '1rem'
                  }}>
                    Selected Calendar
                  </label>
                  
                  {settings.calendarId ? (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '1rem',
                      background: '#F5F5F0',
                      borderRadius: '8px'
                    }}>
                      <span style={{ color: '#5D4E37', fontWeight: '600' }}>
                        {settings.calendarName}
                      </span>
                      <button
                        onClick={() => setShowCalendarPicker(true)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#5D4E37',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.9rem'
                        }}
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowCalendarPicker(true)}
                      style={{
                        width: '100%',
                        padding: '1rem',
                        background: '#5D4E37',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '1rem'
                      }}
                    >
                      Select Calendar
                    </button>
                  )}
                </div>

                {/* Sync Toggle */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  background: '#F5F5F0',
                  borderRadius: '8px'
                }}>
                  <div>
                    <div style={{ color: '#5D4E37', fontWeight: '600', marginBottom: '0.25rem' }}>
                      Auto-Sync Enabled
                    </div>
                    <div style={{ color: '#708090', fontSize: '0.9rem' }}>
                      Automatically sync bookings with Google Calendar
                    </div>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '60px', height: '34px' }}>
                    <input
                      type="checkbox"
                      checked={settings.syncEnabled}
                      onChange={toggleSync}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: settings.syncEnabled ? '#87AE73' : '#ccc',
                      transition: '0.4s',
                      borderRadius: '34px'
                    }}>
                      <span style={{
                        position: 'absolute',
                        content: '',
                        height: '26px',
                        width: '26px',
                        left: settings.syncEnabled ? '30px' : '4px',
                        bottom: '4px',
                        background: 'white',
                        transition: '0.4s',
                        borderRadius: '50%'
                      }} />
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Calendar Picker Modal */}
          {showCalendarPicker && (
            <div
              onClick={() => setShowCalendarPicker(false)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
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
                  background: 'white',
                  borderRadius: '12px',
                  padding: '2rem',
                  maxWidth: '500px',
                  width: '100%',
                  maxHeight: '70vh',
                  overflow: 'auto'
                }}
              >
                <h3 style={{ color: '#5D4E37', margin: '0 0 1.5rem 0' }}>
                  Select Calendar
                </h3>

                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {calendars.map((cal) => (
                    <div
                      key={cal.id}
                      onClick={() => selectCalendar(cal.id, cal.summary)}
                      style={{
                        padding: '1rem',
                        background: settings.calendarId === cal.id ? '#F5F5F0' : 'white',
                        border: '2px solid',
                        borderColor: settings.calendarId === cal.id ? '#5D4E37' : '#E8E6E1',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ color: '#5D4E37', fontWeight: '600' }}>
                        {cal.summary}
                      </div>
                      {cal.description && (
                        <div style={{ color: '#708090', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                          {cal.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setShowCalendarPicker(false)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: '#E8E6E1',
                    color: '#708090',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    marginTop: '1rem',
                    fontWeight: '600'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
