import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Dashboard from '../components/Dashboard';
import BookingRunManager from '../components/BookingRunManager';
import VenueSearch from '../components/VenueSearch';
import CampaignManager from '../components/CampaignManager';
import EmailTemplates from '../components/EmailTemplates';
import SocialMedia from '../components/SocialMedia';

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const loggedInUser = localStorage.getItem('loggedInUser');
    if (!loggedInUser) {
      router.push('/');
      return;
    }
    setUser(JSON.parse(loggedInUser));
  }, [router]);

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

  const handleLogout = () => {
    localStorage.removeItem('loggedInUser');
    router.push('/');
  };

  const tabs = [
    { id: 'dashboard', label: '📊 Dashboard', icon: '📊' },
    { id: 'booking-runs', label: '📅 Booking Runs', icon: '📅' },
    { id: 'venue-search', label: '🔍 Venue Search', icon: '🔍' },
    { id: 'campaigns', label: '📧 Campaign Manager', icon: '📧' },
    { id: 'emails', label: '✉️ Email Templates', icon: '✉️' },
    { id: 'social', label: '📱 Social Media', icon: '📱' }
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F0' }}>
      {/* Header */}
      <div style={{
        background: '#5D4E37',
        color: 'white',
        padding: '1.5rem 2rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          maxWidth: '1400px',
          margin: '0 auto'
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.8rem' }}>🎸 Camel Ranch Booking</h1>
            <p style={{ margin: '0.25rem 0 0 0', opacity: 0.9, fontSize: '0.9rem' }}>
              Better Than Nothin' Tour Management
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.9rem' }}>👤 {user.email}</span>
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
          padding: '0 2rem'
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '1rem 1.5rem',
                background: activeTab === tab.id ? '#5D4E37' : 'transparent',
                color: activeTab === tab.id ? 'white' : '#708090',
                border: 'none',
                borderBottom: activeTab === tab.id ? '3px solid #B7410E' : '3px solid transparent',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: activeTab === tab.id ? '600' : '400',
                transition: 'all 0.2s ease'
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
        padding: '2rem'
      }}>
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'booking-runs' && <BookingRunManager />}
        {activeTab === 'venue-search' && <VenueSearch />}
        {activeTab === 'campaigns' && <CampaignManager />}
        {activeTab === 'emails' && <EmailTemplates />}
        {activeTab === 'social' && <SocialMedia />}
      </div>
    </div>
  );
}

