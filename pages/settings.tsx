import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';
import BookingTemplateEditor from '../components/BookingTemplateEditor';

interface AuthUser { id: string; email: string; }

type Tab = 'template' | 'email' | 'calendar' | 'account';

export default function Settings() {
  const router = useRouter();
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [loaded,  setLoaded]  = useState(false);
  const [tab,     setTab]     = useState<Tab>('template');

  // Account (band_profiles — legacy display name)
  const [bandName,       setBandName]       = useState('');
  const [profileSaveMsg, setProfileSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // SMTP
  const [smtpHost,     setSmtpHost]     = useState('smtp.gmail.com');
  const [smtpPort,     setSmtpPort]     = useState('587');
  const [smtpEmail,    setSmtpEmail]    = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [emailSaveMsg, setEmailSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Calendar
  const [googleConnected,   setGoogleConnected]   = useState(false);
  const [calendarSaveMsg,   setCalendarSaveMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      const stored = localStorage.getItem('loggedInUser');
      if (!stored) { router.push('/'); return; }
      const userData = JSON.parse(stored);
      setUser(userData);

      await Promise.all([
        loadBandName(userData.id),
        loadSmtpSettings(userData.id),
        loadCalendarSettings(userData.id),
      ]);

      const params = new URLSearchParams(window.location.search);
      const calResult = params.get('calendar');
      if (calResult === 'connected') {
        setTab('calendar');
        setGoogleConnected(true);
        setCalendarSaveMsg({ ok: true, text: '✓ Google Calendar connected!' });
        router.replace('/settings', undefined, { shallow: true });
      } else if (calResult === 'error') {
        setTab('calendar');
        setCalendarSaveMsg({ ok: false, text: `✗ ${params.get('message') || 'Connection failed'}` });
        router.replace('/settings', undefined, { shallow: true });
      }
    } catch (e) { console.error('Settings init error:', e); }
    finally { setLoaded(true); }
  };

  const loadBandName = async (userId: string) => {
    const { data } = await supabase.from('band_profiles').select('band_name').eq('id', userId).maybeSingle();
    if (data) setBandName(data.band_name || '');
  };

  const saveBandName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileSaveMsg(null);
    try {
      const { error } = await supabase.from('band_profiles').update({ band_name: bandName }).eq('id', user.id);
      if (error) throw error;
      setProfileSaveMsg({ ok: true, text: '✓ Saved!' });
    } catch (err: unknown) {
      setProfileSaveMsg({ ok: false, text: `✗ ${err instanceof Error ? err.message : 'Error'}` });
    }
  };

  const loadSmtpSettings = async (userId: string) => {
    const { data } = await supabase.from('user_email_settings').select('smtp_host, smtp_port, email_address, display_name').eq('user_id', userId).maybeSingle();
    if (data) {
      setSmtpHost(data.smtp_host || 'smtp.gmail.com');
      setSmtpPort(data.smtp_port?.toString() || '587');
      setSmtpEmail(data.email_address || '');
      setSmtpFromName(data.display_name || '');
    }
  };

  const saveEmailSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setEmailSaveMsg(null);
    try {
      const stored = JSON.parse(localStorage.getItem('loggedInUser') || '{}');
      const res = await fetch('/api/email/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(stored.token ? { Authorization: `Bearer ${stored.token}` } : {}) },
        body: JSON.stringify({ userId: user.id, provider: 'smtp', displayName: smtpFromName, emailAddress: smtpEmail, smtpHost, smtpPort, password: smtpPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setEmailSaveMsg({ ok: true, text: '✓ Email settings saved!' });
      setSmtpPassword('');
    } catch (err: unknown) {
      setEmailSaveMsg({ ok: false, text: `✗ ${err instanceof Error ? err.message : 'Error'}` });
    }
  };

  const loadCalendarSettings = async (userId: string) => {
    const { data } = await supabase.from('user_calendar_settings').select('calendar_type, is_active').eq('user_id', userId).maybeSingle();
    if (data?.calendar_type === 'google_oauth' && data.is_active !== false) setGoogleConnected(true);
  };

  if (!loaded) return <div style={{ padding: '2rem', color: '#7aa5c4', background: '#030d18', minHeight: '100vh' }}>Loading…</div>;
  if (!user)   return null;

  // ─── Shared styles ────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid rgba(74,133,200,0.2)', borderRadius: 7, background: 'rgba(255,255,255,0.05)', color: '#e8f1f8', fontSize: 14, boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'block', color: '#7aa5c4', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 };
  const fieldStyle: React.CSSProperties = { marginBottom: 16 };
  const cardStyle:  React.CSSProperties = { background: 'rgba(9,24,40,0.85)', border: '1px solid rgba(74,133,200,0.18)', borderRadius: 12, padding: '2rem' };
  const btnStyle:   React.CSSProperties = { padding: '10px 24px', background: 'linear-gradient(135deg,#3a7fc1,#2563a8)', border: 'none', borderRadius: 7, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'template', label: 'Booking Template' },
    { id: 'email',    label: 'Email'            },
    { id: 'calendar', label: 'Calendar'         },
    { id: 'account',  label: 'Account'          },
  ];

  return (
    <div style={{ background: '#030d18', minHeight: '100vh' }}>
      <style>{`
        .settings-tab { padding:10px 18px; border:none; background:transparent; color:#4a7a9b; font-size:14px; font-weight:600; cursor:pointer; border-bottom:2px solid transparent; transition:all .15s; white-space:nowrap; }
        .settings-tab:hover { color:#7aa5c4; }
        .settings-tab.active { color:#38bdf8; border-bottom-color:#38bdf8; }
        .settings-input:focus { border-color:rgba(74,133,200,0.6)!important; outline:none; box-shadow:0 0 0 3px rgba(74,133,200,0.1); }
      `}</style>

      {/* Header */}
      <div style={{ background: 'rgba(3,13,24,0.97)', padding: '1rem 2rem', borderBottom: '1px solid rgba(74,133,200,0.12)', backdropFilter: 'blur(16px)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a href="/dashboard" style={{ color: '#7aa5c4', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
            ← Dashboard
          </a>
          <span style={{ fontWeight: 700, color: '#e8f1f8', fontSize: 16 }}>Settings</span>
          <span style={{ color: '#4a7a9b', fontSize: 13 }}>{user.email}</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: 'rgba(3,13,24,0.8)', borderBottom: '1px solid rgba(74,133,200,0.1)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', paddingLeft: '2rem', display: 'flex', gap: 0, overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.id} className={`settings-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 2rem 4rem' }}>

        {/* ── Booking Template ─────────────────────────────────────────────── */}
        {tab === 'template' && (
          <div style={cardStyle}>
            <h2 style={{ color: '#e8f1f8', fontSize: '1.6rem', fontWeight: 700, marginBottom: 6, marginTop: 0 }}>
              Booking Inquiry Template
            </h2>
            <p style={{ color: '#4a7a9b', fontSize: 13, marginBottom: 24, marginTop: 0 }}>
              Set up your agent profile and per-band booking template. Saved fields auto-populate every inquiry email. Per-send fields (booker name, venue, dates) are filled at send time.
            </p>
            <BookingTemplateEditor userId={user.id} />
          </div>
        )}

        {/* ── Email ────────────────────────────────────────────────────────── */}
        {tab === 'email' && (
          <div style={{ ...cardStyle, maxWidth: 680 }}>
            <h2 style={{ color: '#e8f1f8', fontSize: '1.6rem', fontWeight: 700, marginBottom: 6, marginTop: 0 }}>
              Email Configuration
            </h2>
            <p style={{ color: '#4a7a9b', fontSize: 13, marginBottom: 20, marginTop: 0 }}>
              Configure outbound email so booking inquiries send from your address.
            </p>

            <div style={{ background: 'rgba(58,127,193,0.08)', border: '1px solid rgba(74,133,200,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#6baed6' }}>
              <strong>Gmail:</strong> Use an <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer" style={{ color: '#6baed6' }}>App Password</a> — not your regular password. Requires 2FA.
            </div>

            {emailSaveMsg && (
              <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, fontSize: 13, fontWeight: 600, background: emailSaveMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)', border: `1px solid ${emailSaveMsg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}`, color: emailSaveMsg.ok ? '#22c55e' : '#f87171' }}>
                {emailSaveMsg.text}
              </div>
            )}

            <form onSubmit={saveEmailSettings}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Your Email Address</label>
                <input className="settings-input" type="email" style={inputStyle} value={smtpEmail} required
                  placeholder="you@gmail.com"
                  onChange={e => {
                    setSmtpEmail(e.target.value);
                    const d = e.target.value.split('@')[1]?.toLowerCase() ?? '';
                    if (d === 'gmail.com' || d === 'googlemail.com')      { setSmtpHost('smtp.gmail.com'); setSmtpPort('587'); }
                    else if (['outlook.com','hotmail.com','live.com'].includes(d)) { setSmtpHost('smtp-mail.outlook.com'); setSmtpPort('587'); }
                    else if (d === 'yahoo.com')                           { setSmtpHost('smtp.mail.yahoo.com'); setSmtpPort('465'); }
                    else if (d === 'icloud.com' || d === 'me.com')        { setSmtpHost('smtp.mail.me.com'); setSmtpPort('587'); }
                    else if (d === 'protonmail.com' || d === 'proton.me') { setSmtpHost('smtp.protonmail.com'); setSmtpPort('587'); }
                    else if (d)                                           { setSmtpHost(`smtp.${d}`); setSmtpPort('587'); }
                  }} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>App Password</label>
                <input className="settings-input" type="password" style={inputStyle} value={smtpPassword} required placeholder="••••••••••••••••"
                  onChange={e => setSmtpPassword(e.target.value)} />
                <p style={{ color: '#4a7a9b', fontSize: 12, margin: '4px 0 0' }}>Gmail → Google Account → Security → App Passwords</p>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Display Name (From field)</label>
                <input className="settings-input" style={inputStyle} value={smtpFromName} placeholder="Camel Ranch Booking"
                  onChange={e => setSmtpFromName(e.target.value)} />
              </div>
              <details style={{ marginBottom: 20 }}>
                <summary style={{ color: '#4a7a9b', cursor: 'pointer', fontSize: 13 }}>Advanced: SMTP host / port (auto-detected)</summary>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 12 }}>
                  <div>
                    <label style={labelStyle}>SMTP Host</label>
                    <input className="settings-input" style={inputStyle} value={smtpHost} onChange={e => setSmtpHost(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Port</label>
                    <input className="settings-input" type="number" style={inputStyle} value={smtpPort} onChange={e => setSmtpPort(e.target.value)} />
                  </div>
                </div>
              </details>
              <button type="submit" style={btnStyle}>Save Email Settings</button>
            </form>
          </div>
        )}

        {/* ── Calendar ─────────────────────────────────────────────────────── */}
        {tab === 'calendar' && (
          <div style={{ ...cardStyle, maxWidth: 680 }}>
            <h2 style={{ color: '#e8f1f8', fontSize: '1.6rem', fontWeight: 700, marginBottom: 6, marginTop: 0 }}>
              Calendar Integration
            </h2>
            <p style={{ color: '#4a7a9b', fontSize: 13, marginBottom: 20, marginTop: 0 }}>
              Connect Google Calendar to auto-add bookings when you mark a venue as Booked.
            </p>

            {calendarSaveMsg && (
              <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, fontSize: 13, fontWeight: 600, background: calendarSaveMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)', border: `1px solid ${calendarSaveMsg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}`, color: calendarSaveMsg.ok ? '#22c55e' : '#f87171' }}>
                {calendarSaveMsg.text}
              </div>
            )}

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(74,133,200,0.15)', borderRadius: 10, padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ color: '#e8f1f8', fontWeight: 700, fontSize: 15 }}>Google Calendar</span>
                  {googleConnected && (
                    <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>Connected</span>
                  )}
                </div>
                <p style={{ color: '#4a7a9b', margin: 0, fontSize: 13 }}>
                  {googleConnected ? 'Bookings are added to your calendar automatically.' : 'Connect to read events and auto-add show bookings.'}
                </p>
              </div>
              <div>
                {googleConnected ? (
                  <button
                    onClick={async () => {
                      if (!confirm('Disconnect Google Calendar?')) return;
                      await supabase.from('user_calendar_settings').update({ is_active: false }).eq('user_id', user.id).eq('calendar_type', 'google_oauth');
                      setGoogleConnected(false);
                      setCalendarSaveMsg({ ok: true, text: 'Google Calendar disconnected.' });
                    }}
                    style={{ padding: '8px 16px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 6, color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Disconnect
                  </button>
                ) : (
                  <button onClick={() => { window.location.href = `/api/auth/google?userId=${user.id}`; }}
                    style={btnStyle}>
                    Connect Google Calendar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Account ──────────────────────────────────────────────────────── */}
        {tab === 'account' && (
          <div style={{ ...cardStyle, maxWidth: 480 }}>
            <h2 style={{ color: '#e8f1f8', fontSize: '1.6rem', fontWeight: 700, marginBottom: 6, marginTop: 0 }}>
              Account
            </h2>
            <p style={{ color: '#4a7a9b', fontSize: 13, marginBottom: 20, marginTop: 0 }}>
              Your login email and display name shown in the dashboard header.
            </p>

            {profileSaveMsg && (
              <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, fontSize: 13, fontWeight: 600, background: profileSaveMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)', border: `1px solid ${profileSaveMsg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(248,113,113,0.3)'}`, color: profileSaveMsg.ok ? '#22c55e' : '#f87171' }}>
                {profileSaveMsg.text}
              </div>
            )}

            <form onSubmit={saveBandName}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Login Email</label>
                <div style={{ ...inputStyle, color: '#4a7a9b', cursor: 'default' }}>{user.email}</div>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Display Name (dashboard header)</label>
                <input className="settings-input" style={inputStyle} value={bandName} required placeholder="Camel Ranch Booking"
                  onChange={e => setBandName(e.target.value)} />
              </div>
              <button type="submit" style={btnStyle}>Save</button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}
