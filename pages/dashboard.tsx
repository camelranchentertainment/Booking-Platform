import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../lib/supabase';
import Dashboard from '../components/Dashboard';
import VenueSearch from '../components/VenueSearch';
import CampaignManager from '../components/CampaignManager';
import EmailTemplateManager from '../components/EmailTemplateManager';
import SocialMediaCampaign from '../components/SocialMediaCampaign';
import VenueContactManager from '../components/VenueContactManager';
import BookingCalendar from '../components/BookingCalendar';

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab]       = useState('dashboard');
  const [user, setUser]                 = useState<any>(null);
  const [bandProfile, setBandProfile]   = useState<any>(null);
  const [navigationData, setNavigationData] = useState<any>(null);
  const [menuOpen, setMenuOpen]         = useState(false);

  useEffect(() => { checkAuth(); }, [router]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const local = localStorage.getItem('loggedInUser');
      if (!local) { router.push('/'); return; }
      setUser(JSON.parse(local));
      return;
    }
    setUser(session.user);
    loadBandProfile(session.user.id);
  };

  const loadBandProfile = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('band_profiles').select('*').eq('id', userId).single();
      if (data) setBandProfile(data);
    } catch (e) { console.error('Error loading band profile:', e); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('loggedInUser');
    router.push('/');
  };

  const handleNavigate = (tab: string, data?: any) => {
    setActiveTab(tab);
    setNavigationData(data);
  };

  const tabs = [
    { id: 'dashboard',      label: 'Dashboard'       },
    { id: 'campaigns',      label: 'Runs & Tours'     },
    { id: 'venue-database', label: 'Venue Search'     },
    { id: 'emails',         label: 'Email Templates'  },
    { id: 'social',         label: 'Social Media'     },
    { id: 'calendar',       label: 'Calendar'         },
    { id: 'contact-info',   label: 'Venue List'       },
  ];

  // ─── Loading state ───────────────────────────────────────────────────────────
  if (!user) {
    return (
      <>
        <Head>
          <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito:wght@400;600;700&display=swap" rel="stylesheet" />
        </Head>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh',
          background: '#030d18',
          fontFamily: "'Nunito', sans-serif", color: '#7aa5c4', fontSize: 16,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
              background: 'linear-gradient(135deg, #3a7fc1, #2563a8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Bebas Neue', cursive", fontSize: 26, color: '#e8f1f8',
            }}>C</div>
            Loading…
          </div>
        </div>
      </>
    );
  }

  const displayName = bandProfile?.band_name || user?.email || 'My Band';
  const userEmail   = user?.email || '';

  return (
    <>
      <Head>
        <title>{displayName} — Camel Ranch Booking</title>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Nunito:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #030d18; font-family: 'Nunito', sans-serif; }

        /* ── Tab bar ── */
        .crb-tab {
          padding: 14px 22px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(74,133,200,0.1);
          border-radius: 8px;
          margin: 8px 4px;
          color: rgba(255,255,255,0.55);
          font-family: 'Nunito', sans-serif;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
          letter-spacing: 0.01em;
          transition: background .18s, color .18s, border-color .18s, box-shadow .18s;
        }
        .crb-tab:hover {
          background: rgba(74,133,200,0.1);
          color: #ffffff;
          border-color: rgba(74,133,200,0.3);
        }
        .crb-tab.active {
          background: rgba(58,127,193,0.18);
          color: #ffffff;
          border-color: rgba(74,133,200,0.5);
          box-shadow: 0 0 16px rgba(58,127,193,0.2);
        }

        /* ── User menu dropdown ── */
        .user-menu {
          position: absolute; top: calc(100% + 8px); right: 0;
          background: #091828;
          border: 1px solid rgba(74,133,200,0.2);
          border-radius: 12px;
          padding: 8px;
          min-width: 200px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.5);
          z-index: 50;
        }
        .user-menu-item {
          display: block; width: 100%;
          padding: 10px 14px;
          background: transparent; border: none;
          border-radius: 8px;
          color: #7aa5c4; font-family: 'Nunito', sans-serif;
          font-size: 14px; font-weight: 600;
          cursor: pointer; text-align: left; text-decoration: none;
          transition: background .15s, color .15s;
        }
        .user-menu-item:hover {
          background: rgba(74,133,200,0.1); color: #e8f1f8;
        }
        .user-menu-item.danger:hover {
          background: rgba(248,113,113,0.1); color: #f87171;
        }

        /* ── Scrollbar ── */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #030d18; }
        ::-webkit-scrollbar-thumb { background: rgba(74,133,200,0.2); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(74,133,200,0.4); }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#030d18', color: '#e8f1f8' }}>

        {/* ── Top Header ──────────────────────────────────────────────────────── */}
        <header style={{
          background: 'rgba(3,13,24,0.97)',
          borderBottom: '1px solid rgba(74,133,200,0.12)',
          position: 'sticky', top: 0, zIndex: 40,
          backdropFilter: 'blur(16px)',
        }}>
          {/* Brand + User row */}
          <div style={{
            maxWidth: 1400, margin: '0 auto',
            padding: '0 2rem',
            height: 68,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'linear-gradient(135deg, #3a7fc1, #2563a8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Bebas Neue', cursive", fontSize: 22, color: '#e8f1f8',
              }}>C</div>
              <span style={{
                fontFamily: "'Bebas Neue', cursive",
                fontSize: '1.5rem', letterSpacing: '0.07em', color: '#e8f1f8',
              }}>Camel Ranch Booking</span>
            </div>

            {/* Band name — centre */}
            {bandProfile?.band_name && (
              <div style={{
                position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                fontFamily: "'Bebas Neue', cursive",
                fontSize: '1.9rem', letterSpacing: '0.09em',
                color: '#ffffff',
                textShadow: '0 0 24px rgba(74,133,200,0.5)',
              }}>
                {bandProfile.band_name}
              </div>
            )}

            {/* User menu */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'rgba(74,133,200,0.08)',
                  border: '1px solid rgba(74,133,200,0.2)',
                  borderRadius: 8, padding: '6px 12px',
                  color: '#7aa5c4', cursor: 'pointer',
                  fontFamily: "'Nunito', sans-serif",
                  fontSize: 13, fontWeight: 600,
                  transition: 'background .2s',
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(74,133,200,0.14)')}
                onMouseOut={e => (e.currentTarget.style.background = 'rgba(74,133,200,0.08)')}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3a7fc1, #2563a8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#e8f1f8',
                }}>
                  {userEmail.charAt(0).toUpperCase()}
                </span>
                <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userEmail}
                </span>
                <span style={{ fontSize: 10, opacity: 0.6 }}>▼</span>
              </button>

              {menuOpen && (
                <>
                  {/* Click-away overlay */}
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="user-menu">
                    <div style={{
                      padding: '8px 14px 10px',
                      borderBottom: '1px solid rgba(74,133,200,0.1)',
                      marginBottom: 6,
                    }}>
                      <div style={{ color: '#e8f1f8', fontWeight: 700, fontSize: 13 }}>
                        {bandProfile?.band_name || 'My Band'}
                      </div>
                      <div style={{ color: '#3d6285', fontSize: 12, marginTop: 2 }}>{userEmail}</div>
                    </div>
                    <a href="/settings" className="user-menu-item" onClick={() => setMenuOpen(false)}>
                      ⚙️&nbsp; Settings
                    </a>
                    <button className="user-menu-item danger" onClick={handleLogout}>
                      ← &nbsp;Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Nav Tab Bar ─────────────────────────────────────────────────── */}
          <div style={{
            maxWidth: 1400, margin: '0 auto',
            padding: '0 1.5rem',
            display: 'flex', overflowX: 'auto', gap: 2,
            borderTop: '1px solid rgba(74,133,200,0.07)',
          }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`crb-tab${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => handleNavigate(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {/* ── Page Content ────────────────────────────────────────────────────── */}
        <main style={{
          maxWidth: 1400, margin: '0 auto',
          padding: activeTab === 'dashboard' || activeTab === 'calendar' ? 0 : '2rem',
        }}>
          {activeTab === 'dashboard'      && <Dashboard onNavigate={handleNavigate} />}
          {activeTab === 'calendar'       && <BookingCalendar />}
          {activeTab === 'campaigns'      && <CampaignManager initialData={navigationData} />}
          {activeTab === 'contact-info'   && <VenueContactManager />}
          {activeTab === 'venue-database' && <VenueSearch />}
          {activeTab === 'emails'         && <EmailTemplateManager />}
          {activeTab === 'social'         && <SocialMediaCampaign />}
        </main>
      </div>
    </>
  );
}
