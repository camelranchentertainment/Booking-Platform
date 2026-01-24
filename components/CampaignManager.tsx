'use client';

import { useState, useEffect } from 'react';
import { getCampaigns, updateCampaign, deleteCampaign } from '../lib/supabase';

interface Campaign {
  id: string;
  booking_run_id: string;
  venue_id: string;
  status: string;
  contact_date?: string;
  response_date?: string;
  notes?: string;
  created_at: string;
  venue_name?: string;
  venue_city?: string;
  venue_state?: string;
  booking_run_name?: string;
}

export default function CampaignManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const data = await getCampaigns();
      setCampaigns(data || []);
    } catch (error) {
      console.error('Error loading campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (campaignId: string, newStatus: string) => {
    try {
      await updateCampaign(campaignId, { 
        status: newStatus,
        response_date: newStatus === 'booked' || newStatus === 'declined' ? new Date().toISOString() : null
      });
      loadCampaigns();
    } catch (error) {
      console.error('Error updating campaign:', error);
      alert('Error updating campaign status');
    }
  };

  const handleDelete = async (campaignId: string, venueName: string) => {
    if (confirm(`Delete campaign for ${venueName}?`)) {
      try {
        await deleteCampaign(campaignId);
        loadCampaigns();
        alert('Campaign deleted successfully!');
      } catch (error) {
        console.error('Error deleting campaign:', error);
        alert('Error deleting campaign');
      }
    }
  };

  const filteredCampaigns = filterStatus === 'all' 
    ? campaigns 
    : campaigns.filter(c => c.status === filterStatus);

  const getStatusColor = (status: string) => {
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

  const groupByBookingRun = () => {
    const grouped: { [key: string]: Campaign[] } = {};
    filteredCampaigns.forEach(campaign => {
      const runName = campaign.booking_run_name || 'No Booking Run';
      if (!grouped[runName]) {
        grouped[runName] = [];
      }
      grouped[runName].push(campaign);
    });
    return grouped;
  };

  const groupedCampaigns = groupByBookingRun();

  return (
    <div style={{ padding: '2rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: '#5D4E37', margin: 0 }}>Campaign Manager</h2>
        <p style={{ color: '#708090', margin: '0.5rem 0 0 0' }}>
          Track and manage all your venue outreach campaigns
        </p>
      </div>

      {/* Filters */}
      <div style={{
        background: '#F5F5F0',
        padding: '1.5rem',
        borderRadius: '8px',
        marginBottom: '2rem',
        display: 'flex',
        gap: '1rem',
        alignItems: 'center'
      }}>
        <label style={{ color: '#5D4E37', fontWeight: '600' }}>Filter by Status:</label>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: '0.75rem',
            borderRadius: '4px',
            border: '1px solid #D3D3D3',
            fontSize: '1rem',
            minWidth: '200px'
          }}
        >
          <option value="all">All Campaigns</option>
          <option value="not_contacted">Not Contacted</option>
          <option value="awaiting_response">Awaiting Response</option>
          <option value="booked">Booked</option>
          <option value="declined">Declined</option>
        </select>

        <div style={{ marginLeft: 'auto', color: '#708090' }}>
          {filteredCampaigns.length} campaign{filteredCampaigns.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Campaigns List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#708090' }}>
          Loading campaigns...
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#708090' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📧</div>
          <p>No campaigns found. Create a booking run and add venues to start campaigns!</p>
        </div>
      ) : (
        <div>
          {Object.keys(groupedCampaigns).map((runName) => (
            <div key={runName} style={{ marginBottom: '2rem' }}>
              {/* Booking Run Header */}
              <div style={{
                background: '#5D4E37',
                color: 'white',
                padding: '1rem 1.5rem',
                borderRadius: '6px',
                marginBottom: '1rem',
                fontWeight: '700',
                fontSize: '1.1rem'
              }}>
                📅 {runName} ({groupedCampaigns[runName].length})
              </div>

              {/* Campaigns for this Run */}
              <div style={{ display: 'grid', gap: '1rem', paddingLeft: '1rem' }}>
                {groupedCampaigns[runName].map((campaign) => (
                  <div
                    key={campaign.id}
                    style={{
                      background: 'white',
                      padding: '1.5rem',
                      borderRadius: '6px',
                      border: '2px solid #D3D3D3',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ color: '#5D4E37', margin: '0 0 0.5rem 0' }}>
                          {campaign.venue_name || 'Unknown Venue'}
                        </h4>
                        <p style={{ color: '#708090', fontSize: '0.9rem', margin: '0.25rem 0' }}>
                          📍 {campaign.venue_city}, {campaign.venue_state}
                        </p>
                        {campaign.contact_date && (
                          <p style={{ color: '#708090', fontSize: '0.85rem', margin: '0.5rem 0 0 0' }}>
                            Contacted: {new Date(campaign.contact_date).toLocaleDateString()}
                          </p>
                        )}
                        {campaign.response_date && (
                          <p style={{ color: '#708090', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                            Response: {new Date(campaign.response_date).toLocaleDateString()}
                          </p>
                        )}
                        {campaign.notes && (
                          <p style={{
                            color: '#708090',
                            fontSize: '0.9rem',
                            margin: '0.75rem 0 0 0',
                            fontStyle: 'italic',
                            paddingTop: '0.75rem',
                            borderTop: '1px solid #D3D3D3'
                          }}>
                            {campaign.notes}
                          </p>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginLeft: '2rem' }}>
                        {/* Status Dropdown */}
                        <select
                          value={campaign.status}
                          onChange={(e) => handleStatusChange(campaign.id, e.target.value)}
                          style={{
                            padding: '0.5rem 1rem',
                            background: getStatusColor(campaign.status),
                            color: 'white',
                            border: 'none',
                            borderRadius: '20px',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="not_contacted">NOT CONTACTED</option>
                          <option value="awaiting_response">AWAITING RESPONSE</option>
                          <option value="booked">BOOKED</option>
                          <option value="declined">DECLINED</option>
                        </select>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDelete(campaign.id, campaign.venue_name || 'venue')}
                          style={{
                            padding: '0.5rem 1rem',
                            background: '#C33',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.85rem'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
