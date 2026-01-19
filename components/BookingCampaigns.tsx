'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import EmailComposer from './EmailComposer';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: 'planning' | 'active' | 'completed';
  start_date?: string;
  end_date?: string;
  total_venues: number;
  contacted: number;
  responses: number;
  confirmed: number;
  declined: number;
  created_at: string;
}

export default function BookingCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignVenues, setCampaignVenues] = useState<any[]>([]);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [selectedVenueForEmail, setSelectedVenueForEmail] = useState<any>(null);

  useEffect(() => {
    loadCampaigns();
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

  const loadCampaignVenues = async (campaignId: string) => {
    try {
      const { data, error } = await supabase
        .from('campaign_venues')
        .select(`
          *,
          venue:venues(*)
        `)
        .eq('campaign_id', campaignId);

      if (error) throw error;
      setCampaignVenues(data || []);
    } catch (error) {
      console.error('Error loading campaign venues:', error);
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    if (!confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) {
      return;
    }

    try {
      // First delete campaign_venues links
      const { error: venuesError } = await supabase
        .from('campaign_venues')
        .delete()
        .eq('campaign_id', campaignId);

      if (venuesError) throw venuesError;

      // Then delete the campaign
      const { error: campaignError } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaignId);

      if (campaignError) throw campaignError;

      alert('✅ Campaign deleted successfully!');
      loadCampaigns();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert('Error deleting campaign');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: { [key: string]: React.CSSProperties } = {
      planning: { backgroundColor: 'rgba(200, 168, 130, 0.3)', color: '#C8A882', border: '1px solid #C8A882' },
      active: { backgroundColor: 'rgba(107, 142, 35, 0.3)', color: '#6B8E23', border: '1px solid #6B8E23' },
      completed: { backgroundColor: 'rgba(112, 128, 144, 0.3)', color: '#708090', border: '1px solid #708090' }
    };

    return (
      <span style={{
        ...styles[status],
        padding: '0.25rem 0.75rem',
        borderRadius: '12px',
        fontSize: '0.875rem',
        fontWeight: '600'
      }}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <div style={{ padding: '2rem' }}>
      <style jsx>{`
        .campaigns-container {
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
        
        .header h2 {
          color: #C8A882;
          font-size: 1.8rem;
          margin: 0;
        }
        
        .header p {
          color: #9B8A7A;
          margin: 0;
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
          transition: all 0.3s ease;
          cursor: pointer;
        }
        
        .campaign-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 25px rgba(0,0,0,0.4);
          border-color: #C8A882;
        }
        
        .campaign-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 15px;
        }
        
        .campaign-name {
          color: #C8A882;
          font-size: 1.3rem;
          font-weight: 600;
        }
        
        .delete-btn {
          background: #C84630;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.3s ease;
        }
        
        .delete-btn:hover {
          background: #a33828;
          transform: scale(1.05);
        }
        
        .campaign-date {
          color: #E8DCC4;
          opacity: 0.8;
          margin-bottom: 15px;
        }
        
        .campaign-description {
          color: #9B8A7A;
          font-size: 0.9rem;
          margin-bottom: 15px;
        }
        
        .campaign-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid #5C4A3A;
        }
        
        .stat {
          text-align: center;
        }
        
        .stat-value {
          color: #C8A882;
          font-size: 1.5rem;
          font-weight: 700;
        }
        
        .stat-label {
          color: #E8DCC4;
          font-size: 0.8rem;
          opacity: 0.7;
        }
        
        .empty-state {
          background: rgba(61, 40, 23, 0.5);
          padding: 4rem;
          text-align: center;
          color: #9B8A7A;
          border-radius: 12px;
          border: 2px dashed #5C4A3A;
        }
        
        .empty-state-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
      `}</style>

      <div className="campaigns-container">
        <div className="header">
          <div>
            <h2>🎯 Booking Campaigns</h2>
            <p>Track your venue outreach and confirmations</p>
          </div>
        </div>

        <div className="campaigns-grid">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="campaign-card">
              <div className="campaign-header">
                <div className="campaign-name">{campaign.name}</div>
                <button 
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCampaign(campaign.id);
                  }}
                >
                  🗑️ Delete
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                {getStatusBadge(campaign.status)}
                {campaign.start_date && (
                  <div className="campaign-date">
                    📅 {new Date(campaign.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {campaign.end_date && ` - ${new Date(campaign.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                  </div>
                )}
              </div>

              {campaign.description && (
                <p className="campaign-description">{campaign.description}</p>
              )}

              <div className="campaign-stats">
                <div className="stat">
                  <div className="stat-value">{campaign.contacted || 0}</div>
                  <div className="stat-label">Contacted</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{campaign.responses || 0}</div>
                  <div className="stat-label">Responses</div>
                </div>
                <div className="stat">
                  <div className="stat-value">{campaign.confirmed || 0}</div>
                  <div className="stat-label">Booked</div>
                </div>
              </div>

              <div
                onClick={() => {
                  setSelectedCampaign(campaign);
                  loadCampaignVenues(campaign.id);
                }}
                style={{
                  marginTop: '15px',
                  padding: '10px',
                  background: 'rgba(200, 168, 130, 0.1)',
                  borderRadius: '6px',
                  textAlign: 'center',
                  color: '#C8A882',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                View Details →
              </div>
            </div>
          ))}
        </div>

        {campaigns.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🎸</div>
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: '600', color: '#C8A882' }}>
              No campaigns yet
            </p>
            <p>Create a booking run first, then create a campaign to start reaching out to venues!</p>
          </div>
        )}
      </div>

      {/* Campaign Detail Modal */}
      {selectedCampaign && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '2rem'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #3D2817, #4A3220)',
            border: '3px solid #8B6F47',
            borderRadius: '15px',
            padding: '2rem',
            maxWidth: '1200px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '2rem' }}>
              <div>
                <h2 style={{ color: '#C8A882', margin: 0 }}>{selectedCampaign.name}</h2>
                {selectedCampaign.description && (
                  <p style={{ color: '#9B8A7A', marginTop: '0.5rem' }}>{selectedCampaign.description}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedCampaign(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#E8DCC4'
                }}
              >
                ✕
              </button>
            </div>

            <h3 style={{ color: '#C8A882', marginBottom: '1rem' }}>Campaign Venues</h3>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {campaignVenues.map((cv) => (
                <div
                  key={cv.id}
                  style={{
                    background: 'rgba(61, 40, 23, 0.5)',
                    padding: '1rem',
                    borderRadius: '6px',
                    border: '1px solid #5C4A3A'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '1.1rem', color: '#C8A882' }}>{cv.venue.name}</div>
                      <div style={{ color: '#9B8A7A', fontSize: '0.9rem' }}>
                        {cv.venue.city}, {cv.venue.state}
                        {cv.venue.phone && ` • ${cv.venue.phone}`}
                      </div>
                      {cv.venue.email && (
                        <div style={{ color: '#C8A882', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                          📧 {cv.venue.email}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        onClick={() => {
                          setSelectedVenueForEmail(cv.venue);
                          setShowEmailComposer(true);
                        }}
                        style={{
                          background: '#A8A8A8',
                          color: '#36454F',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        📧 Contact
                      </button>
                      <button style={{
                        background: '#6B8E23',
                        color: 'white',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}>
                        ✅ Mark Confirmed
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Email Composer Modal */}
      {showEmailComposer && selectedVenueForEmail && selectedCampaign && (
        <EmailComposer
          venue={selectedVenueForEmail}
          campaignId={selectedCampaign.id}
          onClose={() => {
            setShowEmailComposer(false);
            setSelectedVenueForEmail(null);
          }}
          onSent={() => {
            loadCampaigns();
            if (selectedCampaign) {
              loadCampaignVenues(selectedCampaign.id);
            }
          }}
        />
      )}
    </div>
  );
}
