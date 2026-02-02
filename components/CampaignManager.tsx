'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Campaign {
  id: string;
  name: string;
  date_range_start: string;
  date_range_end: string;
  cities: string[];
  radius: number;
  status: string;
  created_at: string;
  total_venues?: number;
  contacted?: number;
  confirmed?: number;
}

interface Venue {
  id: string;
  name: string;
  city: string;
  state: string;
  address?: string;
  phone?: string;
  email?: string;
  venue_type?: string;
  contact_status?: string;
  in_campaign?: boolean;
}

interface CampaignManagerProps {
  initialData?: any;
}

export default function CampaignManager({ initialData }: CampaignManagerProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [discoveredVenues, setDiscoveredVenues] = useState<Venue[]>([]);
  const [campaignVenues, setCampaignVenues] = useState<any[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([]);

  const [newCampaign, setNewCampaign] = useState({
    name: '',
    date_range_start: '',
    date_range_end: '',
    locations: [{ city: '', state: 'TX' }], // Array of {city, state} objects
    radius: 10
  });

  const addLocationRow = () => {
    setNewCampaign({
      ...newCampaign,
      locations: [...newCampaign.locations, { city: '', state: 'TX' }]
    });
  };

  const removeLocationRow = (index: number) => {
    if (newCampaign.locations.length === 1) return; // Keep at least one row
    const newLocations = newCampaign.locations.filter((_, i) => i !== index);
    setNewCampaign({ ...newCampaign, locations: newLocations });
  };

  const updateLocation = (index: number, field: 'city' | 'state', value: string) => {
    const newLocations = [...newCampaign.locations];
    newLocations[index][field] = value;
    setNewCampaign({ ...newCampaign, locations: newLocations });
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    // Handle navigation from Dashboard
    if (initialData?.campaignId) {
      const campaign = campaigns.find(c => c.id === initialData.campaignId);
      if (campaign) {
        openCampaignDetail(campaign);
      }
    }
  }, [initialData, campaigns]);

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error) {
      console.error('Error loading campaigns:', error);
    }
  };

  const createCampaign = async () => {
    if (!newCampaign.name) {
      alert('Please enter campaign name');
      return;
    }

    // Validate at least one city is filled
    const validLocations = newCampaign.locations.filter(loc => loc.city.trim());
    if (validLocations.length === 0) {
      alert('Please enter at least one city');
      return;
    }

    try {
      // Get current user
      const { data: { session } } = await supabase.auth.getSession();
      
      // Fallback to localStorage if no session
      let userId = session?.user?.id;
      if (!userId) {
        const loggedInUser = localStorage.getItem('loggedInUser');
        if (loggedInUser) {
          userId = JSON.parse(loggedInUser).id;
        }
      }
      
      if (!userId) {
        alert('You must be logged in to create a campaign');
        return;
      }

      // Store cities with states as "City, ST" format
      const citiesWithStates = validLocations.map(loc => `${loc.city.trim()}, ${loc.state.trim().toUpperCase()}`);
      
      console.log('Creating campaign with data:', {
        name: newCampaign.name,
        cities: citiesWithStates,
        user_id: userId
      });

      const { data, error } = await supabase
        .from('campaigns')
        .insert([{
          name: newCampaign.name,
          date_range_start: newCampaign.date_range_start || null,
          date_range_end: newCampaign.date_range_end || null,
          cities: citiesWithStates,
          radius: newCampaign.radius,
          status: 'active',
          user_id: userId
        }])
        .select()
        .single();

      if (error) {
        console.error('Campaign creation error:', error);
        throw error;
      }

      console.log('Campaign created successfully:', data);

      alert('✅ Campaign created! Starting venue discovery...');
      setShowCreateModal(false);
      setNewCampaign({ name: '', date_range_start: '', date_range_end: '', locations: [{ city: '', state: 'TX' }], radius: 10 });
      
      // Auto-discover venues for the new campaign
      setSelectedCampaign(data);
      await discoverVenuesForCampaign(data);
      
      loadCampaigns();
    } catch (error) {
      console.error('Error creating campaign:', error);
      alert(`Error creating campaign: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const discoverVenuesForCampaign = async (campaign: Campaign) => {
    setIsDiscovering(true);
    try {
      console.log(`Calling venue discovery API for campaign ${campaign.id}...`);
      
      const response = await fetch(`/api/campaigns/${campaign.id}/discover-venues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to discover venues');
      }

      const result = await response.json();
      
      console.log('Discovery result:', result);
      
      setDiscoveredVenues(result.venues || []);
      
      if (result.newVenuesDiscovered > 0) {
        alert(`✅ Discovered ${result.newVenuesDiscovered} new venues! Total: ${result.totalVenues} venues available.`);
      } else {
        alert(`Found ${result.totalVenues} existing venues for this campaign!`);
      }
    } catch (error) {
      console.error('Error discovering venues:', error);
      alert(`Error discovering venues: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDiscovering(false);
    }
  };

  const openCampaignDetail = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setSelectedVenueIds([]);
    
    // Ensure cities is an array
    if (typeof campaign.cities === 'string') {
      campaign.cities = [campaign.cities];
    } else if (!Array.isArray(campaign.cities)) {
      campaign.cities = [];
    }
    
    // Load venues already in this campaign
    const { data: campaignVenuesData } = await supabase
      .from('campaign_venues')
      .select(`
        *,
        venue:venues(*)
      `)
      .eq('campaign_id', campaign.id);

    setCampaignVenues(campaignVenuesData || []);

    // Load all venues for campaign cities
    if (campaign.cities && campaign.cities.length > 0) {
      // Parse cities from "City, ST" format
      const cityNames = campaign.cities.map(cityState => {
        const parts = cityState.split(',');
        return parts[0].trim();
      });

      const { data: allVenues } = await supabase
        .from('venues')
        .select('*')
        .in('city', cityNames);
      
      setDiscoveredVenues(allVenues || []);
    }
  };

  const addVenuesToCampaign = async () => {
    if (!selectedCampaign || selectedVenueIds.length === 0) {
      alert('Please select venues to add');
      return;
    }

    try {
      const venueLinks = selectedVenueIds.map(venueId => ({
        campaign_id: selectedCampaign.id,
        venue_id: venueId,
        status: 'contact?'
      }));

      const { error } = await supabase
        .from('campaign_venues')
        .insert(venueLinks);

      if (error) throw error;

      alert(`✅ Added ${selectedVenueIds.length} venues to campaign!`);
      setSelectedVenueIds([]);
      openCampaignDetail(selectedCampaign); // Refresh
    } catch (error) {
      console.error('Error adding venues:', error);
      alert('Error adding venues to campaign');
    }
  };

  const updateVenueStatus = async (campaignVenueId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('campaign_venues')
        .update({ status })
        .eq('id', campaignVenueId);

      if (error) throw error;

      if (selectedCampaign) {
        openCampaignDetail(selectedCampaign); // Refresh
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const updateVenueEmail = async (venueId: string, email: string) => {
    try {
      const { error } = await supabase
        .from('venues')
        .update({ email })
        .eq('id', venueId);

      if (error) throw error;

      if (selectedCampaign) {
        openCampaignDetail(selectedCampaign); // Refresh
      }
    } catch (error) {
      console.error('Error updating email:', error);
    }
  };

  const removeVenueFromCampaign = async (campaignVenueId: string) => {
    if (!confirm('Remove this venue from the campaign?')) return;

    try {
      const { error } = await supabase
        .from('campaign_venues')
        .delete()
        .eq('id', campaignVenueId);

      if (error) throw error;

      if (selectedCampaign) {
        openCampaignDetail(selectedCampaign); // Refresh
      }

      alert('✅ Venue removed from campaign');
    } catch (error) {
      console.error('Error removing venue:', error);
      alert('Error removing venue from campaign');
    }
  };

  const deleteCampaign = async (campaignId: string, campaignName: string) => {
    if (!confirm(`Delete campaign "${campaignName}"? This will remove all venues from this campaign.`)) return;

    try {
      // First delete all campaign_venues entries
      await supabase
        .from('campaign_venues')
        .delete()
        .eq('campaign_id', campaignId);

      // Then delete the campaign
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaignId);

      if (error) throw error;

      alert('✅ Campaign deleted');
      loadCampaigns(); // Refresh list
      setSelectedCampaign(null); // Clear selection if viewing deleted campaign
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert('Error deleting campaign');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: { [key: string]: React.CSSProperties } = {
      'contact?': { background: '#A8A8A8', color: 'white' },
      'pending': { background: '#B7410E', color: 'white' },
      'declined': { background: '#C84630', color: 'white' },
      'booked': { background: '#87AE73', color: 'white' }
    };

    return (
      <span style={{
        ...styles[status],
        padding: '0.25rem 0.75rem',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: '700',
        textTransform: 'uppercase'
      }}>
        {status === 'contact?' ? 'Contact?' : status}
      </span>
    );
  };

  // Group venues by city
  const groupVenuesByCity = (venues: Venue[]) => {
    const grouped: { [city: string]: Venue[] } = {};
    venues.forEach(venue => {
      if (!grouped[venue.city]) {
        grouped[venue.city] = [];
      }
      grouped[venue.city].push(venue);
    });
    return grouped;
  };

  return (
    <div style={{ padding: '2rem' }}>
      <style jsx>{`
        .campaign-container {
          background: linear-gradient(135deg, #2C1810 0%, #3D2817 50%, #2C1810 100%);
          min-height: 100vh;
          padding: 2rem;
        }
        
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }
        
        .create-btn {
          background: #87AE73;
          color: white;
          border: none;
          padding: 1rem 2rem;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 700;
          font-size: 1.1rem;
          transition: all 0.3s ease;
        }
        
        .create-btn:hover {
          background: #6B8E5C;
          transform: translateY(-2px);
        }
        
        .campaigns-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 20px;
        }
        
        .campaign-card {
          background: linear-gradient(135deg, rgba(61, 40, 23, 0.9), rgba(74, 50, 32, 0.9));
          border: 2px solid #5C4A3A;
          border-radius: 12px;
          padding: 25px;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        .campaign-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 25px rgba(0,0,0,0.4);
          border-color: #C8A882;
        }
        
        .modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 2rem;
        }
        
        .modal-content {
          background: linear-gradient(135deg, #3D2817, #4A3220);
          border: 3px solid #8B6F47;
          border-radius: 15px;
          padding: 2.5rem;
          max-width: 600px;
          width: 100%;
        }
        
        .form-group {
          margin-bottom: 1.5rem;
        }
        
        .form-label {
          display: block;
          color: #C8A882;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }
        
        .form-input {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid #5C4A3A;
          border-radius: 6px;
          background: rgba(245, 245, 240, 0.1);
          color: #E8DCC4;
          font-size: 1rem;
        }
        
        .form-input:focus {
          outline: none;
          border-color: #C8A882;
        }
        
        .venue-tile {
          background: rgba(61, 40, 23, 0.6);
          border: 2px solid #5C4A3A;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1rem;
        }
        
        .venue-tile:hover {
          border-color: #8B6F47;
        }
      `}</style>

      <div className="campaign-container">
        <div className="header">
          <div>
            <h2 style={{ color: '#C8A882', fontSize: '1.8rem', margin: 0 }}>🎯 Campaign Manager</h2>
            <p style={{ color: '#9B8A7A', margin: 0 }}>Create campaigns, discover venues, manage bookings</p>
          </div>
          <button className="create-btn" onClick={() => setShowCreateModal(true)}>
            ➕ Create Campaign
          </button>
        </div>

        {/* Campaign Cards */}
        {!selectedCampaign && (
          <div className="campaigns-grid">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="campaign-card"
                style={{ position: 'relative' }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCampaign(campaign.id, campaign.name);
                  }}
                  style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    background: '#C84630',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.5rem 0.75rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    zIndex: 10
                  }}
                  title="Delete campaign"
                >
                  🗑️ Delete
                </button>
                <div onClick={() => openCampaignDetail(campaign)}>
                  <h3 style={{ color: '#C8A882', fontSize: '1.4rem', marginBottom: '1rem' }}>
                    {campaign.name}
                  </h3>
                
                {campaign.date_range_start && (
                  <div style={{ color: '#E8DCC4', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    📅 {new Date(campaign.date_range_start).toLocaleDateString()} - {new Date(campaign.date_range_end).toLocaleDateString()}
                  </div>
                )}

                  <div style={{ color: '#9B8A7A', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    📍 {campaign.cities?.join(', ')} ({campaign.radius}mi radius)
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '1rem',
                    marginTop: '1rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid #5C4A3A'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#C8A882', fontSize: '1.5rem', fontWeight: '700' }}>
                        {campaign.total_venues || 0}
                      </div>
                      <div style={{ color: '#E8DCC4', fontSize: '0.75rem' }}>Venues</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#B7410E', fontSize: '1.5rem', fontWeight: '700' }}>
                        {campaign.contacted || 0}
                      </div>
                      <div style={{ color: '#E8DCC4', fontSize: '0.75rem' }}>Contacted</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#87AE73', fontSize: '1.5rem', fontWeight: '700' }}>
                        {campaign.confirmed || 0}
                      </div>
                      <div style={{ color: '#E8DCC4', fontSize: '0.75rem' }}>Booked</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Campaign Detail View */}
        {selectedCampaign && (
          <div>
            <button
              onClick={() => {
                setSelectedCampaign(null);
                setDiscoveredVenues([]);
                setCampaignVenues([]);
              }}
              style={{
                background: '#708090',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                cursor: 'pointer',
                marginBottom: '2rem'
              }}
            >
              ← Back to Campaigns
            </button>

            <h2 style={{ color: '#C8A882', marginBottom: '2rem' }}>{selectedCampaign.name}</h2>

            {/* Campaign Venues - Detailed Tiles */}
            {campaignVenues.length > 0 && (
              <div style={{ marginBottom: '3rem' }}>
                <h3 style={{ color: '#C8A882', marginBottom: '1.5rem', fontSize: '1.5rem' }}>
                  📋 Campaign Venues ({campaignVenues.length})
                </h3>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
                  gap: '1.5rem'
                }}>
                  {campaignVenues.map((cv) => (
                    <div 
                      key={cv.id} 
                      style={{
                        background: 'linear-gradient(135deg, rgba(61, 40, 23, 0.8), rgba(74, 50, 32, 0.8))',
                        border: '2px solid #5C4A3A',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        position: 'relative',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#C8A882'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = '#5C4A3A'}
                    >
                      {/* Remove Button */}
                      <button
                        onClick={() => removeVenueFromCampaign(cv.id)}
                        style={{
                          position: 'absolute',
                          top: '0.75rem',
                          right: '0.75rem',
                          background: '#C84630',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '0.35rem 0.6rem',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: '600'
                        }}
                        title="Remove from campaign"
                      >
                        ✕
                      </button>

                      {/* Venue Name */}
                      <h4 style={{ 
                        color: '#C8A882', 
                        fontSize: '1.2rem', 
                        fontWeight: '700',
                        marginBottom: '1rem',
                        marginRight: '2rem'
                      }}>
                        {cv.venue.name}
                      </h4>

                      {/* Venue Details Grid */}
                      <div style={{ marginBottom: '1rem', color: '#E8DCC4', fontSize: '0.9rem' }}>
                        {/* Address */}
                        {cv.venue.address && (
                          <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                            <span style={{ color: '#9B8A7A' }}>📍</span>
                            <span>{cv.venue.address}</span>
                          </div>
                        )}
                        
                        {/* City, State */}
                        {!cv.venue.address && (
                          <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                            <span style={{ color: '#9B8A7A' }}>📍</span>
                            <span>{cv.venue.city}, {cv.venue.state}</span>
                          </div>
                        )}

                        {/* Phone */}
                        {cv.venue.phone && (
                          <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                            <span style={{ color: '#9B8A7A' }}>📞</span>
                            <a 
                              href={`tel:${cv.venue.phone}`}
                              style={{ color: '#E8DCC4', textDecoration: 'none' }}
                            >
                              {cv.venue.phone}
                            </a>
                          </div>
                        )}

                        {/* Website */}
                        {cv.venue.website && (
                          <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                            <span style={{ color: '#9B8A7A' }}>🌐</span>
                            <a 
                              href={cv.venue.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ 
                                color: '#87AE73', 
                                textDecoration: 'none',
                                wordBreak: 'break-all'
                              }}
                            >
                              {cv.venue.website.replace(/^https?:\/\/(www\.)?/, '')}
                            </a>
                          </div>
                        )}

                        {/* Email Input */}
                        <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span style={{ color: '#9B8A7A' }}>📧</span>
                          <input
                            type="email"
                            placeholder="Add email address..."
                            defaultValue={cv.venue.email || ''}
                            onBlur={(e) => {
                              if (e.target.value && e.target.value !== cv.venue.email) {
                                updateVenueEmail(cv.venue.id, e.target.value);
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: '0.5rem',
                              border: '1px solid #5C4A3A',
                              borderRadius: '4px',
                              background: 'rgba(245, 245, 240, 0.1)',
                              color: '#E8DCC4',
                              fontSize: '0.9rem'
                            }}
                          />
                        </div>
                      </div>

                      {/* Status Controls */}
                      <div style={{ 
                        display: 'flex', 
                        gap: '0.75rem', 
                        alignItems: 'center',
                        paddingTop: '1rem',
                        borderTop: '1px solid #5C4A3A'
                      }}>
                        {getStatusBadge(cv.status || 'contact?')}
                        <select
                          value={cv.status || 'contact?'}
                          onChange={(e) => updateVenueStatus(cv.id, e.target.value)}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            border: '1px solid #5C4A3A',
                            borderRadius: '4px',
                            background: 'rgba(245, 245, 240, 0.1)',
                            color: '#E8DCC4',
                            cursor: 'pointer',
                            fontSize: '0.9rem'
                          }}
                        >
                          <option value="contact?">Contact?</option>
                          <option value="pending">Pending</option>
                          <option value="declined">Declined</option>
                          <option value="booked">Booked</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Discovered Venues - Selection */}
            {discoveredVenues.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ color: '#C8A882' }}>🔍 Discovered Venues ({selectedVenueIds.length} selected)</h3>
                  {selectedVenueIds.length > 0 && (
                    <button
                      onClick={addVenuesToCampaign}
                      style={{
                        background: '#87AE73',
                        color: 'white',
                        border: 'none',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '700'
                      }}
                    >
                      ✅ Add {selectedVenueIds.length} to Campaign
                    </button>
                  )}
                </div>

                {Object.entries(groupVenuesByCity(discoveredVenues)).map(([city, venues]) => (
                  <div key={city} style={{ marginBottom: '2rem' }}>
                    <h4 style={{ color: '#E8DCC4', marginBottom: '1rem' }}>📍 {city}</h4>
                    {venues.map((venue) => (
                      <div key={venue.id} className="venue-tile">
                        <label style={{ display: 'flex', alignItems: 'start', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={selectedVenueIds.includes(venue.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedVenueIds([...selectedVenueIds, venue.id]);
                              } else {
                                setSelectedVenueIds(selectedVenueIds.filter(id => id !== venue.id));
                              }
                            }}
                            style={{ marginRight: '1rem', marginTop: '0.25rem', width: '18px', height: '18px' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: '600', color: '#C8A882', marginBottom: '0.25rem' }}>
                              {venue.name}
                            </div>
                            <div style={{ color: '#9B8A7A', fontSize: '0.9rem' }}>
                              {venue.address}
                              {venue.phone && ` • ${venue.phone}`}
                              {venue.venue_type && ` • ${venue.venue_type}`}
                            </div>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {discoveredVenues.length === 0 && campaignVenues.length === 0 && !isDiscovering && (
              <div style={{
                textAlign: 'center',
                padding: '3rem',
                background: 'rgba(61, 40, 23, 0.5)',
                borderRadius: '12px',
                border: '2px dashed #5C4A3A'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎸</div>
                <p style={{ color: '#9B8A7A', marginBottom: '1.5rem' }}>
                  No venues discovered yet for this campaign.
                </p>
                <button
                  onClick={() => discoverVenuesForCampaign(selectedCampaign)}
                  style={{
                    background: '#87AE73',
                    color: 'white',
                    border: 'none',
                    padding: '1rem 2rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '700',
                    fontSize: '1.1rem'
                  }}
                >
                  🔍 Discover Venues
                </button>
              </div>
            )}

            {isDiscovering && (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#C8A882' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
                <p>Discovering venues in {selectedCampaign.cities?.join(', ')}...</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="modal" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: '#C8A882', marginBottom: '2rem' }}>Create New Campaign</h2>

            <div className="form-group">
              <label className="form-label">Campaign Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Texas Summer Tour 2026"
                value={newCampaign.name}
                onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={newCampaign.date_range_start}
                  onChange={(e) => setNewCampaign({ ...newCampaign, date_range_start: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">End Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={newCampaign.date_range_end}
                  onChange={(e) => setNewCampaign({ ...newCampaign, date_range_end: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Cities & States *</label>
              {newCampaign.locations.map((location, index) => (
                <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="City name"
                    value={location.city}
                    onChange={(e) => updateLocation(index, 'city', e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <select
                    className="form-input"
                    value={location.state}
                    onChange={(e) => updateLocation(index, 'state', e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="AL">AL</option>
                    <option value="AR">AR</option>
                    <option value="AZ">AZ</option>
                    <option value="CA">CA</option>
                    <option value="CO">CO</option>
                    <option value="FL">FL</option>
                    <option value="GA">GA</option>
                    <option value="IA">IA</option>
                    <option value="IL">IL</option>
                    <option value="IN">IN</option>
                    <option value="KS">KS</option>
                    <option value="KY">KY</option>
                    <option value="LA">LA</option>
                    <option value="MN">MN</option>
                    <option value="MO">MO</option>
                    <option value="MS">MS</option>
                    <option value="NC">NC</option>
                    <option value="NE">NE</option>
                    <option value="NM">NM</option>
                    <option value="NV">NV</option>
                    <option value="NY">NY</option>
                    <option value="OH">OH</option>
                    <option value="OK">OK</option>
                    <option value="OR">OR</option>
                    <option value="PA">PA</option>
                    <option value="SC">SC</option>
                    <option value="TN">TN</option>
                    <option value="TX">TX</option>
                    <option value="UT">UT</option>
                    <option value="VA">VA</option>
                    <option value="WA">WA</option>
                    <option value="WI">WI</option>
                    <option value="WY">WY</option>
                  </select>
                  {index === newCampaign.locations.length - 1 ? (
                    <button
                      type="button"
                      onClick={addLocationRow}
                      style={{
                        padding: '0.75rem',
                        background: '#87AE73',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '1.2rem'
                      }}
                      title="Add another city"
                    >
                      +
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => removeLocationRow(index)}
                      style={{
                        padding: '0.75rem',
                        background: '#C84630',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '1.2rem'
                      }}
                      title="Remove this city"
                    >
                      −
                    </button>
                  )}
                </div>
              ))}
              <div style={{ color: '#9B8A7A', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                Add as many cities as needed for your tour
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Search Radius</label>
              <select
                className="form-input"
                value={newCampaign.radius}
                onChange={(e) => setNewCampaign({ ...newCampaign, radius: parseInt(e.target.value) })}
              >
                <option value="5">5 miles</option>
                <option value="10">10 miles</option>
                <option value="15">15 miles</option>
                <option value="20">20 miles</option>
                <option value="30">30 miles</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewCampaign({ name: '', date_range_start: '', date_range_end: '', locations: [{ city: '', state: 'TX' }], radius: 10 });
                }}
                style={{
                  flex: 1,
                  padding: '1rem',
                  background: 'transparent',
                  border: '2px solid #708090',
                  color: '#708090',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
              <button
                onClick={createCampaign}
                style={{
                  flex: 1,
                  padding: '1rem',
                  background: '#87AE73',
                  border: 'none',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '700'
                }}
              >
                Create & Discover Venues
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
