'use client';

import { useState, useEffect } from 'react';
import { getVenues, addVenue, updateVenue } from '../lib/supabase';

interface Venue {
  id: string;
  name: string;
  address?: string;
  city: string;
  state: string;
  zip_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  venue_type?: string;
  capacity_min?: number;
  capacity_max?: number;
  contact_status?: string;
  notes?: string;
  last_contact_date?: string;
  created_at?: string;
}

export default function VenueSearch() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Search filters
  const [searchCity, setSearchCity] = useState('');
  const [searchState, setSearchState] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // New venue form
  const [newVenue, setNewVenue] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    phone: '',
    email: '',
    website: '',
    venue_type: 'bar',
    capacity_min: '',
    capacity_max: '',
    notes: ''
  });

  useEffect(() => {
    loadVenues();
  }, []);

  const loadVenues = async (filters?: any) => {
    try {
      setLoading(true);
      const data = await getVenues(filters || {});
      setVenues(data || []);
    } catch (error) {
      console.error('Error loading venues:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    const filters: any = {};
    if (searchCity.trim()) filters.city = searchCity.trim();
    if (searchState.trim()) filters.state = searchState.trim();
    if (filterStatus !== 'all') filters.contact_status = filterStatus;
    loadVenues(filters);
  };

  const handleClearSearch = () => {
    setSearchCity('');
    setSearchState('');
    setFilterStatus('all');
    loadVenues({});
  };

  const handleAddVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addVenue({
        ...newVenue,
        capacity_min: newVenue.capacity_min ? parseInt(newVenue.capacity_min) : null,
        capacity_max: newVenue.capacity_max ? parseInt(newVenue.capacity_max) : null
      });
      
      setShowAddForm(false);
      setNewVenue({
        name: '',
        address: '',
        city: '',
        state: '',
        zip_code: '',
        phone: '',
        email: '',
        website: '',
        venue_type: 'bar',
        capacity_min: '',
        capacity_max: '',
        notes: ''
      });
      loadVenues();
      alert('Venue added successfully!');
    } catch (error) {
      console.error('Error adding venue:', error);
      alert('Error adding venue. Please try again.');
    }
  };

  // Group venues by state and city
  const groupedVenues = venues.reduce((acc: any, venue) => {
    const state = venue.state || 'Unknown';
    const city = venue.city || 'Unknown';
    
    if (!acc[state]) {
      acc[state] = {};
    }
    if (!acc[state][city]) {
      acc[state][city] = [];
    }
    acc[state][city].push(venue);
    return acc;
  }, {});

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'booked':
        return '#87AE73';
      case 'declined':
        return '#C33';
      case 'awaiting_response':
        return '#B7410E';
      case 'not_contacted':
      default:
        return '#708090';
    }
  };

  const getStatusLabel = (status?: string) => {
    return status?.replace(/_/g, ' ').toUpperCase() || 'NOT CONTACTED';
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
        <h2 style={{ color: '#5D4E37', margin: 0 }}>Venue Search & Discovery</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '0.75rem 1.5rem',
            background: showAddForm ? '#708090' : '#5D4E37',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '1rem'
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add Venue'}
        </button>
      </div>

      {/* Add Venue Form */}
      {showAddForm && (
        <div style={{
          background: '#F5F5F0',
          padding: '2rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          border: '2px solid #5D4E37'
        }}>
          <h3 style={{ color: '#5D4E37', marginTop: 0 }}>Add New Venue</h3>
          <form onSubmit={handleAddVenue}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Venue Name *
                </label>
                <input
                  type="text"
                  required
                  value={newVenue.name}
                  onChange={(e) => setNewVenue({...newVenue, name: e.target.value})}
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
                  Venue Type
                </label>
                <select
                  value={newVenue.venue_type}
                  onChange={(e) => setNewVenue({...newVenue, venue_type: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    border: '1px solid #D3D3D3'
                  }}
                >
                  <option value="bar">Bar</option>
                  <option value="club">Club</option>
                  <option value="saloon">Saloon</option>
                  <option value="dancehall">Dancehall</option>
                  <option value="venue">Music Venue</option>
                  <option value="honky_tonk">Honky Tonk</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                  City *
                </label>
                <input
                  type="text"
                  required
                  value={newVenue.city}
                  onChange={(e) => setNewVenue({...newVenue, city: e.target.value})}
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
                  State *
                </label>
                <input
                  type="text"
                  required
                  maxLength={2}
                  placeholder="AR"
                  value={newVenue.state}
                  onChange={(e) => setNewVenue({...newVenue, state: e.target.value.toUpperCase()})}
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
                  Phone
                </label>
                <input
                  type="tel"
                  value={newVenue.phone}
                  onChange={(e) => setNewVenue({...newVenue, phone: e.target.value})}
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
                  Email
                </label>
                <input
                  type="email"
                  value={newVenue.email}
                  onChange={(e) => setNewVenue({...newVenue, email: e.target.value})}
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
                  Website
                </label>
                <input
                  type="url"
                  value={newVenue.website}
                  onChange={(e) => setNewVenue({...newVenue, website: e.target.value})}
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
                  Address
                </label>
                <input
                  type="text"
                  value={newVenue.address}
                  onChange={(e) => setNewVenue({...newVenue, address: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    border: '1px solid #D3D3D3'
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                Notes
              </label>
              <textarea
                value={newVenue.notes}
                onChange={(e) => setNewVenue({...newVenue, notes: e.target.value})}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  border: '1px solid #D3D3D3',
                  fontFamily: 'inherit'
                }}
              />
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
              Add Venue
            </button>
          </form>
        </div>
      )}

      {/* Search Filters */}
      <div style={{
        background: '#F5F5F0',
        padding: '1.5rem',
        borderRadius: '8px',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto auto', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
              City
            </label>
            <input
              type="text"
              value={searchCity}
              onChange={(e) => setSearchCity(e.target.value)}
              placeholder="Enter city name"
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
              State
            </label>
            <input
              type="text"
              value={searchState}
              onChange={(e) => setSearchState(e.target.value.toUpperCase())}
              placeholder="AR"
              maxLength={2}
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
              Contact Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #D3D3D3'
              }}
            >
              <option value="all">All Statuses</option>
              <option value="not_contacted">Not Contacted</option>
              <option value="awaiting_response">Awaiting Response</option>
              <option value="booked">Booked</option>
              <option value="declined">Declined</option>
            </select>
          </div>

          <button
            onClick={handleSearch}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#5D4E37',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Search
          </button>

          <button
            onClick={handleClearSearch}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#708090',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div style={{ marginBottom: '1.5rem', color: '#708090' }}>
        Found {venues.length} venue{venues.length !== 1 ? 's' : ''}
      </div>

      {/* Venues Display - Grouped by State and City */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#708090' }}>
          Loading venues...
        </div>
      ) : venues.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#708090' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎸</div>
          <p>No venues found. Try adjusting your search or add a new venue!</p>
        </div>
      ) : (
        <div>
          {Object.keys(groupedVenues).sort().map((state) => (
            <div key={state} style={{ marginBottom: '2rem' }}>
              {/* State Header */}
              <div style={{
                background: '#5D4E37',
                color: 'white',
                padding: '1rem 1.5rem',
                borderRadius: '6px',
                marginBottom: '1rem',
                fontWeight: '700',
                fontSize: '1.2rem'
              }}>
                {state}
              </div>

              {/* Cities within State */}
              {Object.keys(groupedVenues[state]).sort().map((city) => (
                <div key={`${state}-${city}`} style={{ marginBottom: '1.5rem' }}>
                  {/* City Header */}
                  <div style={{
                    background: '#708090',
                    color: 'white',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '6px',
                    marginBottom: '1rem',
                    fontWeight: '600',
                    fontSize: '1rem'
                  }}>
                    {city}
                  </div>

                  {/* Venues in City */}
                  <div style={{ display: 'grid', gap: '1rem', paddingLeft: '1rem' }}>
                    {groupedVenues[state][city].map((venue: Venue) => (
                      <div
                        key={venue.id}
                        style={{
                          padding: '1.5rem',
                          background: '#F5F5F0',
                          borderRadius: '6px',
                          border: '1px solid #D3D3D3'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <div style={{ flex: 1 }}>
                            <h4 style={{ color: '#5D4E37', marginBottom: '0.5rem', marginTop: 0 }}>
                              {venue.name}
                            </h4>
                            
                            {venue.venue_type && (
                              <p style={{ color: '#708090', fontSize: '0.9rem', margin: '0.25rem 0' }}>
                                🏛️ {venue.venue_type.replace(/_/g, ' ').toUpperCase()}
                              </p>
                            )}
                            
                            {venue.address && (
                              <p style={{ color: '#708090', fontSize: '0.9rem', margin: '0.25rem 0' }}>
                                📍 {venue.address}
                              </p>
                            )}
                            
                            {venue.phone && (
                              <p style={{ color: '#708090', fontSize: '0.9rem', margin: '0.25rem 0' }}>
                                📞 {venue.phone}
                              </p>
                            )}
                            
                            {venue.email && (
                              <p style={{ color: '#708090', fontSize: '0.9rem', margin: '0.25rem 0' }}>
                                ✉️ {venue.email}
                              </p>
                            )}
                            
                            {venue.website && (
                              <p style={{ color: '#708090', fontSize: '0.9rem', margin: '0.25rem 0' }}>
                                🌐 <a 
                                  href={venue.website} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  style={{ color: '#B7410E', textDecoration: 'none' }}
                                >
                                  {venue.website}
                                </a>
                              </p>
                            )}

                            {venue.notes && (
                              <p style={{ 
                                color: '#708090', 
                                fontSize: '0.9rem', 
                                margin: '0.75rem 0 0 0',
                                fontStyle: 'italic',
                                paddingTop: '0.5rem',
                                borderTop: '1px solid #D3D3D3'
                              }}>
                                {venue.notes}
                              </p>
                            )}
                          </div>
                          
                          <div style={{
                            padding: '0.5rem 1rem',
                            background: getStatusColor(venue.contact_status),
                            color: 'white',
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            whiteSpace: 'nowrap',
                            marginLeft: '1rem'
                          }}>
                            {getStatusLabel(venue.contact_status)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

