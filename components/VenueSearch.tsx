'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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

const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' }
];

export default function VenueSearch() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  
  // Search filters
  const [searchCity, setSearchCity] = useState('');
  const [searchState, setSearchState] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // Venue Discovery
  const [discoverLocations, setDiscoverLocations] = useState([{ city: '', state: 'AR' }]);
  const [discoverRadius, setDiscoverRadius] = useState(25);
  
  // New venue form
  const [newVenue, setNewVenue] = useState({
    name: '',
    address: '',
    city: '',
    state: 'AR',
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
      
      let query = supabase.from('venues').select('*');
      
      if (filters?.city) {
        query = query.ilike('city', `%${filters.city}%`);
      }
      if (filters?.state) {
        query = query.ilike('state', filters.state);
      }
      if (filters?.contact_status && filters.contact_status !== 'all') {
        query = query.eq('contact_status', filters.contact_status);
      }
      
      const { data, error } = await query.order('state').order('city').order('name');
      
      if (error) throw error;
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
      // Get user ID
      let userId = null;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        userId = session.user.id;
      } else {
        const loggedInUser = localStorage.getItem('loggedInUser');
        if (loggedInUser) {
          userId = JSON.parse(loggedInUser).id;
        }
      }
      
      if (!userId) {
        alert('You must be logged in to add venues');
        return;
      }

      const { error } = await supabase.from('venues').insert([{
        ...newVenue,
        capacity_min: newVenue.capacity_min ? parseInt(newVenue.capacity_min) : null,
        capacity_max: newVenue.capacity_max ? parseInt(newVenue.capacity_max) : null,
        user_id: userId
      }]);
      
      if (error) throw error;
      
      setShowAddForm(false);
      setNewVenue({
        name: '',
        address: '',
        city: '',
        state: 'AR',
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
      alert('✅ Venue added successfully!');
    } catch (error) {
      console.error('Error adding venue:', error);
      alert('Error adding venue. Please try again.');
    }
  };

  const addDiscoverLocation = () => {
    setDiscoverLocations([...discoverLocations, { city: '', state: 'AR' }]);
  };

  const removeDiscoverLocation = (index: number) => {
    if (discoverLocations.length === 1) return;
    setDiscoverLocations(discoverLocations.filter((_, i) => i !== index));
  };

  const updateDiscoverLocation = (index: number, field: 'city' | 'state', value: string) => {
    const newLocations = [...discoverLocations];
    newLocations[index][field] = value;
    setDiscoverLocations(newLocations);
  };

  const handleDiscoverVenues = async () => {
    const validLocations = discoverLocations.filter(loc => loc.city.trim());
    if (validLocations.length === 0) {
      alert('Please enter at least one city');
      return;
    }

    setIsDiscovering(true);
    try {
      const citiesWithStates = validLocations.map(loc => ({
        city: loc.city.trim(),
        state: loc.state.trim()
      }));

      // Call API route for venue discovery
      const response = await fetch('/api/discover-venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: citiesWithStates,
          radius: discoverRadius
        })
      });

      if (!response.ok) {
        throw new Error('Venue discovery failed');
      }

      const result = await response.json();
      
      alert(`✅ Discovered ${result.venuesFound} venues across ${validLocations.length} location(s)!`);
      setShowDiscoverModal(false);
      setDiscoverLocations([{ city: '', state: 'AR' }]);
      loadVenues();
    } catch (error) {
      console.error('Error discovering venues:', error);
      alert('Error discovering venues. Please try again.');
    } finally {
      setIsDiscovering(false);
    }
  };

  // Group venues by state and city
  const groupedVenues = venues.reduce((acc: any, venue) => {
    const state = venue.state || 'Unknown';
    const city = venue.city || 'Unknown';
    
    if (!acc[state]) acc[state] = {};
    if (!acc[state][city]) acc[state][city] = [];
    acc[state][city].push(venue);
    return acc;
  }, {});

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'booked': return '#87AE73';
      case 'declined': return '#C33';
      case 'awaiting_response': return '#B7410E';
      case 'not_contacted':
      default: return '#708090';
    }
  };

  const getStatusLabel = (status?: string) => {
    return status?.replace(/_/g, ' ').toUpperCase() || 'NOT CONTACTED';
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
      padding: '2rem',
      position: 'relative'
    }}>
      {/* Texture Overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.02\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        opacity: 0.4,
        pointerEvents: 'none'
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '2rem'
        }}>
          <h2 style={{ 
            color: 'white', 
            margin: 0,
            fontSize: '2rem',
            fontWeight: '700',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)'
          }}>
            Venue Database
          </h2>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => setShowDiscoverModal(true)}
              style={{
                padding: '0.875rem 1.75rem',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '1rem',
                boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              🔍 Discover Venues
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              style={{
                padding: '0.875rem 1.75rem',
                background: showAddForm ? 'linear-gradient(135deg, #64748b 0%, #475569 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '1rem',
                boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              {showAddForm ? '✕ Cancel' : '+ Add Venue'}
            </button>
          </div>
        </div>

        {/* Discover Venues Modal */}
        {showDiscoverModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '2rem'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ color: 'white', margin: 0, fontSize: '1.5rem', fontWeight: '700' }}>
                  Discover New Venues
                </h3>
                <button
                  onClick={() => setShowDiscoverModal(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    padding: '0.5rem'
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', marginBottom: '0.75rem', fontWeight: '600', fontSize: '1rem' }}>
                  Search Locations
                </label>
                {discoverLocations.map((location, index) => (
                  <div key={index} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <input
                      type="text"
                      placeholder="City name"
                      value={location.city}
                      onChange={(e) => updateDiscoverLocation(index, 'city', e.target.value)}
                      style={{
                        flex: 2,
                        padding: '0.875rem',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'white',
                        fontSize: '1rem',
                        backdropFilter: 'blur(10px)'
                      }}
                    />
                    <select
                      value={location.state}
                      onChange={(e) => updateDiscoverLocation(index, 'state', e.target.value)}
                      style={{
                        flex: 1,
                        padding: '0.875rem',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: 'rgba(30, 41, 59, 0.95)',
                        color: 'white',
                        fontSize: '1rem',
                        backdropFilter: 'blur(10px)',
                        cursor: 'pointer'
                      }}
                    >
                      {US_STATES.map(state => (
                        <option key={state.code} value={state.code} style={{ background: '#1e293b', color: 'white' }}>
                          {state.code}
                        </option>
                      ))}
                    </select>
                    {discoverLocations.length > 1 && (
                      <button
                        onClick={() => removeDiscoverLocation(index)}
                        style={{
                          padding: '0.875rem',
                          background: 'rgba(239, 68, 68, 0.2)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '6px',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addDiscoverLocation}
                  style={{
                    padding: '0.75rem',
                    background: 'rgba(59, 130, 246, 0.2)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '6px',
                    color: '#3b82f6',
                    cursor: 'pointer',
                    fontWeight: '600',
                    width: '100%',
                    fontSize: '0.95rem'
                  }}
                >
                  + Add Another City
                </button>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', marginBottom: '0.75rem', fontWeight: '600', fontSize: '1rem' }}>
                  Search Radius: {discoverRadius} miles
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={discoverRadius}
                  onChange={(e) => setDiscoverRadius(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <button
                onClick={handleDiscoverVenues}
                disabled={isDiscovering}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: isDiscovering 
                    ? 'linear-gradient(135deg, #64748b 0%, #475569 100%)'
                    : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isDiscovering ? 'not-allowed' : 'pointer',
                  fontWeight: '700',
                  fontSize: '1.05rem',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.2)'
                }}
              >
                {isDiscovering ? '🔍 Discovering...' : '🔍 Start Discovery'}
              </button>
            </div>
          </div>
        )}

        {/* Add Venue Form */}
        {showAddForm && (
          <div style={{
            background: 'rgba(30, 41, 59, 0.8)',
            backdropFilter: 'blur(10px)',
            padding: '2rem',
            borderRadius: '12px',
            marginBottom: '2rem',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ color: 'white', marginTop: 0, fontSize: '1.3rem', fontWeight: '700' }}>Add New Venue</h3>
            <form onSubmit={handleAddVenue}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', marginBottom: '0.5rem', fontWeight: '600' }}>
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
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'white',
                      fontSize: '1rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', marginBottom: '0.5rem', fontWeight: '600' }}>
                    Venue Type
                  </label>
                  <select
                    value={newVenue.venue_type}
                    onChange={(e) => setNewVenue({...newVenue, venue_type: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(30, 41, 59, 0.95)',
                      color: 'white',
                      fontSize: '1rem',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="bar" style={{ background: '#1e293b', color: 'white' }}>Bar</option>
                    <option value="club" style={{ background: '#1e293b', color: 'white' }}>Club</option>
                    <option value="saloon" style={{ background: '#1e293b', color: 'white' }}>Saloon</option>
                    <option value="dancehall" style={{ background: '#1e293b', color: 'white' }}>Dancehall</option>
                    <option value="venue" style={{ background: '#1e293b', color: 'white' }}>Music Venue</option>
                    <option value="honky_tonk" style={{ background: '#1e293b', color: 'white' }}>Honky Tonk</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', marginBottom: '0.5rem', fontWeight: '600' }}>
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
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'white',
                      fontSize: '1rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', marginBottom: '0.5rem', fontWeight: '600' }}>
                    State *
                  </label>
                  <select
                    value={newVenue.state}
                    onChange={(e) => setNewVenue({...newVenue, state: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(30, 41, 59, 0.95)',
                      color: 'white',
                      fontSize: '1rem',
                      cursor: 'pointer'
                    }}
                  >
                    {US_STATES.map(state => (
                      <option key={state.code} value={state.code} style={{ background: '#1e293b', color: 'white' }}>
                        {state.code} - {state.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', marginBottom: '0.5rem', fontWeight: '600' }}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newVenue.phone}
                    onChange={(e) => setNewVenue({...newVenue, phone: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'white',
                      fontSize: '1rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', marginBottom: '0.5rem', fontWeight: '600' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={newVenue.email}
                    onChange={(e) => setNewVenue({...newVenue, email: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'white',
                      fontSize: '1rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Website
                </label>
                <input
                  type="url"
                  value={newVenue.website}
                  onChange={(e) => setNewVenue({...newVenue, website: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'white',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Notes
                </label>
                <textarea
                  value={newVenue.notes}
                  onChange={(e) => setNewVenue({...newVenue, notes: e.target.value})}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'white',
                    fontSize: '1rem',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              <button
                type="submit"
                style={{
                  marginTop: '1.5rem',
                  padding: '0.875rem 2rem',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '1rem',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.2)'
                }}
              >
                Add Venue
              </button>
            </form>
          </div>
        )}

        {/* Search Filters */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.8)',
          backdropFilter: 'blur(10px)',
          padding: '1.5rem',
          borderRadius: '12px',
          marginBottom: '2rem',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr auto auto', gap: '1rem', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', marginBottom: '0.5rem', fontWeight: '600' }}>
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
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'white',
                  fontSize: '1rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', marginBottom: '0.5rem', fontWeight: '600' }}>
                State
              </label>
              <select
                value={searchState}
                onChange={(e) => setSearchState(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(30, 41, 59, 0.95)',
                  color: 'white',
                  fontSize: '1rem',
                  cursor: 'pointer'
                }}
              >
                <option value="" style={{ background: '#1e293b', color: 'white' }}>All States</option>
                {US_STATES.map(state => (
                  <option key={state.code} value={state.code} style={{ background: '#1e293b', color: 'white' }}>
                    {state.code}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', marginBottom: '0.5rem', fontWeight: '600' }}>
                Contact Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(30, 41, 59, 0.95)',
                  color: 'white',
                  fontSize: '1rem',
                  cursor: 'pointer'
                }}
              >
                <option value="all" style={{ background: '#1e293b', color: 'white' }}>All Statuses</option>
                <option value="not_contacted" style={{ background: '#1e293b', color: 'white' }}>Not Contacted</option>
                <option value="awaiting_response" style={{ background: '#1e293b', color: 'white' }}>Awaiting Response</option>
                <option value="booked" style={{ background: '#1e293b', color: 'white' }}>Booked</option>
                <option value="declined" style={{ background: '#1e293b', color: 'white' }}>Declined</option>
              </select>
            </div>

            <button
              onClick={handleSearch}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '700',
                boxShadow: '0 4px 6px rgba(0,0,0,0.2)'
              }}
            >
              Search
            </button>

            <button
              onClick={handleClearSearch}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'rgba(100, 116, 139, 0.5)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '700'
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Results Count */}
        <div style={{ marginBottom: '1.5rem', color: 'rgba(255,255,255,0.8)', fontSize: '1rem' }}>
          Found <strong style={{ color: 'white' }}>{venues.length}</strong> venue{venues.length !== 1 ? 's' : ''}
        </div>

        {/* Venues Display */}
        {loading ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '4rem', 
            color: 'rgba(255,255,255,0.8)',
            background: 'rgba(30, 41, 59, 0.5)',
            borderRadius: '12px',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
            <p style={{ fontSize: '1.1rem' }}>Loading venues...</p>
          </div>
        ) : venues.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '4rem', 
            color: 'rgba(255,255,255,0.8)',
            background: 'rgba(30, 41, 59, 0.5)',
            borderRadius: '12px',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎸</div>
            <p style={{ fontSize: '1.1rem', fontWeight: '600' }}>No venues found</p>
            <p style={{ color: 'rgba(255,255,255,0.6)' }}>Try adjusting your search or discover new venues!</p>
          </div>
        ) : (
          <div>
            {Object.keys(groupedVenues).sort().map((state) => (
              <div key={state} style={{ marginBottom: '2rem' }}>
                {/* State Header */}
                <div style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white',
                  padding: '1rem 1.5rem',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  fontWeight: '700',
                  fontSize: '1.2rem',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.2)'
                }}>
                  {state}
                </div>

                {/* Cities within State */}
                {Object.keys(groupedVenues[state]).sort().map((city) => (
                  <div key={`${state}-${city}`} style={{ marginBottom: '1.5rem' }}>
                    {/* City Header */}
                    <div style={{
                      background: 'rgba(59, 130, 246, 0.3)',
                      backdropFilter: 'blur(10px)',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      color: 'white',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '8px',
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
                            background: 'rgba(30, 41, 59, 0.6)',
                            backdropFilter: 'blur(10px)',
                            borderRadius: '8px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            transition: 'all 0.2s',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(30, 41, 59, 0.8)';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(30, 41, 59, 0.6)';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                            <div style={{ flex: 1 }}>
                              <h4 style={{ color: 'white', marginBottom: '0.5rem', marginTop: 0, fontSize: '1.2rem', fontWeight: '700' }}>
                                {venue.name}
                              </h4>
                              
                              {venue.venue_type && (
                                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', margin: '0.25rem 0' }}>
                                  🏛️ {venue.venue_type.replace(/_/g, ' ').toUpperCase()}
                                </p>
                              )}
                              
                              {venue.address && (
                                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', margin: '0.25rem 0' }}>
                                  📍 {venue.address}
                                </p>
                              )}
                              
                              {venue.phone && (
                                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', margin: '0.25rem 0' }}>
                                  📞 {venue.phone}
                                </p>
                              )}
                              
                              {venue.email && (
                                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', margin: '0.25rem 0' }}>
                                  ✉️ {venue.email}
                                </p>
                              )}
                              
                              {venue.website && (
                                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', margin: '0.25rem 0' }}>
                                  🌐 <a 
                                    href={venue.website} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    style={{ color: '#60a5fa', textDecoration: 'none' }}
                                  >
                                    {venue.website}
                                  </a>
                                </p>
                              )}

                              {venue.notes && (
                                <p style={{ 
                                  color: 'rgba(255,255,255,0.6)', 
                                  fontSize: '0.9rem', 
                                  margin: '0.75rem 0 0 0',
                                  fontStyle: 'italic',
                                  paddingTop: '0.5rem',
                                  borderTop: '1px solid rgba(255,255,255,0.1)'
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
                              fontWeight: '700',
                              whiteSpace: 'nowrap',
                              marginLeft: '1rem',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
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
    </div>
  );
}
