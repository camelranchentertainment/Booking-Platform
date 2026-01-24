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
  const [activeTab, setActiveTab] = useState('dashboard');

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
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '2rem' }}>
        {activeTab === 'dashboard' && <Dashboard />}
      </div>
    </div>
  );
}

