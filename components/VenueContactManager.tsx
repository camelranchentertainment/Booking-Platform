'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Venue {
  id: string;
  name: string;
  city: string;
  state: string;
  address?: string;
  phone?: string;
  email?: string;
  campaign_venues?: any[];
}

export default function VenueContactManager() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    loadVenuesNeedingEmail();
  }, []);

  const loadVenuesNeedingEmail = async () => {
    try {
      setLoading(true);

      // Get all venues in active campaigns that don't have email addresses
      const { data: campaignVenues } = await supabase
        .from('campaign_venues')
        .select(`
          venue_id,
          campaign:campaigns!inner(id, name, status),
          venue:venues(id, name, city, state, address, phone, email)
        `)
        .eq('campaign.status', 'active');

      // Filter to unique venues without emails
      const venuesMap = new Map();
      
      (campaignVenues || []).forEach((cv: any) => {
        const venue = cv.venue;
        if (venue && !venue.email) {
          if (!venuesMap.has(venue.id)) {
            venuesMap.set(venue.id, {
              ...venue,
              campaign_venues: [cv]
            });
          } else {
            venuesMap.get(venue.id).campaign_venues.push(cv);
          }
        }
      });

      const venuesList = Array.from(venuesMap.values());
      setVenues(venuesList);
      setLoading(false);
    } catch (error) {
      console.error('Error loading venues:', error);
      setLoading(false);
    }
  };

  const saveEmail = async (venueId: string, email: string) => {
    if (!email || !email.includes('@')) {
      alert('Please enter a valid email address');
      return;
    }

    try {
      setSaving(venueId);

      const { error } = await supabase
        .from('venues')
        .update({ email: email.trim() })
        .eq('id', venueId);

      if (error) throw error;

      // Remove from list
      setVenues(venues.filter(v => v.id !== venueId));
      
      setSaving(null);
    } catch (error) {
      console.error('Error saving email:', error);
      alert('Error saving email address');
      setSaving(null);
    }
  };

  const skipVenue = (venueId: string) => {
    setVenues(venues.filter(v => v.id !== venueId));
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '60vh',
        background: 'linear-gradient(135deg, #F5F5F0 0%, #E8E6E1 100%)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📧</div>
          <p style={{ color: '#708090', fontSize: '1.1rem' }}>Loading venues...</p>
        </div>
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
        
        .content-wrapper {
          max-width: 900px;
          margin: 0 auto;
        }
        
        .venue-grid {
          display: grid;
          gap: 1.5rem;
        }
        
        @media (max-width: 767px) {
          .page-container {
            padding: 1rem;
          }
          
          .venue-grid {
            gap: 1rem;
          }
        }
      `}</style>

      <div className="page-container">
        <div className="content-wrapper">
          {/* Header */}
          <div style={{ marginBottom: '2.5rem' }}>
            <h1 style={{
              fontSize: '2.2rem',
              fontWeight: '700',
              color: '#5D4E37',
              margin: '0 0 0.5rem 0'
            }}>
              📧 Add Contact Info
            </h1>
            <p style={{ color: '#708090', margin: 0, fontSize: '1.05rem' }}>
              {venues.length} venue{venues.length !== 1 ? 's' : ''} need email addresses
            </p>
          </div>

          {/* Venues List */}
          {venues.length === 0 ? (
            <div style={{
              background: 'white',
              padding: '4rem',
              borderRadius: '16px',
              textAlign: 'center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)'
            }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
              <h3 style={{ fontSize: '1.5rem', color: '#5D4E37', margin: '0 0 0.5rem 0' }}>
                All set!
              </h3>
              <p style={{ color: '#708090', fontSize: '1.05rem', margin: 0 }}>
                All venues in active campaigns have email addresses
              </p>
            </div>
          ) : (
            <div className="venue-grid">
              {venues.map((venue) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  onSave={saveEmail}
                  onSkip={skipVenue}
                  isSaving={saving === venue.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function VenueCard({ 
  venue, 
  onSave, 
  onSkip, 
  isSaving 
}: { 
  venue: Venue; 
  onSave: (id: string, email: string) => void; 
  onSkip: (id: string) => void;
  isSaving: boolean;
}) {
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(venue.id, email);
  };

  const campaigns = venue.campaign_venues?.map((cv: any) => cv.campaign?.name).filter(Boolean) || [];

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '1.5rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      border: '2px solid #E8E6E1'
    }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <h3 style={{
          fontSize: '1.3rem',
          fontWeight: '700',
          color: '#5D4E37',
          margin: '0 0 0.5rem 0'
        }}>
          {venue.name}
        </h3>
        
        <div style={{ color: '#708090', fontSize: '0.95rem', marginBottom: '0.25rem' }}>
          📍 {venue.city}, {venue.state}
        </div>
        
        {venue.address && (
          <div style={{ color: '#708090', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
            🏠 {venue.address}
          </div>
        )}
        
        {venue.phone && (
          <div style={{ color: '#708090', fontSize: '0.9rem', marginBottom: '0.25rem' }}>
            📞 {venue.phone}
          </div>
        )}

        {campaigns.length > 0 && (
          <div style={{
            marginTop: '0.75rem',
            padding: '0.5rem',
            background: '#F5F5F0',
            borderRadius: '6px',
            fontSize: '0.85rem',
            color: '#708090'
          }}>
            🎯 In campaigns: <strong>{campaigns.join(', ')}</strong>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{
            display: 'block',
            color: '#5D4E37',
            marginBottom: '0.5rem',
            fontWeight: '600',
            fontSize: '0.95rem'
          }}>
            Email Address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="venue@example.com"
            disabled={isSaving}
            style={{
              width: '100%',
              padding: '0.875rem',
              borderRadius: '8px',
              border: '2px solid #E8E6E1',
              fontSize: '1rem',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#5D4E37'}
            onBlur={(e) => e.target.style.borderColor = '#E8E6E1'}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="submit"
            disabled={isSaving}
            style={{
              flex: 1,
              padding: '0.875rem',
              background: isSaving 
                ? '#708090' 
                : 'linear-gradient(135deg, #87AE73 0%, #6B8E5C 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontWeight: '700',
              fontSize: '1rem',
              boxShadow: '0 4px 12px rgba(135, 174, 115, 0.3)',
              opacity: isSaving ? 0.7 : 1
            }}
          >
            {isSaving ? '💾 Saving...' : '✅ Save Email'}
          </button>
          
          <button
            type="button"
            onClick={() => onSkip(venue.id)}
            disabled={isSaving}
            style={{
              padding: '0.875rem 1.25rem',
              background: '#E8E6E1',
              color: '#708090',
              border: 'none',
              borderRadius: '8px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              fontSize: '1rem',
              opacity: isSaving ? 0.5 : 1
            }}
          >
            Skip
          </button>
        </div>
      </form>
    </div>
  );
}
