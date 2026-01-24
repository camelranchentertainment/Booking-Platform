import { useState } from 'react';
import ProtectedRoute from '../components/ProtectedRoute';
import Dashboard from '../components/Dashboard';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'venues' | 'campaigns' | 'booking-runs' | 'emails' | 'social'>('dashboard');

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F0' }}>
      {/* Header */}
      <div style={{
        background: '#5D4E37',
        color: 'white',
        padding: '1.5rem 2rem'
      }}>
        <h1 style={{ margin: 0, fontSize: '2rem' }}>🎸 Camel Ranch Booking</h1>
        <p style={{ margin: '0.5rem 0 0 0', color: '#C19A6B' }}>Better Than Nothin - Professional Venue Management</p>
      </div>

      {/* Tabs */}
      <div style={{
        background: 'white',
        borderBottom: '2px solid #D3D3D3',
        padding: '0 2rem'
      }}>
        <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto' }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            style={{
              padding: '1rem 2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'dashboard' ? '3px solid #5D4E37' : '3px solid transparent',
              color: activeTab === 'dashboard' ? '#5D4E37' : '#708090',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            📊 Dashboard
          </button>

          <button
            onClick={() => setActiveTab('venues')}
            style={{
              padding: '1rem 2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'venues' ? '3px solid #5D4E37' : '3px solid transparent',
              color: activeTab === 'venues' ? '#5D4E37' : '#708090',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            🔍 Venue Search
          </button>

          <button
            onClick={() => setActiveTab('campaigns')}
            style={{
              padding: '1rem 2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'campaigns' ? '3px solid #5D4E37' : '3px solid transparent',
              color: activeTab === 'campaigns' ? '#5D4E37' : '#708090',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            🎯 Campaigns
          </button>

          <button
            onClick={() => setActiveTab('booking-runs')}
            style={{
              padding: '1rem 2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'booking-runs' ? '3px solid #5D4E37' : '3px solid transparent',
              color: activeTab === 'booking-runs' ? '#5D4E37' : '#708090',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            🎸 Booking Runs
          </button>

          <button
            onClick={() => setActiveTab('emails')}
            style={{
              padding: '1rem 2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'emails' ? '3px solid #5D4E37' : '3px solid transparent',
              color: activeTab === 'emails' ? '#5D4E37' : '#708090',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            📧 Emails
          </button>

          <button
            onClick={() => setActiveTab('social')}
            style={{
              padding: '1rem 2rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'social' ? '3px solid #5D4E37' : '3px solid transparent',
              color: activeTab === 'social' ? '#5D4E37' : '#708090',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            📱 Social Media
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '2rem' }}>
        {activeTab === 'dashboard' && <Dashboard />}
        
        {activeTab !== 'dashboard' && (
          <div style={{
            background: 'white',
            padding: '3rem',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <h2 style={{ color: '#5D4E37', marginBottom: '1rem' }}>
             import Dashboard from '../components/Dashboard';
import BookingRuns from '../components/BookingRuns';
import VenueSearch from '../components/VenueSearch';
import CampaignManager from '../components/CampaignManager';
import EmailTemplates from '../components/EmailTemplates';
import SocialMedia from '../components/SocialMedia';
            </h2>
            <p style={{ color: '#708090' }}>Building this component now...</p>
          </div>
        )}
      </div>
    </div>
  );
}

