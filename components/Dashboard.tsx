'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface DashboardProps {
  onNavigate?: (tab: string, filter?: any) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState({
    activeCampaigns: 0,
    totalConfirmed: 0,
    totalPending: 0,
    totalContacted: 0,
    venuesNeedingEmail: 0,
    socialPostsPending: 0,
    responseRate: 0
  });
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [pendingActions, setPendingActions] = useState<any[]>([]);
  const [socialPosts, setSocialPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Get active campaigns with stats
      const { data: campaignsData } = await supabase
        .from('campaigns')
        .select(`
          *,
          campaign_venues(
            id,
            status,
            venue:venues(id, name, email)
          )
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      // Calculate campaign stats
      const campaignsWithStats = (campaignsData || []).map(campaign => {
        const venues = campaign.campaign_venues || [];
        const contacted = venues.filter((cv: any) => 
          cv.status && cv.status !== 'contact?'
        ).length;
        const confirmed = venues.filter((cv: any) => cv.status === 'booked').length;
        const pending = venues.filter((cv: any) => cv.status === 'pending').length;
        const needEmail = venues.filter((cv: any) => !cv.venue?.email).length;

        return {
          ...campaign,
          total_venues: venues.length,
          contacted,
          confirmed,
          pending,
          needEmail
        };
      });

      setCampaigns(campaignsWithStats);

      // Calculate overall stats
      const totalConfirmed = campaignsWithStats.reduce((sum, c) => sum + c.confirmed, 0);
      const totalPending = campaignsWithStats.reduce((sum, c) => sum + c.pending, 0);
      const totalContacted = campaignsWithStats.reduce((sum, c) => sum + c.contacted, 0);
      const venuesNeedingEmail = campaignsWithStats.reduce((sum, c) => sum + c.needEmail, 0);
      
      const responseRate = totalContacted > 0 
        ? Math.round(((totalConfirmed + totalPending) / totalContacted) * 100)
        : 0;

      // Get pending social media posts
      const { data: postsData } = await supabase
        .from('social_media_posts')
        .select('*')
        .eq('status', 'draft')
        .order('created_at', { ascending: false });

      setSocialPosts(postsData || []);

      setStats({
        activeCampaigns: campaignsWithStats.length,
        totalConfirmed,
        totalPending,
        totalContacted,
        venuesNeedingEmail,
        socialPostsPending: (postsData || []).length,
        responseRate
      });

      // Build pending actions list
      const actions: Array<{
        type: string;
        message: string;
        action: string;
        icon: string;
      }> = [];
      if (venuesNeedingEmail > 0) {
        actions.push({
          type: 'email_needed',
          message: `${venuesNeedingEmail} venues need email addresses`,
          action: 'Add contact info',
          icon: '📧'
        });
      }
      if (totalPending > 0) {
        actions.push({
          type: 'pending_responses',
          message: `${totalPending} pending responses`,
          action: 'Follow up',
          icon: '⏰'
        });
      }
      if ((postsData || []).length > 0) {
        actions.push({
          type: 'social_approval',
          message: `${(postsData || []).length} social posts awaiting approval`,
          action: 'Review posts',
          icon: '📱'
        });
      }

      setPendingActions(actions);
      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '400px',
        color: '#C8A882'
      }}>
        <div>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', textAlign: 'center' }}>🎸</div>
          <p>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #2C1810 0%, #3D2817 50%, #2C1810 100%)',
      minHeight: '100vh',
      padding: '2rem'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ 
          color: '#C8A882', 
          fontSize: '2.5rem', 
          margin: 0,
          marginBottom: '0.5rem',
          fontWeight: '700'
        }}>
          🎸 Tour Command Center
        </h1>
        <p style={{ color: '#9B8A7A', margin: 0, fontSize: '1.1rem' }}>
          What needs your attention today
        </p>
      </div>

      {/* Quick Stats Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #5D4E37 0%, #8B7355 100%)',
          padding: '1.5rem',
          borderRadius: '12px',
          border: '2px solid #8B6F47',
          textAlign: 'center'
        }}>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            Active Campaigns
          </div>
          <div style={{ color: 'white', fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>
            {stats.activeCampaigns}
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #87AE73 0%, #6B8E5C 100%)',
          padding: '1.5rem',
          borderRadius: '12px',
          border: '2px solid #87AE73',
          textAlign: 'center'
        }}>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            Confirmed Bookings
          </div>
          <div style={{ color: 'white', fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>
            {stats.totalConfirmed}
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #B7410E 0%, #D2691E 100%)',
          padding: '1.5rem',
          borderRadius: '12px',
          border: '2px solid #B7410E',
          textAlign: 'center'
        }}>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            Pending Responses
          </div>
          <div style={{ color: 'white', fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>
            {stats.totalPending}
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #708090 0%, #556B7C 100%)',
          padding: '1.5rem',
          borderRadius: '12px',
          border: '2px solid #708090',
          textAlign: 'center'
        }}>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            Response Rate
          </div>
          <div style={{ color: 'white', fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>
            {stats.responseRate}%
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: '2rem',
        marginBottom: '2rem'
      }}>
        {/* Active Campaigns */}
        <div style={{
          background: 'rgba(61, 40, 23, 0.6)',
          border: '2px solid #5C4A3A',
          borderRadius: '12px',
          padding: '2rem'
        }}>
          <h2 style={{ 
            color: '#C8A882', 
            marginBottom: '1.5rem',
            fontSize: '1.5rem',
            fontWeight: '700'
          }}>
            🎯 Active Campaigns
          </h2>

          {campaigns.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem',
              background: 'rgba(92, 74, 58, 0.3)',
              borderRadius: '8px',
              border: '2px dashed #5C4A3A'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎸</div>
              <p style={{ color: '#9B8A7A', marginBottom: '1.5rem' }}>
                No active campaigns yet
              </p>
              <button
                onClick={() => onNavigate?.('campaigns')}
                style={{
                  background: '#87AE73',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '1rem'
                }}
              >
                Create Your First Campaign
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  onClick={() => onNavigate?.('campaigns', { campaignId: campaign.id })}
                  style={{
                    background: 'linear-gradient(135deg, rgba(61, 40, 23, 0.9), rgba(74, 50, 32, 0.9))',
                    border: '2px solid #5C4A3A',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#C8A882';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#5C4A3A';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 style={{ 
                      color: '#C8A882', 
                      fontSize: '1.2rem', 
                      margin: 0,
                      marginBottom: '0.5rem'
                    }}>
                      {campaign.name}
                    </h3>
                    {campaign.date_range_start && (
                      <div style={{ color: '#9B8A7A', fontSize: '0.85rem' }}>
                        📅 {new Date(campaign.date_range_start).toLocaleDateString()} - {new Date(campaign.date_range_end).toLocaleDateString()}
                      </div>
                    )}
                    <div style={{ color: '#9B8A7A', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                      📍 {campaign.cities?.join(', ')}
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '1rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid #5C4A3A'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#C8A882', fontSize: '1.5rem', fontWeight: '700' }}>
                        {campaign.total_venues}
                      </div>
                      <div style={{ color: '#E8DCC4', fontSize: '0.7rem' }}>Total</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#708090', fontSize: '1.5rem', fontWeight: '700' }}>
                        {campaign.contacted}
                      </div>
                      <div style={{ color: '#E8DCC4', fontSize: '0.7rem' }}>Contacted</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#B7410E', fontSize: '1.5rem', fontWeight: '700' }}>
                        {campaign.pending}
                      </div>
                      <div style={{ color: '#E8DCC4', fontSize: '0.7rem' }}>Pending</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: '#87AE73', fontSize: '1.5rem', fontWeight: '700' }}>
                        {campaign.confirmed}
                      </div>
                      <div style={{ color: '#E8DCC4', fontSize: '0.7rem' }}>Booked</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Actions Sidebar */}
        <div>
          {/* Pending Actions Card */}
          <div style={{
            background: 'rgba(61, 40, 23, 0.6)',
            border: '2px solid #5C4A3A',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <h2 style={{ 
              color: '#C8A882', 
              marginBottom: '1.5rem',
              fontSize: '1.3rem',
              fontWeight: '700'
            }}>
              ⚡ Action Needed
            </h2>

            {pendingActions.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '2rem',
                background: 'rgba(135, 174, 115, 0.1)',
                borderRadius: '8px',
                border: '2px solid rgba(135, 174, 115, 0.3)'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
                <p style={{ color: '#87AE73', margin: 0, fontWeight: '600' }}>
                  All caught up!
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {pendingActions.map((action, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      if (action.type === 'social_approval') onNavigate?.('social');
                      else onNavigate?.('campaigns');
                    }}
                    style={{
                      background: 'rgba(183, 65, 14, 0.2)',
                      border: '2px solid #B7410E',
                      borderRadius: '8px',
                      padding: '1rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(183, 65, 14, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(183, 65, 14, 0.2)';
                    }}
                  >
                    <div style={{ 
                      fontSize: '1.5rem', 
                      marginBottom: '0.5rem' 
                    }}>
                      {action.icon}
                    </div>
                    <div style={{ 
                      color: '#E8DCC4', 
                      fontSize: '0.9rem',
                      marginBottom: '0.5rem',
                      fontWeight: '600'
                    }}>
                      {action.message}
                    </div>
                    <div style={{ 
                      color: '#C8A882', 
                      fontSize: '0.85rem',
                      fontWeight: '700'
                    }}>
                      → {action.action}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Social Media Queue */}
          <div style={{
            background: 'rgba(61, 40, 23, 0.6)',
            border: '2px solid #5C4A3A',
            borderRadius: '12px',
            padding: '1.5rem'
          }}>
            <h2 style={{ 
              color: '#C8A882', 
              marginBottom: '1rem',
              fontSize: '1.3rem',
              fontWeight: '700'
            }}>
              📱 Social Queue
            </h2>

            {socialPosts.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '1.5rem',
                color: '#9B8A7A'
              }}>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>
                  No posts pending
                </p>
              </div>
            ) : (
              <div>
                <div style={{ 
                  color: '#E8DCC4', 
                  marginBottom: '1rem',
                  fontSize: '0.9rem'
                }}>
                  {socialPosts.length} post{socialPosts.length !== 1 ? 's' : ''} awaiting approval
                </div>
                <button
                  onClick={() => onNavigate?.('social')}
                  style={{
                    width: '100%',
                    background: '#87AE73',
                    color: 'white',
                    border: 'none',
                    padding: '1rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '700',
                    fontSize: '0.95rem'
                  }}
                >
                  Review Posts →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
