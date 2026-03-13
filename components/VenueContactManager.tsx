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
  campaign_name?: string;
}

// Supabase returns joined tables as arrays
interface CampaignVenueRow {
  venue_id: string;
  campaigns: { name: string }[] | null;
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
    loadCampaignVenuesWithoutEmail();
  }, []);

  const loadCampaignVenuesWithoutEmail = async () => {
    try {
      setLoading(true);

      const { data: campaignVenues, error: cvError } = await supabase
        .from('campaign_venues')
        .select(`venue_id, campaigns(name)`);

      if (cvError) throw cvError;

      const typedCampaignVenues = (campaignVenues || []) as unknown as CampaignVenueRow[];
      const venueIds = [...new Set(typedCampaignVenues.map(cv => cv.venue_id))];

      if (venueIds.length === 0) {
        setVenues([]);
        setLoading(false);
        return;
      }

      const { data: venuesData, error: venuesError } = await supabase
        .from('venues')
        .select('*')
        .in('id', venueIds)
        .or('email.is.null,email.eq.')
        .order('name');

      if (venuesError) throw venuesError;

      const venuesWithCampaign = (venuesData || []).map(venue => {
        const campaignVenue = typedCampaignVenues.find(cv => cv.venue_id === venue.id);
        return {
          ...venue,
          campaign_name: campaignVenue?.campaigns?.[0]?.name || 'Unknown Campaign',
        };
      });

      setVenues(venuesWithCampaign);
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
    if (!editEmail) { alert('Please enter an email address'); return; }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('venues')
        .update({ email: editEmail, phone: editPhone || null })
        .eq('id', selectedVenue.id);

      if (error) throw error;

      setShowEditModal(false);
      setSelectedVenue(null);
      await loadCampaignVenuesWithoutEmail();
    } catch (error) {
      console.error('Error saving contact info:', error);
      alert('Failed to save contact info');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: '#7db8d4' }}>
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
          background: linear-gradient(135deg, #05111f 0%, #0a1f35 100%);
          min-height: 100vh;
          padding: 2rem;
        }
        .venue-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }
        .venue-tile {
          background: #0d2540;
          border-radius: 10px;
          padding: 1rem;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
          border: 1px solid rgba(56,189,248,0.15);
        }
        .venue-tile:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(56,189,248,0.2);
          border-color: #38bdf8;
        }
        @media (max-width: 1200px) { .venue-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 900px)  { .venue-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px)  { .venue-grid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="page-container">
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#f0f9ff', margin: '0 0 0.5rem 0' }}>
              📧 Add Venue Contact Info
            </h1>
            <p style={{ color: '#7db8d4', margin: 0 }}>
              Campaign venues missing email addresses • Click to add contact info
            </p>
          </div>

          {venues.length === 0 ? (
            <div style={{
              background: '#0d2540', padding: '4rem', borderRadius: '16px',
              textAlign: 'center', border: '1px solid rgba(74,222,128,0.2)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
              <h3 style={{ fontSize: '1.5rem', color: '#4ade80', margin: '0 0 0.5rem 0' }}>All set!</h3>
              <p style={{ color: '#7db8d4', margin: 0 }}>All campaign venues have email addresses</p>
            </div>
          ) : (
            <>
              <div style={{
                background: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.3)',
                borderRadius: '12px', padding: '1rem 1.5rem',
                marginBottom: '1.5rem', display: 'flex',
                alignItems: 'center', gap: '1rem',
              }}>
                <div style={{ fontSize: '1.5rem' }}>⚠️</div>
                <div>
                  <div style={{ color: '#fbbf24', fontWeight: '700', marginBottom: '0.25rem' }}>
                    {venues.length} venue{venues.length !== 1 ? 's' : ''} need{venues.length === 1 ? 's' : ''} email addresses
                  </div>
                  <div style={{ color: '#7db8d4', fontSize: '0.9rem' }}>
                    These venues are in your campaigns but missing contact info
                  </div>
                </div>
              </div>

              <div className="venue-grid">
                {venues.map((venue) => (
                  <div key={venue.id} className="venue-tile" onClick={() => handleTileClick(venue)}>
                    <div style={{
                      fontSize: '1rem', fontWeight: '700', color: '#f0f9ff',
                      marginBottom: '0.5rem', lineHeight: '1.2', minHeight: '2.4rem',
                      display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {venue.name}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#7db8d4', marginBottom: '0.5rem' }}>
                      📍 {venue.city}, {venue.state}
                    </div>
                    <div style={{
                      fontSize: '0.75rem', color: '#38bdf8',
                      background: 'rgba(56,189,248,0.1)', padding: '0.25rem 0.5rem',
                      borderRadius: '4px', marginBottom: '0.75rem', display: 'inline-block',
                    }}>
                      🎯 {venue.campaign_name}
                    </div>
                    <div style={{
                      display: 'block', padding: '0.5rem',
                      background: 'rgba(56,189,248,0.15)', color: '#38bdf8',
                      borderRadius: '6px', fontSize: '0.85rem',
                      fontWeight: '700', textAlign: 'center',
                      border: '1px solid rgba(56,189,248,0.3)',
                    }}>
                      + Add Email
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Edit Modal */}
        {showEditModal && selectedVenue && (
          <div
            onClick={() => setShowEditModal(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(5,17,31,0.85)',
              backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1000, padding: '1rem',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#0d2540',
                border: '1px solid rgba(56,189,248,0.25)',
                borderRadius: '16px', width: '100%', maxWidth: '500px',
                boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
              }}
            >
              <div style={{
                padding: '1.5rem',
                borderBottom: '1px solid rgba(56,189,248,0.15)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: '700', color: '#f0f9ff', margin: 0 }}>
                  {selectedVenue.name}
                </h2>
                <button onClick={() => setShowEditModal(false)} style={{
                  background: 'none', border: 'none', fontSize: '1.5rem',
                  cursor: 'pointer', color: '#7db8d4',
                }}>×</button>
              </div>

              <form onSubmit={handleSaveEmail} style={{ padding: '1.5rem' }}>
                <div style={{
                  marginBottom: '1rem', padding: '1rem',
                  background: 'rgba(56,189,248,0.05)',
                  border: '1px solid rgba(56,189,248,0.15)',
                  borderRadius: '8px',
                }}>
                  <div style={{ fontSize: '0.85rem', color: '#7db8d4', marginBottom: '0.25rem' }}>Campaign</div>
                  <div style={{ fontSize: '0.95rem', color: '#38bdf8', fontWeight: '600', marginBottom: '0.75rem' }}>
                    🎯 {selectedVenue.campaign_name}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#7db8d4', marginBottom: '0.25rem' }}>Location</div>
                  <div style={{ fontSize: '0.95rem', color: '#f0f9ff', fontWeight: '600' }}>
                    📍 {selectedVenue.city}, {selectedVenue.state}
                  </div>
                  {selectedVenue.address && (
                    <div style={{ fontSize: '0.85rem', color: '#7db8d4', marginTop: '0.25rem' }}>
                      {selectedVenue.address}
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{
                    display: 'block', color: '#7db8d4', marginBottom: '0.5rem',
                    fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    Email Address <span style={{ color: '#f87171' }}>*</span>
                  </label>
                  <input
                    type="email" value={editEmail} required
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="venue@example.com"
                    style={{
                      width: '100%', padding: '0.75rem', borderRadius: '8px',
                      border: '1px solid #1a3a5c', background: 'rgba(255,255,255,0.03)',
                      color: '#f0f9ff', fontSize: '1rem', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{
                    display: 'block', color: '#7db8d4', marginBottom: '0.5rem',
                    fontWeight: '600', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel" value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    style={{
                      width: '100%', padding: '0.75rem', borderRadius: '8px',
                      border: '1px solid #1a3a5c', background: 'rgba(255,255,255,0.03)',
                      color: '#f0f9ff', fontSize: '1rem', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    type="button" onClick={() => setShowEditModal(false)} disabled={saving}
                    style={{
                      flex: 1, padding: '0.875rem',
                      background: 'transparent', color: '#7db8d4',
                      border: '1px solid rgba(56,189,248,0.3)', borderRadius: '8px',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      fontWeight: '600', fontSize: '1rem',
                    }}
                  >Cancel</button>
                  <button
                    type="submit" disabled={saving}
                    style={{
                      flex: 1, padding: '0.875rem',
                      background: saving ? '#1a3a5c' : 'linear-gradient(135deg, #38bdf8, #0ea5e9)',
                      color: saving ? '#7db8d4' : '#05111f',
                      border: 'none', borderRadius: '8px',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      fontWeight: '700', fontSize: '1rem',
                      boxShadow: saving ? 'none' : '0 4px 14px rgba(56,189,248,0.35)',
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
