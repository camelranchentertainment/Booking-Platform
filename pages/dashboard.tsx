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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'booking-runs' | 'campaigns' | 'venues' | 'emails' | 'social'>('dashboard');

  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F0' }}>
      {/* Global Styles */}
      <style jsx global>{`
        :root {
          --leather-brown: #5D4E37;
          --saddle-brown: #8B7355;
          --tan-brown: #C19A6B;
          --charcoal: #36454F;
          --slate-grey: #708090;
          --warm-grey: #A8A8A8;
          --light-grey: #D3D3D3;
          --soft-white: #F5F5F0;
          --accent-rust: #B7410E;
        }

        body {
          background-color: var(--soft-white);
          color: var(--charcoal);
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        .western-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }

        .western-card {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 2px 8px rgba(93, 78, 55, 0.1);
          border: 1px solid var(--light-grey);
          margin-bottom: 2rem;
        }

        h1, h2, h3 {
          color: var(--charcoal);
          font-weight: 700;
          margin: 0;
        }
      `}</style>

      {/* Header */}
      <div style={{
        backgroundColor: '#5D4E37',
        color: 'white',
        padding: '1.5rem 0',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 2rem'
        }}>
          <h1 style={{ color: 'white', marginBottom: '0.5rem', fontSize: '2rem' }}>
            🎸 Camel Ranch Booking
          </h1>
          <p style={{ color: '#C19A6B', margin: 0 }}>
            Better Than Nothin' - Professional Venue Management
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '0 2rem'
      }}>
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '2px solid #D3D3D3',
          marginTop: '2rem',
          marginBottom: '2rem',
          overflowX: 'auto'
        }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            style={{
              padding: '1rem 2rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'dashboard' ? '3px solid #5D4E37' : '3px solid transparent',
              color: activeTab === 'dashboard' ? '#5D4E37' : '#708090',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem',
              whiteSpace: 'nowrap'
            }}
          >
            📊 Dashboard
          </button>

          <button
            onClick={() => setActiveTab('booking-runs')}
            style={{
              padding: '1rem 2rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'booking-runs' ? '3px solid #5D4E37' : '3px solid transparent',
              color: activeTab === 'booking-runs' ? '#5D4E37' : '#708090',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem',
              whiteSpace: 'nowrap'
            }}
          >
            🎸 Booking Runs
          </button>

          <button
            onClick={() => setActiveTab('campaigns')}
            style={{
              padding: '1rem 2rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'campaigns' ? '3px solid #5D4E37' : '3px solid transparent',
              color: activeTab === 'campaigns' ? '#5D4E37' : '#708090',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem',
              whiteSpace: 'nowrap'
            }}
          >
            🎯 Campaigns
          </button>

          <button
            onClick={() => setActiveTab('venues')}
            style={{
              padding: '1rem 2rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'venues' ? '3px solid #5D4E37' : '3px solid transparent',
              color: activeTab === 'venues' ? '#5D4E37' : '#708090',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem',
              whiteSpace: 'nowrap'
            }}
          >
            📍 Venues
          </button>

          <button
            onClick={() => setActiveTab('emails')}
            style={{
              padding: '1rem 2rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'emails' ? '3px solid #5D4E37' : '3px solid transparent',
              color: activeTab === 'emails' ? '#5D4E37' : '#708090',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem',
              whiteSpace: 'nowrap'
            }}
          >
            📧 Emails
          </button>

          <button
            onClick={() => setActiveTab('social')}
            style={{
              padding: '1rem 2rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'social' ? '3px solid #5D4E37' : '3px solid transparent',
              color: activeTab === 'social' ? '#5D4E37' : '#708090',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem',
              whiteSpace: 'nowrap'
            }}
          >
            📱 Social
          </button>
        </div>

        {/* Content Area */}
        <div>
          {activeTab === 'dashboard' && <Dashboard />}
          {(activeTab === 'booking-runs' || activeTab === 'campaigns' || activeTab === 'venues' || activeTab === 'emails' || activeTab === 'social') && (
            <div style={{
              background: 'white',
              borderRadius: '8px',
              padding: '3rem',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(93, 78, 55, 0.1)'
            }}>
              <h2 style={{ marginBottom: '1rem', color: '#5D4E37' }}>🚧 Coming Soon</h2>
              <p style={{ color: '#708090' }}>This feature is under development.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

