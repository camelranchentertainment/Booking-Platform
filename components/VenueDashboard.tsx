'use client';

import { useState, useEffect } from 'react';
import { supabase, getVenues, updateVenueContactStatus } from '../lib/supabase';

interface Venue {
  id: string;
  name: string;
  city: string;
  state: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  venue_type?: string;
  rating?: number;
  contact_status: string;
  discovery_score: number;
  google_maps_url?: string;
  capacity?: number;
  notes?: string;
}

export default function VenueDashboard() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [searchCity, setSearchCity] = useState('');
  const [searchState, setSearchState] = useState('');
  const [searching, setSearching] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedVenue, setEditedVenue] = useState<Venue | null>(null);
  
  // Navigation state: 'states' | 'cities' | 'venues'
  const [viewLevel, setViewLevel] = useState<'states' | 'cities' | 'venues'>('states');
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');

  useEffect(() => {
    loadVenues();
  }, []);

  const loadVenues = async () => {
    try {
      setLoading(true);
      const data = await getVenues({});
      setVenues(data || []);
    } catch (error) {
      console.error('Error loading venues:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveVenue = async () => {
    if (!editedVenue) return;

    try {
      const { error } = await supabase
        .from('venues')
        .update({
          name: editedVenue.name,
          email: editedVenue.email,
          phone: editedVenue.phone,
          website: editedVenue.website,
          address: editedVenue.address,
          venue_type: editedVenue.venue_type,
          capacity: editedVenue.capacity,
          notes: editedVenue.notes
        })
        .eq('id', editedVenue.id);

      if (error) throw error;

      alert('✅ Venue updated successfully!');
      setIsEditMode(false);
      setSelectedVenue(editedVenue);
      loadVenues();
    } catch (error) {
      console.error('Error updating venue:', error);
      alert('Error updating venue');
    }
  };

  const handleEditClick = () => {
    setEditedVenue(selectedVenue);
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    setEditedVenue(null);
    setIsEditMode(false);
  };

  // Group venues by state
  const getStateGroups = () => {
    const groups: { [state: string]: number } = {};
    venues.forEach(venue => {
      groups[venue.state] = (groups[venue.state] || 0) + 1;
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  };

  // Group venues by city for a specific state
  const getCityGroups = (state: string) => {
    const groups: { [city: string]: number } = {};
    venues
      .filter(v => v.state === state)
      .forEach(venue => {
        groups[venue.city] = (groups[venue.city] || 0) + 1;
      });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  };

  // Get venues for a specific city
  const getVenuesForCity = (state: string, city: string) => {
    return venues.filter(v => v.state === state && v.city === city);
  };

  const handleStateClick = (state: string) => {
    setSelectedState(state);
    setViewLevel('cities');
  };

  const handleCityClick = (city: string) => {
    setSelectedCity(city);
    setViewLevel('venues');
  };

  const handleBackClick = () => {
    if (viewLevel === 'venues') {
      setViewLevel('cities');
      setSelectedCity('');
    } else if (viewLevel === 'cities') {
      setViewLevel('states');
      setSelectedState('');
    }
  };

  const discoverVenues = async () => {
    if (!searchCity || !searchState) {
      alert('Please enter both city and state');
      return;
    }

    setSearching(true);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Find live music venues in ${searchCity}, ${searchState} that would be good for a country/honky-tonk band. Focus on bars, saloons, music venues, honky tonks, and roadhouses with live music. Return ONLY a JSON array with 3-5 venues in this exact format (NO other text):
[{"name": "Venue Name", "city": "${searchCity}", "state": "${searchState}", "type": "Bar/Music Venue", "capacity": 150, "website": "https://example.com", "phone": "(555) 555-5555", "email": "booking@venue.com", "notes": "Brief description"}]`
          }],
        })
      });

      const data = await response.json();
      if (data.content?.[0]) {
        const text = data.content[0].text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const newVenues = JSON.parse(text);
        
        alert(`✅ AI discovered ${newVenues.length} venues in ${searchCity}!`);
        
        // Optionally save to Supabase here
        loadVenues();
      }
    } catch (error) {
      console.error('AI Discovery Error:', error);
      alert('Error discovering venues');
    } finally {
      setSearching(false);
    }
  };

  const filteredVenues = venues.filter(venue =>
    venue.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    venue.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
    venue.state.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ padding: '2rem' }}>
      <style jsx>{`
        .venue-container {
          background: linear-gradient(135deg, #2C1810 0%, #3D2817 50%, #2C1810 100%);
          min-height: 100vh;
          padding: 2rem;
        }
        
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
          flex-wrap: wrap;
          gap: 1rem;
        }
        
        .header h2 {
          color: #C8A882;
          font-size: 1.8rem;
          margin: 0;
        }
        
        .search-bar {
          display: flex;
          gap: 10px;
          flex: 1;
          max-width: 500px;
        }
        
        .search-input {
          flex: 1;
          padding: 12px 20px;
          background: rgba(61, 40, 23, 0.6);
          border: 2px solid #5C4A3A;
          border-radius: 8px;
          color: #E8DCC4;
          font-size: 1rem;
        }
        
        .search-input::placeholder {
          color: #9B8A7A;
        }
        
        .search-input:focus {
          outline: none;
          border-color: #C8A882;
        }
        
        .btn-discover {
          background: #6B8E23;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.3s ease;
        }
        
        .btn-discover:hover {
          background: #5a7a1f;
          transform: translateY(-2px);
        }
        
        .discover-section {
          background: rgba(139, 111, 71, 0.2);
          border: 2px solid #8B6F47;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 30px;
        }
        
        .discover-title {
          color: #C8A882;
          font-size: 1.2rem;
          font-weight: 600;
          margin-bottom: 15px;
        }
        
        .discover-inputs {
          display: flex;
          gap: 10px;
        }
        
        .venues-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 15px;
        }
        
        .venue-card {
          background: linear-gradient(135deg, rgba(61, 40, 23, 0.9), rgba(74, 50, 32, 0.9));
          border: 2px solid #5C4A3A;
          border-radius: 12px;
          padding: 20px;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        .venue-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 8px 25px rgba(0,0,0,0.4);
          border-color: #C8A882;
        }
        
        .venue-name {
          color: #C8A882;
          font-size: 1.3rem;
          font-weight: 600;
          margin-bottom: 10px;
        }
        
        .venue-location {
          color: #E8DCC4;
          opacity: 0.9;
          margin-bottom: 15px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .venue-contact {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-top: 15px;
          border-top: 1px solid #5C4A3A;
        }
        
        .contact-item {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #E8DCC4;
          font-size: 0.9rem;
        }
        
        .contact-item a {
          color: #C8A882;
          text-decoration: none;
          transition: color 0.3s ease;
        }
        
        .contact-item a:hover {
          color: #F5EFE0;
          text-decoration: underline;
        }
        
        .modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.8);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          padding: 40px 20px;
        }
        
        .modal-content {
          background: linear-gradient(135deg, #3D2817, #4A3220);
          border: 3px solid #8B6F47;
          border-radius: 15px;
          padding: 40px;
          max-width: 600px;
          width: 100%;
          max-height: 80vh;
          overflow-y: auto;
        }
        
        .modal-title {
          color: #C8A882;
          font-size: 1.8rem;
          margin-bottom: 25px;
        }
        
        .detail-row {
          display: flex;
          margin-bottom: 15px;
          padding-bottom: 15px;
          border-bottom: 1px solid #5C4A3A;
        }
        
        .detail-row:last-child {
          border-bottom: none;
        }
        
        .detail-label {
          font-weight: 600;
          color: #C8A882;
          min-width: 150px;
        }
        
        .detail-value {
          color: #E8DCC4;
        }
        
        .close-btn {
          background: none;
          border: none;
          color: #E8DCC4;
          font-size: 2rem;
          cursor: pointer;
          position: absolute;
          top: 20px;
          right: 20px;
        }
        
        .loading-state, .empty-state {
          background: rgba(61, 40, 23, 0.5);
          padding: 4rem;
          text-align: center;
          color: #9B8A7A;
          border-radius: 12px;
          border: 2px dashed #5C4A3A;
        }
      `}</style>

      <div className="venue-container">
        {/* Breadcrumb Navigation */}
        {viewLevel !== 'states' && (
          <div style={{ marginBottom: '20px' }}>
            <button
              onClick={handleBackClick}
              style={{
                background: 'rgba(200, 168, 130, 0.2)',
                border: '2px solid #C8A882',
                color: '#C8A882',
                padding: '10px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(200, 168, 130, 0.3)'}
              onMouseOut={(e) => e.currentTarget.style.background = 'rgba(200, 168, 130, 0.2)'}
            >
              ← Back {viewLevel === 'cities' ? 'to States' : `to ${selectedState} Cities`}
            </button>
          </div>
        )}

        <div className="header">
          <div>
            <h2>🎸 Venue Database</h2>
            {viewLevel === 'states' && <p style={{ color: '#9B8A7A', margin: '0.5rem 0 0 0' }}>Browse venues by state and city</p>}
            {viewLevel === 'cities' && <p style={{ color: '#C8A882', margin: '0.5rem 0 0 0', fontSize: '1.2rem' }}>{selectedState}</p>}
            {viewLevel === 'venues' && (
              <p style={{ color: '#C8A882', margin: '0.5rem 0 0 0', fontSize: '1.2rem' }}>
                {selectedCity}, {selectedState}
              </p>
            )}
          </div>
        </div>

        {/* AI Venue Discovery Section */}
        <div className="discover-section">
          <div className="discover-title">🤖 AI Venue Discovery</div>
          <div className="discover-inputs">
            <input
              type="text"
              className="search-input"
              placeholder="City"
              value={searchCity}
              onChange={(e) => setSearchCity(e.target.value)}
            />
            <input
              type="text"
              className="search-input"
              style={{ maxWidth: '100px' }}
              placeholder="State"
              maxLength={2}
              value={searchState}
              onChange={(e) => setSearchState(e.target.value.toUpperCase())}
            />
            <button
              className="btn-discover"
              onClick={discoverVenues}
              disabled={searching}
            >
              {searching ? '🔍 Discovering...' : '🔍 Discover Venues'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
            <p>Loading venues...</p>
          </div>
        ) : (
          <>
            {/* STATE VIEW */}
            {viewLevel === 'states' && (
              <>
                {getStateGroups().length === 0 ? (
                  <div className="empty-state">
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎸</div>
                    <p style={{ fontSize: '1.1rem', fontWeight: '600', color: '#C8A882' }}>No venues yet</p>
                    <p>Use the AI Venue Discovery above to find venues in your target cities!</p>
                  </div>
                ) : (
                  <div className="venues-grid">
                    {getStateGroups().map(([state, count], index) => {
                      // Bold colors matching main page theme
                      const cardColors = [
                        { bg: '#5D4E37', accent: '#8B7355' }, // Leather brown
                        { bg: '#8B7355', accent: '#C19A6B' }, // Saddle brown
                        { bg: '#C19A6B', accent: '#8B7355' }, // Tan brown
                        { bg: '#B7410E', accent: '#D4682F' }, // Accent rust
                        { bg: '#708090', accent: '#8B9AA8' }  // Slate grey
                      ];
                      
                      const colors = cardColors[index % cardColors.length];
                      
                      return (
                        <div
                          key={state}
                          className="venue-card"
                          onClick={() => handleStateClick(state)}
                          style={{ 
                            cursor: 'pointer',
                            background: `linear-gradient(135deg, ${colors.bg} 0%, ${colors.accent} 100%)`,
                            border: '2px solid rgba(255,255,255,0.1)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                            padding: '15px',
                            minHeight: 'auto'
                          }}
                        >
                          {/* State abbreviation - Compact */}
                          <div style={{
                            fontSize: '1.8rem',
                            textAlign: 'center',
                            marginBottom: '8px',
                            fontWeight: '800',
                            color: 'white',
                            textShadow: '2px 2px 4px rgba(0,0,0,0.4)',
                            letterSpacing: '2px'
                          }}>
                            {state}
                          </div>
                          
                          {/* Venue count - Compact */}
                          <div style={{ 
                            textAlign: 'center', 
                            color: 'white',
                            marginBottom: '10px'
                          }}>
                            <div style={{ 
                              fontSize: '1.8rem',
                              fontWeight: '800', 
                              marginBottom: '2px',
                              textShadow: '1px 1px 3px rgba(0,0,0,0.4)',
                              lineHeight: '1'
                            }}>
                              {count}
                            </div>
                            <div style={{ 
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                              letterSpacing: '1px',
                              opacity: 0.9
                            }}>
                              {count === 1 ? 'Venue' : 'Venues'}
                            </div>
                          </div>
                          
                          {/* View button - Compact */}
                          <div style={{
                            padding: '8px 12px',
                            background: 'rgba(255,255,255,0.2)',
                            borderRadius: '6px',
                            textAlign: 'center',
                            color: 'white',
                            fontWeight: '700',
                            fontSize: '0.8rem',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            border: '1px solid rgba(255,255,255,0.3)',
                            transition: 'all 0.3s ease'
                          }}>
                            View →
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* CITY VIEW */}
            {viewLevel === 'cities' && (
              <div className="venues-grid">
                {getCityGroups(selectedState).map(([city, count], index) => {
                  // Bold colors for cities
                  const cityColors = [
                    { bg: '#6B8E23', accent: '#87AE73' }, // Green
                    { bg: '#B7410E', accent: '#D4682F' }, // Rust
                    { bg: '#8B7355', accent: '#A38968' }  // Saddle brown
                  ];
                  
                  const colors = cityColors[index % cityColors.length];
                  
                  return (
                    <div
                      key={city}
                      className="venue-card"
                      onClick={() => handleCityClick(city)}
                      style={{ 
                        cursor: 'pointer',
                        background: `linear-gradient(135deg, ${colors.bg} 0%, ${colors.accent} 100%)`,
                        border: '2px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        padding: '15px',
                        minHeight: 'auto'
                      }}
                    >
                      {/* City name - Compact */}
                      <div style={{ 
                        fontSize: '1.3rem',
                        marginBottom: '5px',
                        textAlign: 'center',
                        fontWeight: '700',
                        color: 'white',
                        textShadow: '2px 2px 4px rgba(0,0,0,0.4)',
                        letterSpacing: '0.5px'
                      }}>
                        📍 {city}
                      </div>
                      
                      {/* State label - Compact */}
                      <div style={{ 
                        color: 'rgba(255,255,255,0.85)', 
                        fontSize: '0.75rem',
                        marginBottom: '12px',
                        textAlign: 'center',
                        fontWeight: '600',
                        letterSpacing: '1.5px',
                        textTransform: 'uppercase'
                      }}>
                        {selectedState}
                      </div>
                      
                      {/* Venue count - Compact */}
                      <div style={{ 
                        textAlign: 'center',
                        marginBottom: '10px'
                      }}>
                        <div style={{ 
                          fontSize: '1.8rem',
                          fontWeight: '800', 
                          color: 'white',
                          marginBottom: '2px',
                          textShadow: '1px 1px 3px rgba(0,0,0,0.4)',
                          lineHeight: '1'
                        }}>
                          {count}
                        </div>
                        <div style={{ 
                          color: 'white',
                          fontSize: '0.7rem',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          letterSpacing: '1px',
                          opacity: 0.9
                        }}>
                          {count === 1 ? 'Venue' : 'Venues'}
                        </div>
                      </div>
                      
                      {/* View button - Compact */}
                      <div style={{
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.2)',
                        borderRadius: '6px',
                        textAlign: 'center',
                        color: 'white',
                        fontWeight: '700',
                        border: '1px solid rgba(255,255,255,0.3)',
                        fontSize: '0.8rem',
                        textTransform: 'uppercase',
                        letterSpacing: '1px'
                      }}>
                        View →
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* VENUE VIEW */}
            {viewLevel === 'venues' && (
              <>
                {getVenuesForCity(selectedState, selectedCity).length === 0 ? (
                  <div className="empty-state">
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                    <p style={{ fontSize: '1.1rem', fontWeight: '600', color: '#C8A882', marginBottom: '1rem' }}>
                      No venues found in {selectedCity}, {selectedState}
                    </p>
                    <p style={{ marginBottom: '1.5rem' }}>
                      Use the AI Venue Discovery above to search for venues in this city!
                    </p>
                    <button
                      className="btn-discover"
                      onClick={() => {
                        setSearchCity(selectedCity);
                        setSearchState(selectedState);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      🔍 Search {selectedCity}, {selectedState}
                    </button>
                  </div>
                ) : (
                  <div className="venues-grid">
                    {getVenuesForCity(selectedState, selectedCity).map((venue) => (
                      <div
                        key={venue.id}
                        className="venue-card"
                        onClick={() => setSelectedVenue(venue)}
                      >
                        <div className="venue-name">{venue.name}</div>
                        <div className="venue-location">
                          📍 {venue.city}, {venue.state}
                        </div>
                        
                        <div className="venue-contact">
                          {venue.website && (
                            <div className="contact-item">
                              🌐 <a href={venue.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                Website
                              </a>
                            </div>
                          )}
                          {venue.phone && (
                            <div className="contact-item">
                              📞 {venue.phone}
                            </div>
                          )}
                          {venue.email && (
                            <div className="contact-item">
                              ✉️ <a href={`mailto:${venue.email}`} onClick={(e) => e.stopPropagation()}>
                                {venue.email}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Venue Detail/Edit Modal */}
      {selectedVenue && (
        <div className="modal" onClick={() => {
          setSelectedVenue(null);
          setIsEditMode(false);
          setEditedVenue(null);
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => {
              setSelectedVenue(null);
              setIsEditMode(false);
              setEditedVenue(null);
            }}>×</button>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
              <h3 className="modal-title">{isEditMode ? 'Edit Venue' : selectedVenue.name}</h3>
              {!isEditMode && (
                <button
                  onClick={handleEditClick}
                  style={{
                    background: '#6B8E23',
                    color: 'white',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  ✏️ Edit Venue
                </button>
              )}
            </div>

            {!isEditMode ? (
              // VIEW MODE
              <>
                <div className="detail-row">
                  <span className="detail-label">Venue Name:</span>
                  <span className="detail-value">{selectedVenue.name}</span>
                </div>

                <div className="detail-row">
                  <span className="detail-label">Location:</span>
                  <span className="detail-value">{selectedVenue.city}, {selectedVenue.state}</span>
                </div>

                {selectedVenue.address && (
                  <div className="detail-row">
                    <span className="detail-label">Address:</span>
                    <span className="detail-value">{selectedVenue.address}</span>
                  </div>
                )}

                <div className="detail-row">
                  <span className="detail-label">Email:</span>
                  <span className="detail-value">
                    {selectedVenue.email ? (
                      <a href={`mailto:${selectedVenue.email}`} style={{ color: '#C8A882' }}>
                        {selectedVenue.email}
                      </a>
                    ) : (
                      <span style={{ color: '#B7410E', fontStyle: 'italic' }}>⚠️ No email - Click Edit to add</span>
                    )}
                  </span>
                </div>

                <div className="detail-row">
                  <span className="detail-label">Phone:</span>
                  <span className="detail-value">
                    {selectedVenue.phone || <span style={{ color: '#9B8A7A', fontStyle: 'italic' }}>Not provided</span>}
                  </span>
                </div>

                {selectedVenue.website && (
                  <div className="detail-row">
                    <span className="detail-label">Website:</span>
                    <span className="detail-value">
                      <a href={selectedVenue.website} target="_blank" rel="noopener noreferrer" style={{ color: '#C8A882' }}>
                        {selectedVenue.website}
                      </a>
                    </span>
                  </div>
                )}

                {selectedVenue.venue_type && (
                  <div className="detail-row">
                    <span className="detail-label">Type:</span>
                    <span className="detail-value">{selectedVenue.venue_type}</span>
                  </div>
                )}

                {selectedVenue.capacity && (
                  <div className="detail-row">
                    <span className="detail-label">Capacity:</span>
                    <span className="detail-value">{selectedVenue.capacity} people</span>
                  </div>
                )}

                {selectedVenue.rating && (
                  <div className="detail-row">
                    <span className="detail-label">Rating:</span>
                    <span className="detail-value">⭐ {selectedVenue.rating.toFixed(1)}</span>
                  </div>
                )}

                {selectedVenue.contact_status && (
                  <div className="detail-row">
                    <span className="detail-label">Contact Status:</span>
                    <span className="detail-value">{selectedVenue.contact_status.replace('_', ' ')}</span>
                  </div>
                )}

                {selectedVenue.notes && (
                  <div className="detail-row">
                    <span className="detail-label">Notes:</span>
                    <span className="detail-value">{selectedVenue.notes}</span>
                  </div>
                )}

                {selectedVenue.google_maps_url && (
                  <div className="detail-row">
                    <span className="detail-label">Google Maps:</span>
                    <span className="detail-value">
                      <a href={selectedVenue.google_maps_url} target="_blank" rel="noopener noreferrer" style={{ color: '#C8A882' }}>
                        View on Maps
                      </a>
                    </span>
                  </div>
                )}
              </>
            ) : (
              // EDIT MODE
              <>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#C8A882', fontWeight: '600', marginBottom: '8px' }}>
                    Venue Name *
                  </label>
                  <input
                    type="text"
                    value={editedVenue?.name || ''}
                    onChange={(e) => setEditedVenue({ ...editedVenue!, name: e.target.value })}
                    className="search-input"
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#C8A882', fontWeight: '600', marginBottom: '8px' }}>
                    Email Address * (Important for booking!)
                  </label>
                  <input
                    type="email"
                    placeholder="booking@venue.com"
                    value={editedVenue?.email || ''}
                    onChange={(e) => setEditedVenue({ ...editedVenue!, email: e.target.value })}
                    className="search-input"
                    style={{ borderColor: editedVenue?.email ? '#5C4A3A' : '#B7410E' }}
                  />
                  {!editedVenue?.email && (
                    <p style={{ color: '#B7410E', fontSize: '0.85rem', marginTop: '5px' }}>
                      ⚠️ Email is required for sending booking requests
                    </p>
                  )}
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#C8A882', fontWeight: '600', marginBottom: '8px' }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="(555) 555-5555"
                    value={editedVenue?.phone || ''}
                    onChange={(e) => setEditedVenue({ ...editedVenue!, phone: e.target.value })}
                    className="search-input"
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#C8A882', fontWeight: '600', marginBottom: '8px' }}>
                    Website
                  </label>
                  <input
                    type="url"
                    placeholder="https://venue.com"
                    value={editedVenue?.website || ''}
                    onChange={(e) => setEditedVenue({ ...editedVenue!, website: e.target.value })}
                    className="search-input"
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#C8A882', fontWeight: '600', marginBottom: '8px' }}>
                    Address
                  </label>
                  <input
                    type="text"
                    placeholder="123 Main St"
                    value={editedVenue?.address || ''}
                    onChange={(e) => setEditedVenue({ ...editedVenue!, address: e.target.value })}
                    className="search-input"
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#C8A882', fontWeight: '600', marginBottom: '8px' }}>
                    Venue Type
                  </label>
                  <select
                    value={editedVenue?.venue_type || ''}
                    onChange={(e) => setEditedVenue({ ...editedVenue!, venue_type: e.target.value })}
                    className="search-input"
                  >
                    <option value="">Select type...</option>
                    <option value="Bar">Bar</option>
                    <option value="Restaurant">Restaurant</option>
                    <option value="Music Venue">Music Venue</option>
                    <option value="Honky Tonk">Honky Tonk</option>
                    <option value="Saloon">Saloon</option>
                    <option value="Roadhouse">Roadhouse</option>
                    <option value="Brewery">Brewery</option>
                    <option value="Winery">Winery</option>
                  </select>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#C8A882', fontWeight: '600', marginBottom: '8px' }}>
                    Capacity
                  </label>
                  <input
                    type="number"
                    placeholder="150"
                    value={editedVenue?.capacity || ''}
                    onChange={(e) => setEditedVenue({ ...editedVenue!, capacity: parseInt(e.target.value) })}
                    className="search-input"
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#C8A882', fontWeight: '600', marginBottom: '8px' }}>
                    Notes
                  </label>
                  <textarea
                    placeholder="Booking info, contact preferences, past performance notes..."
                    value={editedVenue?.notes || ''}
                    onChange={(e) => setEditedVenue({ ...editedVenue!, notes: e.target.value })}
                    style={{
                      width: '100%',
                      minHeight: '100px',
                      padding: '12px 20px',
                      background: 'rgba(61, 40, 23, 0.6)',
                      border: '2px solid #5C4A3A',
                      borderRadius: '8px',
                      color: '#E8DCC4',
                      fontSize: '1rem',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
                  <button
                    onClick={handleCancelEdit}
                    style={{
                      flex: 1,
                      background: '#A8A8A8',
                      color: '#36454F',
                      border: 'none',
                      padding: '12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveVenue}
                    style={{
                      flex: 1,
                      background: '#6B8E23',
                      color: 'white',
                      border: 'none',
                      padding: '12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                  >
                    ✅ Save Changes
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
