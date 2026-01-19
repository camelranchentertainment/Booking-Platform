import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function CampaignBoard() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    targetRegions: [] as string[]
  });
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [venues, setVenues] = useState<any[]>([]);
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [filterCity, setFilterCity] = useState('');
  const [filterState, setFilterState] = useState('');

  useEffect(() => {
    loadCampaigns();
    loadVenues();
  }, []);

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

  const loadVenues = async () => {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVenues(data || []);
    } catch (error) {
      console.error('Error loading venues:', error);
    }
  };

  const createCampaign = async () => {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .insert([{
          name: newCampaign.name,
          description: newCampaign.description,
          status: 'draft',
          target_regions: newCampaign.targetRegions
        }])
        .select()
        .single();

      if (error) throw error;

      setShowNewCampaign(false);
      setNewCampaign({ name: '', description: '', targetRegions: [] });
      loadCampaigns();
    } catch (error) {
      console.error('Error creating campaign:', error);
    }
  };

  const addVenuesToCampaign = async (campaignId: string) => {
    if (selectedVenues.length === 0) {
      alert('Please select venues to add to campaign');
      return;
    }

    try {
      // Add venues to campaign_venues junction table
      const venueLinks = selectedVenues.map(venueId => ({
        campaign_id: campaignId,
        venue_id: venueId
      }));

      const { error } = await supabase
        .from('campaign_venues')
        .insert(venueLinks);

      if (error) throw error;

      // Update campaign total_venues count
      const { error: updateError } = await supabase
        .from('campaigns')
        .update({ total_venues: selectedVenues.length })
        .eq('id', campaignId);

      if (updateError) throw updateError;

      alert(`✅ Added ${selectedVenues.length} venues to campaign!`);
      setSelectedVenues([]);
      setSelectedCampaign(null);
      loadCampaigns();
    } catch (error: any) {
      console.error('Error adding venues to campaign:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const sendCampaignEmails = async (campaignId: string) => {
    if (selectedVenues.length === 0) {
      alert('Please select venues to contact');
      return;
    }

    const confirmed = window.confirm(`Send emails to ${selectedVenues.length} venue(s)?`);
    if (!confirmed) return;

    // Get default template
    const { data: templates } = await supabase
      .from('email_templates')
      .select('*')
      .limit(1);

    if (!templates || templates.length === 0) {
      alert('No email template found. Please create one first.');
      return;
    }

    const templateId = templates[0].id;

    for (const venueId of selectedVenues) {
      try {
        await fetch('/api/emails/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            venueId,
            campaignId,
            templateId,
            customizations: {
              season: 'summer 2026'
            }
          })
        });
      } catch (error) {
        console.error(`Error sending email for venue ${venueId}:`, error);
      }
    }

    alert('Emails sent successfully!');
    setSelectedVenues([]);
    loadCampaigns();
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      'draft': 'bg-gray-100 text-gray-800',
      'active': 'bg-blue-100 text-blue-800',
      'paused': 'bg-yellow-100 text-yellow-800',
      'completed': 'bg-green-100 text-green-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  // Get unique cities and states for filtering
  const cities = [...new Set(venues.map(v => v.city))].sort();
  const states = [...new Set(venues.map(v => v.state))].sort();

  // Filter venues - show ALL venues when campaign is selected
  const filteredVenues = selectedCampaign
    ? venues.filter(v => {
        const cityMatch = !filterCity || v.city === filterCity;
        const stateMatch = !filterState || v.state === filterState;
        return cityMatch && stateMatch;
      })
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Email Campaigns</h2>
        <button
          onClick={() => setShowNewCampaign(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
        >
          ➕ New Campaign
        </button>
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {campaigns.map((campaign) => (
          <div
            key={campaign.id}
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer"
            onClick={() => setSelectedCampaign(campaign)}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-lg font-semibold">{campaign.name}</h3>
              <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(campaign.status)}`}>
                {campaign.status}
              </span>
            </div>

            {campaign.description && (
              <p className="text-sm text-gray-600 mb-4">{campaign.description}</p>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-xs text-gray-600">Total Venues</div>
                <div className="text-lg font-semibold">{campaign.total_venues || 0}</div>
              </div>
              <div className="bg-yellow-50 p-2 rounded">
                <div className="text-xs text-gray-600">Contacted</div>
                <div className="text-lg font-semibold">{campaign.contacted || 0}</div>
              </div>
              <div className="bg-blue-50 p-2 rounded">
                <div className="text-xs text-gray-600">Responses</div>
                <div className="text-lg font-semibold">{campaign.responses || 0}</div>
              </div>
              <div className="bg-green-50 p-2 rounded">
                <div className="text-xs text-gray-600">Bookings</div>
                <div className="text-lg font-semibold">{campaign.bookings || 0}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {campaigns.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          <div className="text-4xl mb-4">📧</div>
          <p>No campaigns yet. Create your first campaign to start reaching out to venues!</p>
        </div>
      )}

      {/* New Campaign Modal */}
      {showNewCampaign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Create New Campaign</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  placeholder="e.g., Summer 2026 Tour"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newCampaign.description}
                  onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                  placeholder="Campaign details..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowNewCampaign(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={createCampaign}
                disabled={!newCampaign.name}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:bg-gray-300"
              >
                Create Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Detail Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-bold">{selectedCampaign.name}</h3>
                {selectedCampaign.description && (
                  <p className="text-gray-600 mt-1">{selectedCampaign.description}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedCampaign(null);
                  setSelectedVenues([]);
                  setFilterCity('');
                  setFilterState('');
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>

            {/* Filters */}
            <div className="mb-4 flex gap-3">
              <select
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">All Cities</option>
                {cities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>

              <select
                value={filterState}
                onChange={(e) => setFilterState(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">All States</option>
                {states.map(state => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>

              <button
                onClick={() => {
                  if (filteredVenues.length === selectedVenues.length) {
                    setSelectedVenues([]);
                  } else {
                    setSelectedVenues(filteredVenues.map(v => v.id));
                  }
                }}
                className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {filteredVenues.length === selectedVenues.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* Select Venues */}
            <div className="mb-4">
              <h4 className="font-semibold mb-2">
                Select Venues to Add ({selectedVenues.length} selected, {filteredVenues.length} total)
              </h4>
              <div className="max-h-96 overflow-y-auto border border-gray-200 rounded">
                {filteredVenues.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No venues found. Try different filters or discover more venues first.
                  </div>
                ) : (
                  filteredVenues.map((venue) => (
                    <label
                      key={venue.id}
                      className="flex items-center p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100"
                    >
                      <input
                        type="checkbox"
                        checked={selectedVenues.includes(venue.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedVenues([...selectedVenues, venue.id]);
                          } else {
                            setSelectedVenues(selectedVenues.filter(id => id !== venue.id));
                          }
                        }}
                        className="mr-3 w-4 h-4"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{venue.name}</div>
                        <div className="text-sm text-gray-600">
                          {venue.city}, {venue.state}
                          {venue.venue_type && ` • ${venue.venue_type}`}
                          {venue.phone && ` • ${venue.phone}`}
                        </div>
                        {venue.email && (
                          <div className="text-xs text-blue-600">📧 {venue.email}</div>
                        )}
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedCampaign(null);
                  setSelectedVenues([]);
                  setFilterCity('');
                  setFilterState('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition"
              >
                Close
              </button>
              <button
                onClick={() => addVenuesToCampaign(selectedCampaign.id)}
                disabled={selectedVenues.length === 0}
                className={`flex-1 px-4 py-2 rounded-md transition ${
                  selectedVenues.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                ✅ Add {selectedVenues.length} Venue(s) to Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
