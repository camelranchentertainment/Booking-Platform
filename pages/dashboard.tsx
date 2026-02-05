import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<any>(null);
  const [bandProfile, setBandProfile] = useState<any>(null);
  const [navigationData, setNavigationData] = useState<any>(null);

  useEffect(() => {
    checkAuth();
  }, [router]);

  const checkAuth = async () => {
    // Check Supabase auth
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      // Fallback to localStorage for existing users
      const loggedInUser = localStorage.getItem('loggedInUser');
      if (!loggedInUser) {
        router.push('/login');
        return;
      }
      setUser(JSON.parse(loggedInUser));
      return;
    }

    setUser(session.user);
    loadBandProfile(session.user.id);
  };

  const loadBandProfile = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('band_profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (data) {
        setBandProfile(data);
      }
    } catch (error) {
      console.error('Error loading band profile:', error);
    }
  };

  if (!user) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        color: '#5D4E37' 
      }}>
        Loading...
      </div>
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('loggedInUser');
    router.push('/login');
  };

  const handleNavigate = (tab: string, data?: any) => {
    setActiveTab(tab);
    setNavigationData(data);
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'campaigns', label: 'Campaign Manager', icon: '🎯' },
    { id: 'contact-info', label: 'Contact Info', icon: '📧' },
    { id: 'emails', label: 'Email Templates', icon: '✉️' },
    { id: 'social', label: 'Social Media', icon: '📱' },
    { id: 'calendar', label: 'Calendar', icon: '📅' },
    { id: 'venue-database', label: 'Venue Database', icon: '🗂️' }
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F0' }}>
      {/* Header */}
      <div style={{
        background: '#5D4E37',
        color: 'white',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ 
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '1rem 2rem'
        }}>
          {/* Top Row: Camel Ranch Booking + User Menu */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: bandProfile ? '1rem' : 0
          }}>
            <div style={{ fontSize: '1.2rem', fontWeight: '600', opacity: 0.9 }}>
              Camel Ranch Booking
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                {user.email}
              </span>
              <a
                href="/settings"
                style={{
                  padding: '0.5rem 1rem',
                  background: '#5D4E37',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  textDecoration: 'none',
                  display: 'inline-block'
                }}
              >
                ⚙️ Settings
              </a>
              <button
                onClick={handleLogout}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#708090',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                Logout
              </button>
            </div>
          </div>

          {/* Band Name Row (only if band profile exists) */}
          {bandProfile && (
            <div style={{ 
              textAlign: 'center',
              padding: '1rem 0'
            }}>
              <h1 style={{ 
                margin: 0, 
                fontSize: '2.5rem',
                fontWeight: '700',
                color: 'white'
              }}>
                {bandProfile.band_name}
              </h1>
              {bandProfile.website && (
                <a
                  href={bandProfile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#C8A882',
                    fontSize: '1.05rem',
                    textDecoration: 'none',
                    marginTop: '0.5rem',
                    display: 'inline-block'
                  }}
                >
                  {bandProfile.website.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{
        background: 'white',
        borderBottom: '2px solid #D3D3D3',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          gap: '0.5rem',
          padding: '0 2rem',
          overflowX: 'auto'
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleNavigate(tab.id)}
              style={{
                padding: '1rem 1.5rem',
                background: activeTab === tab.id ? '#5D4E37' : 'transparent',
                color: activeTab === tab.id ? 'white' : '#708090',
                border: 'none',
                borderBottom: activeTab === tab.id ? '3px solid #B7410E' : '3px solid transparent',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: activeTab === tab.id ? '600' : '400',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: activeTab === 'dashboard' || activeTab === 'calendar' ? '0' : '2rem'
      }}>
        {activeTab === 'dashboard' && <Dashboard onNavigate={handleNavigate} />}
        {activeTab === 'calendar' && <BookingCalendar />}
        {activeTab === 'campaigns' && <CampaignManager initialData={navigationData} />}
        {activeTab === 'contact-info' && <VenueContactManager />}
        {activeTab === 'venue-database' && <VenueSearch />}
        {activeTab === 'emails' && <EmailTemplateManager />}
        {activeTab === 'social' && <SocialMediaCampaign />}
      </div>
    </div>
  );
}
