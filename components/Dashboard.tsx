'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalVenues: 0,
    contacted: 0,
    confirmed: 0,
    declined: 0,
    pending: 0,
    activeCampaigns: 0
  });
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Get total venues
      const { data: venues, error: venuesError } = await supabase
        .from('venues')
        .select('contact_status');

      if (venuesError) throw venuesError;

      // Calculate stats
      const totalVenues = venues?.length || 0;
      const contacted = venues?.filter(v => 
        ['contacted', 'interested', 'confirmed', 'declined'].includes(v.contact_status)
      ).length || 0;
      const confirmed = venues?.filter(v => v.contact_status === 'confirmed').length || 0;
      const declined = venues?.filter(v => v.contact_status === 'declined').length || 0;
      const pending = contacted - confirmed - declined;

      // Get campaigns
      const { data: campaignsData, error: campaignsError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (campaignsError) throw campaignsError;

      const activeCampaigns = campaignsData?.length || 0;

      setStats({
        totalVenues,
        contacted,
        confirmed,
        declined,
        pending,
        activeCampaigns
      });

      setCampaigns(campaignsData || []);

      // Get recent email activity
      const { data: emailLogs, error: logsError } = await supabase
        .from('email_logs')
        .select(`
          *,
          venue:venues(name, city, state)
        `)
        .order('sent_at', { ascending: false })
        .limit(10);

      if (logsError) throw logsError;
      setRecentActivity(emailLogs || []);

    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  };

  const getResponseRate = () => {
    if (stats.contacted === 0) return 0;
    return Math.round(((stats.confirmed + stats.declined) / stats.contacted) * 100);
  };

  const getConfirmationRate = () => {
    if (stats.contacted === 0) return 0;
    return Math.round((stats.confirmed / stats.contacted) * 100);
  };

  return (
    <div className="western-container">
      {/* Hero Stats */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '0.5rem', color: '#5D4E37' }}>📊 Dashboard Overview</h2>
        <p style={{ color: '#708090' }}>Track your booking progress and campaign performance</p>
      </div>

      {/* Main Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div className="western-card" style={{
          background: 'linear-gradient(135deg, #5D4E37 0%, #8B7355 100%)',
          color: 'white',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.5rem' }}>Total Venues</div>
          <div style={{ fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>{stats.totalVenues}</div>
          <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.5rem' }}>in database</div>
        </div>

        <div className="western-card" style={{
          background: 'linear-gradient(135deg, #B7410E 0%, #D2691E 100%)',
          color: 'white',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.5rem' }}>Contacted</div>
          <div style={{ fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>{stats.contacted}</div>
          <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.5rem' }}>venues reached</div>
        </div>

        <div className="western-card" style={{
          background: 'linear-gradient(135deg, #87AE73 0%, #6B8E5C 100%)',
          color: 'white',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.5rem' }}>Confirmed</div>
          <div style={{ fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>{stats.confirmed}</div>
          <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.5rem' }}>bookings secured</div>
        </div>

        <div className="western-card" style={{
          background: 'linear-gradient(135deg, #708090 0%, #556B7C 100%)',
          color: 'white',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.5rem' }}>Pending</div>
          <div style={{ fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>{stats.pending}</div>
          <div style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '0.5rem' }}>awaiting response</div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div className="western-card">
          <h3 style={{ fontSize: '1rem', color: '#708090', marginBottom: '1rem' }}>Response Rate</h3>
          <div style={{ display: 'flex', alignItems: 'end', gap: '0.5rem' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#5D4E37' }}>
              {getResponseRate()}%
            </div>
            <div style={{ color: '#87AE73', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              {stats.confirmed + stats.declined} / {stats.contacted} venues
            </div>
          </div>
          <div style={{
            marginTop: '1rem',
            height: '8px',
            backgroundColor: '#F5F5F0',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${getResponseRate()}%`,
              backgroundColor: '#87AE73',
              transition: 'width 0.3s ease'
            }}></div>
          </div>
        </div>

        <div className="western-card">
          <h3 style={{ fontSize: '1rem', color: '#708090', marginBottom: '1rem' }}>Confirmation Rate</h3>
          <div style={{ display: 'flex', alignItems: 'end', gap: '0.5rem' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#5D4E37' }}>
              {getConfirmationRate()}%
            </div>
            <div style={{ color: '#B7410E', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              {stats.confirmed} confirmed
            </div>
          </div>
          <div style={{
            marginTop: '1rem',
            height: '8px',
            backgroundColor: '#F5F5F0',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${getConfirmationRate()}%`,
              backgroundColor: '#B7410E',
              transition: 'width 0.3s ease'
            }}></div>
          </div>
        </div>

        <div className="western-card">
          <h3 style={{ fontSize: '1rem', color: '#708090', marginBottom: '1rem' }}>Active Campaigns</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: '700', color: '#5D4E37' }}>
            {stats.activeCampaigns}
          </div>
          <div style={{ color: '#708090', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            campaigns in progress
          </div>
        </div>
      </div>

      {/* Active Campaigns */}
      <div className="western-card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem', color: '#5D4E37' }}>🎯 Active Campaigns</h3>
        {campaigns.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            color: '#708090',
            backgroundColor: '#F5F5F0',
            borderRadius: '6px'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎸</div>
            <p>No active campaigns. Create a booking run to get started!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                style={{
                  padding: '1.5rem',
                  backgroundColor: '#F5F5F0',
                  borderRadius: '6px',
                  border: '1px solid #D3D3D3',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <h4 style={{ marginBottom: '0.5rem', color: '#5D4E37' }}>{campaign.name}</h4>
                  {campaign.description && (
                    <p style={{ color: '#708090', fontSize: '0.9rem', margin: 0 }}>{campaign.description}</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#5D4E37' }}>
                      {campaign.total_venues || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#708090' }}>venues</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#B7410E' }}>
                      {campaign.contacted || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#708090' }}>contacted</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#87AE73' }}>
                      {campaign.confirmed || 0}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#708090' }}>confirmed</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="western-card">
        <h3 style={{ marginBottom: '1.5rem', color: '#5D4E37' }}>📧 Recent Activity</h3>
        {recentActivity.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '2rem',
            color: '#708090',
            backgroundColor: '#F5F5F0',
            borderRadius: '6px'
          }}>
            No activity yet. Start contacting venues to see activity here!
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {recentActivity.map((log) => (
              <div
                key={log.id}
                style={{
                  padding: '1rem',
                  backgroundColor: '#F5F5F0',
                  borderRadius: '6px',
                  border: '1px solid #D3D3D3',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', color: '#5D4E37' }}>
                    📧 Email sent to {log.venue?.name}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#708090', marginTop: '0.25rem' }}>
                    {log.venue?.city}, {log.venue?.state} • {log.recipient_email}
                  </div>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#708090' }}>
                  {new Date(log.sent_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
