import { useState } from 'react';
import ProtectedRoute from '../components/ProtectedRoute';
import Dashboard from '../components/Dashboard';
import BookingRunManager from '../components/BookingRunManager';

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
    <>
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

        .western-card:hover {
          box-shadow: 0 4px 12px rgba(93, 78, 55, 0.15);
          transition: box-shadow 0.3s ease;
        }

        .btn-primary {
          background-color: var(--leather-brown);
          color: white;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          border: none;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .btn-primary:hover {
          background-color: var(--saddle-brown);
        }

        .btn-primary:disabled {
          background-color: var(--warm-grey);
          cursor: not-allowed;
        }

        .btn-secondary {
          background-color: var(--warm-grey);
          color: var(--charcoal);
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          border: 1px solid var(--light-grey);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-secondary:hover {
          background-color: var(--light-grey);
        }

        .btn-accent {
          background-color: var(--accent-rust);
          color: white;
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          border: none;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .btn-accent:hover {
          background-color: #9a3608;
        }

        .btn-accent:disabled {
          background-color: var(--warm-grey);
          cursor: not-allowed;
        }

        .grid-3 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1.5rem;
        }

        h1, h2, h3 {
          color: var(--charcoal);
          font-weight: 700;
          margin: 0;
        }

        h1 { font-size: 2.5rem; }
        h2 { font-size: 1.75rem; }
        h3 { font-size: 1.25rem; }
      `}</style>

      {/* Header */}
      <div style={{
        backgroundColor: 'var(--leather-brown)',
        color: 'white',
        padding: '1.5rem 0',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        marginBottom: '0'
      }}>
        <div className="western-container">
          <h1 style={{ color: 'white', marginBottom: '0.5rem' }}>
            🎸 Camel Ranch Booking
          </h1>
          <p style={{ color: 'var(--tan-brown)', margin: 0 }}>
            Better Than Nothin - Professional Venue Management
          </p>
        </div>
      </div>

      <div className="western-container">
        {/* Navigation Tabs */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '2px solid var(--light-grey)',
          marginBottom: '2rem',
          marginTop: '2rem',
          overflowX: 'auto'
        }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            style={{
              padding: '1rem 2rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'dashboard' ? '3px solid var(--leather-brown)' : '3px solid transparent',
              color: activeTab === 'dashboard' ? 'var(--leather-brown)' : 'var(--slate-grey)',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.2s ease',
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
              borderBottom: activeTab === 'booking-runs' ? '3px solid var(--leather-brown)' : '3px solid transparent',
              color: activeTab === 'booking-runs' ? 'var(--leather-brown)' : 'var(--slate-grey)',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.2s ease',
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
              borderBottom: activeTab === 'campaigns' ? '3px solid var(--leather-brown)' : '3px solid transparent',
              color: activeTab === 'campaigns' ? 'var(--leather-brown)' : 'var(--slate-grey)',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            🎯 Booking Campaigns
          </button>

          <button
            onClick={() => setActiveTab('venues')}
            style={{
              padding: '1rem 2rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'venues' ? '3px solid var(--leather-brown)' : '3px solid transparent',
              color: activeTab === 'venues' ? 'var(--leather-brown)' : 'var(--slate-grey)',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            📍 Venue Database
          </button>

          <button
            onClick={() => setActiveTab('emails')}
            style={{
              padding: '1rem 2rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'emails' ? '3px solid var(--leather-brown)' : '3px solid transparent',
              color: activeTab === 'emails' ? 'var(--leather-brown)' : 'var(--slate-grey)',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            📧 Email Templates
          </button>

          <button
            onClick={() => setActiveTab('social')}
            style={{
              padding: '1rem 2rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'social' ? '3px solid var(--leather-brown)' : '3px solid transparent',
              color: activeTab === 'social' ? 'var(--leather-brown)' : 'var(--slate-grey)',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            📱 Social Media
          </button>
        </div>

        {/* Content */}
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'booking-runs' && <BookingRunManager />}
        {activeTab !== 'dashboard' && activeTab !== 'booking-runs' && (
          <div className="western-card" style={{ textAlign: 'center', padding: '3rem' }}>
            <h2 style={{ marginBottom: '1rem' }}>🚧 Coming Soon</h2>
            <p style={{ color: 'var(--slate-grey)' }}>This feature is under development.</p>
          </div>
        )}
      </div>
    </>
  );
}

