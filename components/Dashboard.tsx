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
        background: 'linear-gradient(135deg, #F5F5F0 0%, #E8E6E1 100%)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎸</div>
          <p style={{ color: '#708090', fontSize: '1.1rem' }}>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        * { box-sizing: border-box; }
        
        .dashboard-container {
          background: linear-gradient(135deg, #F5F5F0 0%, #E8E6E1 100%);
          min-height: 100vh;
          padding: 2rem;
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        
        .main-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 2rem;
        }
        
        .campaign-card {
          background: linear-gradient(135deg, rgba(61, 40, 23, 0.95), rgba(74, 50, 32, 0.95));
          border: 2px solid rgba(200, 168, 130, 0.3);
          border-radius: 12px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        
        .campaign-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
          border-color: #C8A882;
        }
        
        @media (max-width: 1024px) {
          .main-grid {
            grid-template-columns: 1fr;
          }
        }
        
        @media (max-width: 767px) {
          .dashboard-container {
            padding: 1rem;
          }
          
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
          }
        }
      `}</style>

      <div className="dashboard-container">
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <h1 style={{
              fontSize: '2.5rem',
              fontWeight: '700',
              color: '#5D4E37',
              margin: 0,
              marginBottom: '0.5rem'
            }}>
              🎸 Tour Command Center
            </h1>
            <p style={{ color: '#708090', margin: 0, fontSize: '1.1rem' }}>
              What needs your attention today
            </p>
          </div>

          {/* Quick Stats */}
          <div className="stats-grid">
            <div style={{
              background: 'linear-gradient(135deg, #5D4E37 0%, #8B7355 100%)',
              padding: '1.75rem',
              borderRadius: '12px',
              border: '2px solid rgba(139, 111, 71, 0.3)',
              textAlign: 'center',
              boxShadow: '0 4px 12px rgba(93, 78, 55, 0.2)'
            }}>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: '600' }}>
                Active Campaigns
              </div>
              <div style={{ color: 'white', fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>
                {stats.activeCampaigns}
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #87AE73 0%, #6B8E5C 100%)',
              padding: '1.75rem',
              borderRadius: '12px',
              border: '2px solid rgba(135, 174, 115, 0.3)',
              textAlign: 'center',
              boxShadow: '0 4px 12px rgba(135, 174, 115, 0.2)'
            }}>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: '600' }}>
                Confirmed Bookings
              </div>
              <div style={{ color: 'white', fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>
                {stats.totalConfirmed}
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #B7410E 0%, #D2691E 100%)',
              padding: '1.75rem',
              borderRadius: '12px',
              border: '2px solid rgba(183, 65, 14, 0.3)',
              textAlign: 'center',
              boxShadow: '0 4px 12px rgba(183, 65, 14, 0.2)'
            }}>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: '600' }}>
                Pending Responses
              </div>
              <div style={{ color: 'white', fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>
                {stats.totalPending}
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #708090 0%, #556B7C 100%)',
              padding: '1.75rem',
              borderRadius: '12px',
              border: '2px solid rgba(112, 128, 144, 0.3)',
              textAlign: 'center',
              boxShadow: '0 4px 12px rgba(112, 128, 144, 0.2)'
            }}>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: '600' }}>
                Response Rate
              </div>
              <div style={{ color: 'white', fontSize: '3rem', fontWeight: '700', lineHeight: '1' }}>
                {stats.responseRate}%
              </div>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="main-grid">
            {/* Active Campaigns */}
            <div>
              <h2 style={{
                fontSize: '1.8rem',
                fontWeight: '700',
                color: '#5D4E37',
                marginBottom: '1.5rem'
              }}>
                🎯 Active Campaigns
              </h2>

              {campaigns.length === 0 ? (
                <div style={{
                  background: 'white',
                  padding: '3rem',
                  borderRadius: '12px',
                  textAlign: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎸</div>
                  <h3 style={{ fontSize: '1.3rem', color: '#5D4E37', margin: '0 0 0.5rem 0' }}>
                    No active campaigns
                  </h3>
                  <p style={{ color: '#708090', marginBottom: '1.5rem' }}>
                    Create your first campaign to get started!
                  </p>
                  <button
                    onClick={() => onNavigate?.('campaigns')}
                    style={{
                      background: 'linear-gradient(135deg, #87AE73 0%, #6B8E5C 100%)',
                      color: 'white',
                      border: 'none',
                      padding: '1rem 2rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '700',
                      fontSize: '1rem',
                      boxShadow: '0 4px 12px rgba(135, 174, 115, 0.3)'
                    }}
                  >
                    + Create Campaign
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '1.5rem' }}>
                  {campaigns.map((campaign) => (
                    <div
                      key={campaign.id}
                      className="campaign-card"
                      onClick={() => onNavigate?.('campaigns', { campaignId: campaign.id })}
                    >
                      <h3 style={{
                        color: '#C8A882',
                        fontSize: '1.3rem',
                        margin: '0 0 0.75rem 0',
                        fontWeight: '700'
                      }}>
                        {campaign.name}
                      </h3>
                      
                      {campaign.date_range_start && (
                        <div style={{ color: '#E8DCC4', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                          📅 {new Date(campaign.date_range_start).toLocaleDateString()} - {new Date(campaign.date_range_end).toLocaleDateString()}
                        </div>
                      )}
                      
                      <div style={{ color: '#9B8A7A', fontSize: '0.9rem', marginBottom: '1rem' }}>
                        📍 {campaign.cities?.join(', ')}
                      </div>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '1rem',
                        paddingTop: '1rem',
                        borderTop: '1px solid rgba(200, 168, 130, 0.3)'
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ color: '#C8A882', fontSize: '1.5rem', fontWeight: '700' }}>
                            {campaign.total_venues}
                          </div>
                          <div style={{ color: '#E8DCC4', fontSize: '0.7rem', textTransform: 'uppercase' }}>Total</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ color: '#708090', fontSize: '1.5rem', fontWeight: '700' }}>
                            {campaign.contacted}
                          </div>
                          <div style={{ color: '#E8DCC4', fontSize: '0.7rem', textTransform: 'uppercase' }}>Contacted</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ color: '#B7410E', fontSize: '1.5rem', fontWeight: '700' }}>
                            {campaign.pending}
                          </div>
                          <div style={{ color: '#E8DCC4', fontSize: '0.7rem', textTransform: 'uppercase' }}>Pending</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ color: '#87AE73', fontSize: '1.5rem', fontWeight: '700' }}>
                            {campaign.confirmed}
                          </div>
                          <div style={{ color: '#E8DCC4', fontSize: '0.7rem', textTransform: 'uppercase' }}>Booked</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div>
              {/* Action Needed */}
              <div style={{
                background: 'white',
                borderRadius: '12px',
                padding: '1.5rem',
                marginBottom: '1.5rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
              }}>
                <h2 style={{
                  fontSize: '1.3rem',
                  fontWeight: '700',
                  color: '#5D4E37',
                  marginBottom: '1.5rem'
                }}>
                  ⚡ Action Needed
                </h2>

                {pendingActions.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '2rem',
                    background: 'linear-gradient(135deg, rgba(135, 174, 115, 0.1), rgba(107, 142, 92, 0.1))',
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
                          background: 'linear-gradient(135deg, rgba(183, 65, 14, 0.1), rgba(210, 105, 30, 0.1))',
                          border: '2px solid rgba(183, 65, 14, 0.3)',
                          borderRadius: '8px',
                          padding: '1rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(183, 65, 14, 0.2), rgba(210, 105, 30, 0.2))';
                          e.currentTarget.style.transform = 'translateX(4px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(183, 65, 14, 0.1), rgba(210, 105, 30, 0.1))';
                          e.currentTarget.style.transform = 'translateX(0)';
                        }}
                      >
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                          {action.icon}
                        </div>
                        <div style={{
                          color: '#5D4E37',
                          fontSize: '0.95rem',
                          marginBottom: '0.5rem',
                          fontWeight: '600'
                        }}>
                          {action.message}
                        </div>
                        <div style={{
                          color: '#B7410E',
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
                background: 'white',
                borderRadius: '12px',
                padding: '1.5rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
              }}>
                <h2 style={{
                  fontSize: '1.3rem',
                  fontWeight: '700',
                  color: '#5D4E37',
                  marginBottom: '1rem'
                }}>
                  📱 Social Queue
                </h2>

                {stats.socialPostsPending === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '1.5rem',
                    color: '#708090'
                  }}>
                    <p style={{ margin: 0, fontSize: '0.95rem' }}>
                      No posts pending
                    </p>
                  </div>
                ) : (
                  <div>
                    <div style={{
                      color: '#5D4E37',
                      marginBottom: '1rem',
                      fontSize: '1rem',
                      fontWeight: '600'
                    }}>
                      {stats.socialPostsPending} post{stats.socialPostsPending !== 1 ? 's' : ''} awaiting approval
                    </div>
                    <button
                      onClick={() => onNavigate?.('social')}
                      style={{
                        width: '100%',
                        background: 'linear-gradient(135deg, #87AE73 0%, #6B8E5C 100%)',
                        color: 'white',
                        border: 'none',
                        padding: '1rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '1rem',
                        boxShadow: '0 4px 12px rgba(135, 174, 115, 0.3)'
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
      </div>
    </>
  );
}
