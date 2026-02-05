'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Venue {
  id: string;
  name: string;
  email: string | null;
  city: string;
  state: string;
  address: string;
  phone: string | null;
}

export default function VenueContactManager() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadVenues();
  }, []);

  const loadVenues = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .order('name');

      if (error) throw error;
      setVenues(data || []);
    } catch (error) {
      console.error('Error loading venues:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTileClick = (venue: Venue) => {
    setSelectedVenue(venue);
    setEditEmail(venue.email || '');
    setEditPhone(venue.phone || '');
    setShowEditModal(true);
  };

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedVenue) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from('venues')
        .update({
          email: editEmail || null,
          phone: editPhone || null
        })
        .eq('id', selectedVenue.id);

      if (error) throw error;

      alert('✅ Contact info saved!');
      setShowEditModal(false);
      setSelectedVenue(null);
      await loadVenues();
    } catch (error) {
      console.error('Error saving contact info:', error);
      alert('Failed to save contact info');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: '#708090' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
        <p>Loading venues...</p>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        * { box-sizing: border-box; }
        .page-container {
          background: linear-gradient(135deg, #F5F5F0 0%, #E8E6E1 100%);
          min-height: 100vh;
          padding: 2rem;
        }
        .venue-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }
        .venue-tile {
          background: white;
          border-radius: 8px;
          padding: 1rem;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          border: 2px solid transparent;
        }
        .venue-tile:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0,0,0,0.12);
          border-color: #87AE73;
        }
        @media (max-width: 1200px) {
          .venue-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (max-width: 900px) {
          .venue-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 600px) {
          .venue-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="page-container">
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#5D4E37', margin: '0 0 0.5rem 0' }}>
              📧 Venue Contact Info
            </h1>
            <p style={{ color: '#708090', margin: 0 }}>
              Click any venue to add or update contact information
            </p>
          </div>

          {/* Venue Grid */}
          {venues.length === 0 ? (
            <div style={{ background: 'white', padding: '4rem', borderRadius: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏛️</div>
              <h3 style={{ fontSize: '1.5rem', color: '#5D4E37', margin: '0 0 0.5rem 0' }}>No venues yet</h3>
              <p style={{ color: '#708090' }}>Add venues from the Venue Database</p>
            </div>
          ) : (
            <div className="venue-grid">
              {venues.map((venue) => (
                <div
                  key={venue.id}
                  className="venue-tile"
                  onClick={() => handleTileClick(venue)}
                >
                  {/* Venue Name */}
                  <div style={{
                    fontSize: '1rem',
                    fontWeight: '700',
                    color: '#5D4E37',
                    marginBottom: '0.5rem',
                    lineHeight: '1.2',
                    minHeight: '2.4rem',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {venue.name}
                  </div>

                  {/* Location */}
                  <div style={{
                    fontSize: '0.85rem',
                    color: '#708090',
                    marginBottom: '0.75rem'
                  }}>
                    📍 {venue.city}, {venue.state}
                  </div>

                  {/* Status Badge */}
                  {venue.email ? (
                    <div style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.75rem',
                      background: 'rgba(135, 174, 115, 0.2)',
                      color: '#87AE73',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}>
                      ✓ Has Email
                    </div>
                  ) : (
                    <div style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.75rem',
                      background: 'rgba(183, 65, 14, 0.2)',
                      color: '#B7410E',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}>
                      Add Email
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit Modal */}
        {showEditModal && selectedVenue && (
          <div
            onClick={() => setShowEditModal(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '1rem'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'white',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '500px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
              }}
            >
              {/* Modal Header */}
              <div style={{
                padding: '1.5rem',
                borderBottom: '2px solid #E8E6E1',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: '700', color: '#5D4E37', margin: 0 }}>
                  {selectedVenue.name}
                </h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    color: '#708090'
                  }}
                >
                  ×
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSaveEmail} style={{ padding: '1.5rem' }}>
                <div style={{ marginBottom: '1rem', padding: '1rem', background: '#F5F5F0', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.85rem', color: '#708090', marginBottom: '0.25rem' }}>
                    Location
                  </div>
                  <div style={{ fontSize: '0.95rem', color: '#5D4E37', fontWeight: '600' }}>
                    📍 {selectedVenue.city}, {selectedVenue.state}
                  </div>
                  {selectedVenue.address && (
                    <div style={{ fontSize: '0.85rem', color: '#708090', marginTop: '0.25rem' }}>
                      {selectedVenue.address}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="venue@example.com"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      border: '2px solid #E8E6E1',
                      fontSize: '1rem'
                    }}
                  />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      border: '2px solid #E8E6E1',
                      fontSize: '1rem'
                    }}
                  />
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    disabled={saving}
                    style={{
                      flex: 1,
                      padding: '0.875rem',
                      background: '#E8E6E1',
                      color: '#708090',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      fontWeight: '600',
                      fontSize: '1rem'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      flex: 1,
                      padding: '0.875rem',
                      background: saving ? '#708090' : 'linear-gradient(135deg, #87AE73 0%, #6B8E5C 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      fontWeight: '700',
                      fontSize: '1rem'
                    }}
                  >
                    {saving ? 'Saving...' : '💾 Save Email'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
