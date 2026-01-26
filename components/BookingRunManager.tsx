'use client';

import { useState, useEffect } from 'react';
import { getBookingRuns, createBookingRun, deleteBookingRun } from '../lib/supabase';

interface BookingRun {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  target_states: string[];
  status: string;
  notes?: string;
  created_at: string;
}

export default function BookingRunManager() {
  const [bookingRuns, setBookingRuns] = useState<BookingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  const [newRun, setNewRun] = useState({
    name: '',
    start_date: '',
    end_date: '',
    target_states: '',
    notes: ''
  });

  useEffect(() => {
    loadBookingRuns();
  }, []);

  const loadBookingRuns = async () => {
    try {
      setLoading(true);
      const data = await getBookingRuns();
      setBookingRuns(data || []);
    } catch (error) {
      console.error('Error loading booking runs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createBookingRun({
        name: newRun.name,
        start_date: newRun.start_date,
        end_date: newRun.end_date,
        target_states: newRun.target_states.split(',').map(s => s.trim()),
        status: 'planning',
        notes: newRun.notes || null
      });
      
      setShowCreateForm(false);
      setNewRun({
        name: '',
        start_date: '',
        end_date: '',
        target_states: '',
        notes: ''
      });
      loadBookingRuns();
      alert('Booking run created successfully!');
    } catch (error) {
      console.error('Error creating booking run:', error);
      alert('Error creating booking run. Please try again.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      try {
        await deleteBookingRun(id);
        loadBookingRuns();
        alert('Booking run deleted successfully!');
      } catch (error) {
        console.error('Error deleting booking run:', error);
        alert('Error deleting booking run. Please try again.');
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#87AE73';
      case 'completed':
        return '#708090';
      case 'planning':
        return '#B7410E';
      default:
        return '#5D4E37';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDuration = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const weeks = Math.floor(days / 7);
    return weeks > 0 ? `${weeks} week${weeks > 1 ? 's' : ''}` : `${days} day${days > 1 ? 's' : ''}`;
  };

  return (
    <div style={{ padding: '2rem' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h2 style={{ color: '#5D4E37', margin: 0 }}>Booking Runs</h2>
          <p style={{ color: '#708090', margin: '0.5rem 0 0 0' }}>
            Create and manage your tour booking campaigns
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          style={{
            padding: '0.75rem 1.5rem',
            background: showCreateForm ? '#708090' : '#5D4E37',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '1rem'
          }}
        >
          {showCreateForm ? 'Cancel' : '+ New Booking Run'}
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div style={{
          background: '#F5F5F0',
          padding: '2rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          border: '2px solid #5D4E37'
        }}>
          <h3 style={{ color: '#5D4E37', marginTop: 0 }}>Create New Booking Run</h3>
          <form onSubmit={handleCreateRun}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Run Name *
                </label>
                <input
                  type="text"
                  required
                  value={newRun.name}
                  onChange={(e) => setNewRun({...newRun, name: e.target.value})}
                  placeholder="e.g., Spring 2026 Arkansas Tour"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    border: '1px solid #D3D3D3'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Start Date *
                </label>
                <input
                  type="date"
                  required
                  value={newRun.start_date}
                  onChange={(e) => setNewRun({...newRun, start_date: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    border: '1px solid #D3D3D3'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                  End Date *
                </label>
                <input
                  type="date"
                  required
                  value={newRun.end_date}
                  onChange={(e) => setNewRun({...newRun, end_date: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    border: '1px solid #D3D3D3'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Target States *
                </label>
                <input
                  type="text"
                  required
                  value={newRun.target_states}
                  onChange={(e) => setNewRun({...newRun, target_states: e.target.value})}
                  placeholder="AR, MO, OK, KS (comma separated)"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    border: '1px solid #D3D3D3'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Notes
                </label>
                <textarea
                  value={newRun.notes}
                  onChange={(e) => setNewRun({...newRun, notes: e.target.value})}
                  rows={3}
                  placeholder="Add any notes about this booking run..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    border: '1px solid #D3D3D3',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              style={{
                marginTop: '1.5rem',
                padding: '0.75rem 2rem',
                background: '#5D4E37',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '1rem'
              }}
            >
              Create Booking Run
            </button>
          </form>
        </div>
      )}

      {/* Booking Runs List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#708090' }}>
          Loading booking runs...
        </div>
      ) : bookingRuns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#708090' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📅</div>
          <p>No booking runs yet. Create your first one to get started!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {bookingRuns.map((run) => (
            <div
              key={run.id}
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                border: '2px solid #D3D3D3',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ color: '#5D4E37', margin: '0 0 0.5rem 0' }}>{run.name}</h3>
                  <div style={{ display: 'flex', gap: '2rem', color: '#708090', fontSize: '0.95rem' }}>
                    <span>📅 {formatDate(run.start_date)} - {formatDate(run.end_date)}</span>
                    <span>⏱️ {getDuration(run.start_date, run.end_date)}</span>
                    <span>🗺️ {run.target_states.join(', ')}</span>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{
                    padding: '0.5rem 1rem',
                    background: getStatusColor(run.status),
                    color: 'white',
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    textTransform: 'uppercase'
                  }}>
                    {run.status}
                  </div>
                  
                  <button
                    onClick={() => handleDelete(run.id, run.name)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#C33',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {run.notes && (
                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: '#F5F5F0',
                  borderRadius: '4px',
                  color: '#708090',
                  fontSize: '0.9rem'
                }}>
                  <strong>Notes:</strong> {run.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
