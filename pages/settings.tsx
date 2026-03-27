import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

interface AuthUser {
  id: string;
  email: string;
}

export default function Settings() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  // SMTP Email Configuration
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpEmail, setSmtpEmail] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [emailSaveMsg, setEmailSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Calendar integration
  const [googleConnected, setGoogleConnected] = useState(false);
  const [calendarSaveMsg, setCalendarSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const loggedInUser = localStorage.getItem('loggedInUser');
      if (!loggedInUser) {
        router.push('/');
        return;
      }

      const userData = JSON.parse(loggedInUser);
      setUser(userData);

      // Load settings in parallel - errors are silently ignored so page never hangs
      await Promise.all([
        loadSmtpSettings(userData.id),
        loadCalendarSettings(userData.id),
      ]);

      // Handle OAuth redirect result
      const params = new URLSearchParams(window.location.search);
      const calResult = params.get('calendar');
      if (calResult === 'connected') {
        setGoogleConnected(true);
        setCalendarSaveMsg({ ok: true, text: '✓ Google Calendar connected successfully!' });
        router.replace('/settings', undefined, { shallow: true });
      } else if (calResult === 'error') {
        const msg = params.get('message') || 'Connection failed';
        setCalendarSaveMsg({ ok: false, text: `✗ ${msg}` });
        router.replace('/settings', undefined, { shallow: true });
      }
    } catch (error) {
      console.error('Settings init error:', error);
    } finally {
      setLoaded(true);
    }
  };

  const loadCalendarSettings = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_calendar_settings')
        .select('calendar_type, is_active')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn('Could not load calendar settings:', error.message);
        return;
      }

      if (data?.calendar_type === 'google_oauth' && data.is_active !== false) {
        setGoogleConnected(true);
      }
    } catch (error) {
      console.warn('Calendar settings load failed:', error);
    }
  };

  const loadSmtpSettings = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_email_settings')
        .select('smtp_host, smtp_port, email_address, display_name')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.warn('Could not load email settings:', error.message);
        return;
      }

      if (data) {
        setSmtpHost(data.smtp_host || 'smtp.gmail.com');
        setSmtpPort(data.smtp_port?.toString() || '587');
        setSmtpEmail(data.email_address || '');
        setSmtpFromName(data.display_name || '');
        // Never pre-fill password
      }
    } catch (error) {
      console.warn('Email settings load failed:', error);
    }
  };

  const saveEmailSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setEmailSaveMsg(null);
    try {
      const stored = JSON.parse(localStorage.getItem('loggedInUser') || '{}');
      const token = stored.token;
      const res = await fetch('/api/email/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          userId:       user.id,
          provider:     'smtp',
          displayName:  smtpFromName,
          emailAddress: smtpEmail,
          smtpHost,
          smtpPort,
          password:     smtpPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setEmailSaveMsg({ ok: true, text: '✓ Email settings saved!' });
      setSmtpPassword(''); // clear after save
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setEmailSaveMsg({ ok: false, text: `✗ ${msg}` });
    }
  };

  if (!loaded) {
    return (
      <div style={{ padding: '2rem', color: '#7aa5c4', background: '#030d18', minHeight: '100vh' }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid rgba(74,133,200,0.2)',
    borderRadius: '6px',
    background: 'rgba(255,255,255,0.05)',
    color: '#e8f1f8',
    fontSize: '1rem',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#e8f1f8',
    marginBottom: '0.5rem',
    fontWeight: '600',
  };

  const cardStyle: React.CSSProperties = {
    background: 'rgba(9,24,40,0.8)',
    border: '1px solid rgba(74,133,200,0.2)',
    borderRadius: '12px',
    padding: '2rem',
    marginBottom: '2rem',
  };

  const btnStyle: React.CSSProperties = {
    padding: '0.75rem 2rem',
    background: 'linear-gradient(135deg, #3a7fc1, #2563a8)',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
  };

  return (
    <div style={{ background: '#030d18', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        background: 'rgba(3,13,24,0.97)',
        padding: '1rem 2rem',
        borderBottom: '1px solid rgba(74,133,200,0.12)',
        backdropFilter: 'blur(16px)',
        marginBottom: '2rem'
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <a href="/dashboard" style={{ color: '#e8f1f8', textDecoration: 'none', fontSize: '1rem' }}>
            ← Back to Dashboard
          </a>
          <div style={{ fontSize: '1.2rem', fontWeight: '600', color: 'white' }}>
            Camel Ranch Booking
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 2rem 4rem' }}>
        <h1 style={{ color: '#e8f1f8', fontSize: '2.5rem', marginBottom: '2rem' }}>
          Settings
        </h1>

        {/* Email Configuration - shown first, most important */}
        <div style={cardStyle}>
          <h2 style={{ color: '#e8f1f8', fontSize: '1.8rem', marginBottom: '0.5rem' }}>
            📧 Email Configuration
          </h2>
          <p style={{ color: '#7aa5c4', marginBottom: '1.5rem', marginTop: 0 }}>
            Configure your email so booking inquiries are sent from your address.
          </p>

          <div style={{
            background: 'rgba(58,127,193,0.1)',
            border: '1px solid rgba(74,133,200,0.4)',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem'
          }}>
            <p style={{ color: '#6baed6', margin: '0 0 0.25rem 0', fontSize: '0.9rem' }}>
              <strong>Gmail users:</strong> Use an{' '}
              <a
                href="https://support.google.com/accounts/answer/185833"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#6baed6' }}
              >
                App Password
              </a>{' '}
              — not your regular Gmail password. Requires 2FA to be enabled.
            </p>
          </div>

          {emailSaveMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              marginBottom: '1.5rem',
              borderRadius: '8px',
              background: emailSaveMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)',
              border: `1px solid ${emailSaveMsg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}`,
              color: emailSaveMsg.ok ? '#22c55e' : '#f87171',
              fontWeight: 600,
              fontSize: 14,
            }}>
              {emailSaveMsg.text}
            </div>
          )}

          <form onSubmit={saveEmailSettings}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Your Email Address</label>
              <input
                type="email"
                value={smtpEmail}
                onChange={(e) => {
                  setSmtpEmail(e.target.value);
                  const domain = e.target.value.split('@')[1]?.toLowerCase() ?? '';
                  if (domain === 'gmail.com' || domain === 'googlemail.com') { setSmtpHost('smtp.gmail.com'); setSmtpPort('587'); }
                  else if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com') { setSmtpHost('smtp-mail.outlook.com'); setSmtpPort('587'); }
                  else if (domain === 'yahoo.com' || domain === 'yahoo.co.uk') { setSmtpHost('smtp.mail.yahoo.com'); setSmtpPort('465'); }
                  else if (domain === 'icloud.com' || domain === 'me.com') { setSmtpHost('smtp.mail.me.com'); setSmtpPort('587'); }
                  else if (domain === 'protonmail.com' || domain === 'proton.me') { setSmtpHost('smtp.protonmail.com'); setSmtpPort('587'); }
                  else if (domain) { setSmtpHost(`smtp.${domain}`); setSmtpPort('587'); }
                }}
                placeholder="yourband@gmail.com"
                required
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>App Password</label>
              <input
                type="password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder="••••••••••••••••"
                required
                style={inputStyle}
              />
              <p style={{ color: '#7aa5c4', fontSize: '0.85rem', margin: '0.4rem 0 0 0' }}>
                Gmail: generate in Google Account → Security → App Passwords
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={labelStyle}>Display Name (shown in "From" field)</label>
              <input
                type="text"
                value={smtpFromName}
                onChange={(e) => setSmtpFromName(e.target.value)}
                placeholder="Your Band Name"
                style={inputStyle}
              />
            </div>

            <details style={{ marginBottom: '1.5rem' }}>
              <summary style={{ color: '#7aa5c4', cursor: 'pointer', fontSize: '0.9rem' }}>
                Advanced: SMTP host / port (auto-detected)
              </summary>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: '0.9rem' }}>SMTP Host</label>
                  <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '0.9rem' }}>Port</label>
                  <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} style={inputStyle} />
                </div>
              </div>
            </details>

            <button type="submit" style={btnStyle}>
              Save Email Settings
            </button>
          </form>
        </div>

        {/* Calendar Integration */}
        <div style={cardStyle}>
          <h2 style={{ color: '#e8f1f8', fontSize: '1.8rem', marginBottom: '0.5rem' }}>
            📅 Calendar Integration
          </h2>
          <p style={{ color: '#7aa5c4', marginBottom: '1.5rem', marginTop: 0 }}>
            Connect Google Calendar to auto-add bookings when you mark a venue as Booked.
          </p>

          {calendarSaveMsg && (
            <div style={{
              padding: '0.75rem 1rem',
              marginBottom: '1.5rem',
              borderRadius: '8px',
              background: calendarSaveMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)',
              border: `1px solid ${calendarSaveMsg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}`,
              color: calendarSaveMsg.ok ? '#22c55e' : '#f87171',
              fontWeight: 600,
              fontSize: 14,
            }}>
              {calendarSaveMsg.text}
            </div>
          )}

          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(74,133,200,0.15)',
            borderRadius: '10px',
            padding: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" fill="rgba(74,133,200,0.2)" stroke="rgba(74,133,200,0.5)" strokeWidth="1.5"/>
                  <path d="M8 2v4M16 2v4M3 10h18" stroke="rgba(74,133,200,0.8)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span style={{ color: '#e8f1f8', fontWeight: 700, fontSize: 15 }}>Google Calendar</span>
                {googleConnected && (
                  <span style={{
                    background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                    border: '1px solid rgba(34,197,94,0.3)',
                    borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700,
                  }}>Connected</span>
                )}
              </div>
              <p style={{ color: '#7aa5c4', margin: 0, fontSize: 13 }}>
                {googleConnected
                  ? 'Google Calendar is connected. Bookings are added automatically.'
                  : 'Connect to read events and automatically add show bookings.'}
              </p>
            </div>

            <div style={{ flexShrink: 0 }}>
              {googleConnected ? (
                <button
                  onClick={async () => {
                    if (!confirm('Disconnect Google Calendar?')) return;
                    try {
                      await supabase
                        .from('user_calendar_settings')
                        .update({ is_active: false })
                        .eq('user_id', user.id)
                        .eq('calendar_type', 'google_oauth');
                      setGoogleConnected(false);
                      setCalendarSaveMsg({ ok: true, text: 'Google Calendar disconnected.' });
                    } catch {
                      setCalendarSaveMsg({ ok: false, text: 'Failed to disconnect.' });
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    background: 'rgba(248,113,113,0.1)',
                    border: '1px solid rgba(248,113,113,0.3)',
                    borderRadius: 6, color: '#f87171',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => {
                    window.location.href = '/api/auth/google-calendar';
                  }}
                  style={{
                    padding: '8px 20px',
                    background: 'linear-gradient(135deg, #3a7fc1, #2563a8)',
                    border: 'none',
                    borderRadius: 6, color: 'white',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Connect Google Calendar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
