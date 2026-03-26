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
    responseRate: 0,
  });
  const [campaigns, setCampaigns]         = useState<any[]>([]);
  const [pendingActions, setPendingActions] = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);

  useEffect(() => { loadDashboardData(); }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const { data: campaignsData } = await supabase
        .from('campaigns')
        .select(`*, campaign_venues(id, status, venue:venues(id, name, email))`)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      const campaignsWithStats = (campaignsData || []).map(campaign => {
        const venues    = campaign.campaign_venues || [];
        const contacted = venues.filter((cv: any) => cv.status && cv.status !== 'contact?').length;
        const confirmed = venues.filter((cv: any) => cv.status === 'booked').length;
        const pending   = venues.filter((cv: any) => cv.status === 'pending').length;
        const needEmail = venues.filter((cv: any) => !cv.venue?.email).length;
        return { ...campaign, total_venues: venues.length, contacted, confirmed, pending, needEmail };
      });

      setCampaigns(campaignsWithStats);

      const totalConfirmed    = campaignsWithStats.reduce((s, c) => s + c.confirmed, 0);
      const totalPending      = campaignsWithStats.reduce((s, c) => s + c.pending, 0);
      const totalContacted    = campaignsWithStats.reduce((s, c) => s + c.contacted, 0);
      const venuesNeedingEmail = campaignsWithStats.reduce((s, c) => s + c.needEmail, 0);
      const responseRate      = totalContacted > 0
        ? Math.round(((totalConfirmed + totalPending) / totalContacted) * 100) : 0;

      const { data: postsData } = await supabase
        .from('social_media_posts').select('*').eq('status', 'draft').order('created_at', { ascending: false });

      setStats({ activeCampaigns: campaignsWithStats.length, totalConfirmed, totalPending,
        totalContacted, venuesNeedingEmail, socialPostsPending: (postsData || []).length, responseRate });

      const actions: Array<{ type: string; message: string; action: string; urgency: 'high'|'medium'|'low' }> = [];
      if (venuesNeedingEmail > 0) actions.push({ type: 'email_needed',
        message: `${venuesNeedingEmail} venues need email addresses`, action: 'Add contact info', urgency: 'high' });
      if (totalPending > 0) actions.push({ type: 'pending_responses',
        message: `${totalPending} pending responses awaiting follow-up`, action: 'Follow up now', urgency: 'medium' });
      if ((postsData || []).length > 0) actions.push({ type: 'social_approval',
        message: `${(postsData || []).length} social posts ready to review`, action: 'Review posts', urgency: 'low' });

      setPendingActions(actions);
    } catch (err) { console.error('Dashboard load error:', err); }
    finally { setLoading(false); }
  };

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 400, background: '#030d18',
        fontFamily: "'Nunito', sans-serif", color: '#3d6285', fontSize: 15,
      }}>
        Loading dashboard…
      </div>
    );
  }

  // ─── Stat card data ───────────────────────────────────────────────────────
  const statCards = [
    {
      label: 'Active Campaigns',
      value: stats.activeCampaigns,
      suffix: '',
      accent: '#3a7fc1',
      glow: 'rgba(58,127,193,0.22)',
      border: 'rgba(58,127,193,0.3)',
      icon: '🛣️',
    },
    {
      label: 'Confirmed Bookings',
      value: stats.totalConfirmed,
      suffix: '',
      accent: '#22c55e',
      glow: 'rgba(34,197,94,0.18)',
      border: 'rgba(34,197,94,0.28)',
      icon: '✅',
    },
    {
      label: 'Pending Responses',
      value: stats.totalPending,
      suffix: '',
      accent: '#f59e0b',
      glow: 'rgba(245,158,11,0.18)',
      border: 'rgba(245,158,11,0.28)',
      icon: '⏳',
    },
    {
      label: 'Response Rate',
      value: stats.responseRate,
      suffix: '%',
      accent: '#a78bfa',
      glow: 'rgba(167,139,250,0.18)',
      border: 'rgba(167,139,250,0.28)',
      icon: '📈',
    },
  ];

  const urgencyColor = { high: '#f87171', medium: '#f59e0b', low: '#6baed6' };
  const urgencyBg    = { high: 'rgba(248,113,113,0.08)', medium: 'rgba(245,158,11,0.08)', low: 'rgba(107,174,214,0.08)' };
  const urgencyBorder = { high: 'rgba(248,113,113,0.22)', medium: 'rgba(245,158,11,0.22)', low: 'rgba(107,174,214,0.22)' };

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .db-wrap {
          background: #030d18;
          min-height: 100vh;
          padding: 2rem;
          font-family: 'Nunito', sans-serif;
        }
        .db-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 2rem;
        }
        .db-main {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 20px;
        }
        .db-card {
          background: rgba(9,24,40,0.8);
          border: 1px solid rgba(74,133,200,0.12);
          border-radius: 14px;
          overflow: hidden;
        }
        .db-card-header {
          padding: 18px 22px 14px;
          border-bottom: 1px solid rgba(74,133,200,0.1);
          display: flex; align-items: center; justify-content: space-between;
        }
        .db-card-title {
          font-family: 'Nunito', sans-serif;
          font-size: 15px; font-weight: 800;
          color: #ffffff; letter-spacing: 0.01em;
        }
        .db-card-body { padding: 16px 22px 22px; }

        .campaign-row {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(74,133,200,0.1);
          border-radius: 10px;
          padding: 16px 18px;
          margin-bottom: 10px;
          cursor: pointer;
          transition: background .18s, border-color .18s, transform .18s;
        }
        .campaign-row:hover {
          background: rgba(74,133,200,0.07);
          border-color: rgba(74,133,200,0.3);
          transform: translateX(3px);
        }
        .campaign-mini-stat { text-align: center; }
        .campaign-mini-val {
          font-size: 1.4rem; font-weight: 800; line-height: 1;
        }
        .campaign-mini-lbl {
          font-size: 11px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: #3d6285; margin-top: 3px;
        }

        .action-row {
          border-radius: 10px;
          padding: 14px 16px;
          margin-bottom: 10px;
          cursor: pointer;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          transition: filter .18s, transform .18s;
        }
        .action-row:hover { filter: brightness(1.15); transform: translateX(2px); }

        .stat-tile {
          border-radius: 14px;
          padding: 22px 20px 18px;
          position: relative; overflow: hidden;
          transition: transform .18s, box-shadow .18s;
        }
        .stat-tile:hover { transform: translateY(-3px); }

        @media (max-width: 1100px) {
          .db-stats { grid-template-columns: repeat(2,1fr); }
          .db-main  { grid-template-columns: 1fr; }
        }
        @media (max-width: 600px) {
          .db-wrap { padding: 1rem; }
          .db-stats { grid-template-columns: repeat(2,1fr); gap: 10px; }
        }
      `}</style>

      <div className="db-wrap">
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>

          {/* ── Page Header ─────────────────────────────────────────────────── */}
          <div style={{ marginBottom: '2rem' }}>
            <h1 style={{
              fontFamily: "'Bebas Neue', cursive",
              fontSize: 'clamp(2rem,3.5vw,2.8rem)',
              fontWeight: 400, letterSpacing: '0.06em',
              color: '#ffffff', margin: 0, lineHeight: 1,
            }}>
              Tour Command Center
            </h1>
            <p style={{ color: '#3d6285', margin: '6px 0 0', fontSize: 14, fontWeight: 600 }}>
              What needs your attention today
            </p>
          </div>

          {/* ── Stat Cards ──────────────────────────────────────────────────── */}
          <div className="db-stats">
            {statCards.map((s, i) => (
              <div key={i} className="stat-tile" style={{
                background: `rgba(9,24,40,0.9)`,
                border: `1px solid ${s.border}`,
                boxShadow: `0 4px 24px ${s.glow}`,
              }}>
                {/* Glow blob */}
                <div style={{
                  position: 'absolute', top: -20, right: -20,
                  width: 100, height: 100, borderRadius: '50%',
                  background: s.glow, filter: 'blur(24px)', pointerEvents: 'none',
                }} />
                <div style={{ fontSize: 22, marginBottom: 10 }}>{s.icon}</div>
                <div style={{
                  fontFamily: "'Nunito', sans-serif",
                  fontSize: 'clamp(2rem,3vw,2.8rem)',
                  fontWeight: 800, color: '#ffffff',
                  lineHeight: 1, letterSpacing: '-0.01em',
                }}>
                  {s.value}{s.suffix}
                </div>
                <div style={{
                  color: s.accent, fontSize: 12, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 6,
                }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* ── Main Grid ───────────────────────────────────────────────────── */}
          <div className="db-main">

            {/* ── Active Campaigns ──────────────────────────────────────────── */}
            <div className="db-card">
              <div className="db-card-header">
                <span className="db-card-title">Active Runs & Tours</span>
                <button
                  onClick={() => onNavigate?.('campaigns')}
                  style={{
                    background: 'rgba(58,127,193,0.12)', border: '1px solid rgba(58,127,193,0.3)',
                    borderRadius: 7, padding: '5px 14px', color: '#6baed6',
                    fontFamily: "'Nunito', sans-serif", fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    transition: 'background .15s',
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = 'rgba(58,127,193,0.22)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'rgba(58,127,193,0.12)')}
                >
                  View All →
                </button>
              </div>
              <div className="db-card-body">
                {campaigns.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '3rem 2rem',
                    border: '1px dashed rgba(74,133,200,0.18)', borderRadius: 12,
                  }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🛣️</div>
                    <div style={{ color: '#ffffff', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
                      No active runs yet
                    </div>
                    <p style={{ color: '#3d6285', fontSize: 13, margin: '0 0 18px' }}>
                      Create your first run to start booking venues.
                    </p>
                    <button
                      onClick={() => onNavigate?.('campaigns')}
                      style={{
                        background: 'linear-gradient(135deg, #3a7fc1, #2563a8)',
                        border: 'none', borderRadius: 8, padding: '10px 24px',
                        color: '#e8f1f8', fontFamily: "'Nunito', sans-serif",
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      Create a Run
                    </button>
                  </div>
                ) : (
                  campaigns.map((campaign, i) => {
                    const total = campaign.total_venues || 1;
                    const pct   = Math.round((campaign.confirmed / total) * 100);
                    return (
                      <div
                        key={i} className="campaign-row"
                        onClick={() => onNavigate?.('campaigns', { campaignId: campaign.id })}
                      >
                        {/* Campaign name + progress bar */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ color: '#ffffff', fontWeight: 800, fontSize: 14 }}>
                              {campaign.name}
                            </span>
                            <span style={{ color: '#3d6285', fontSize: 12, fontWeight: 600 }}>
                              {pct}% booked
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', borderRadius: 99,
                              width: `${pct}%`,
                              background: 'linear-gradient(90deg, #3a7fc1, #22c55e)',
                              transition: 'width .4s ease',
                            }} />
                          </div>
                        </div>
                        {/* Mini stats row */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                          <div className="campaign-mini-stat">
                            <div className="campaign-mini-val" style={{ color: '#e8f1f8' }}>{campaign.total_venues}</div>
                            <div className="campaign-mini-lbl">Total</div>
                          </div>
                          <div className="campaign-mini-stat">
                            <div className="campaign-mini-val" style={{ color: '#6baed6' }}>{campaign.contacted}</div>
                            <div className="campaign-mini-lbl">Contacted</div>
                          </div>
                          <div className="campaign-mini-stat">
                            <div className="campaign-mini-val" style={{ color: '#f59e0b' }}>{campaign.pending}</div>
                            <div className="campaign-mini-lbl">Pending</div>
                          </div>
                          <div className="campaign-mini-stat">
                            <div className="campaign-mini-val" style={{ color: '#22c55e' }}>{campaign.confirmed}</div>
                            <div className="campaign-mini-lbl">Booked</div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── Sidebar ───────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Action Needed */}
              <div className="db-card">
                <div className="db-card-header">
                  <span className="db-card-title">Action Needed</span>
                  {pendingActions.length > 0 && (
                    <span style={{
                      background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)',
                      borderRadius: 99, padding: '2px 10px',
                      color: '#f87171', fontSize: 12, fontWeight: 700,
                    }}>{pendingActions.length}</span>
                  )}
                </div>
                <div className="db-card-body">
                  {pendingActions.length === 0 ? (
                    <div style={{
                      textAlign: 'center', padding: '1.5rem',
                      border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10,
                      background: 'rgba(34,197,94,0.05)',
                    }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
                      <p style={{ color: '#22c55e', fontWeight: 700, fontSize: 13, margin: 0 }}>All caught up!</p>
                    </div>
                  ) : (
                    pendingActions.map((action, idx) => (
                      <div
                        key={idx} className="action-row"
                        style={{
                          background: urgencyBg[action.urgency],
                          border: `1px solid ${urgencyBorder[action.urgency]}`,
                        }}
                        onClick={() => {
                          if (action.type === 'email_needed')   onNavigate?.('contact-info');
                          else if (action.type === 'social_approval') onNavigate?.('social');
                          else onNavigate?.('campaigns');
                        }}
                      >
                        <div>
                          <div style={{ color: '#e8f1f8', fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
                            {action.message}
                          </div>
                          <div style={{ color: urgencyColor[action.urgency], fontSize: 12, fontWeight: 700 }}>
                            → {action.action}
                          </div>
                        </div>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: urgencyColor[action.urgency],
                          boxShadow: `0 0 8px ${urgencyColor[action.urgency]}`,
                        }} />
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Social Queue */}
              <div className="db-card">
                <div className="db-card-header">
                  <span className="db-card-title">Social Queue</span>
                  {stats.socialPostsPending > 0 && (
                    <span style={{
                      background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)',
                      borderRadius: 99, padding: '2px 10px',
                      color: '#a78bfa', fontSize: 12, fontWeight: 700,
                    }}>{stats.socialPostsPending}</span>
                  )}
                </div>
                <div className="db-card-body">
                  {stats.socialPostsPending === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                      <p style={{ color: '#3d6285', fontSize: 13, fontWeight: 600, margin: 0 }}>
                        No posts pending review
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p style={{ color: '#7aa5c4', fontSize: 13, marginBottom: 14 }}>
                        {stats.socialPostsPending} post{stats.socialPostsPending !== 1 ? 's' : ''} ready to review and schedule.
                      </p>
                      <button
                        onClick={() => onNavigate?.('social')}
                        style={{
                          width: '100%', padding: '10px',
                          background: 'rgba(167,139,250,0.12)',
                          border: '1px solid rgba(167,139,250,0.3)',
                          borderRadius: 8, color: '#a78bfa',
                          fontFamily: "'Nunito', sans-serif",
                          fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          transition: 'background .15s',
                        }}
                        onMouseOver={e => (e.currentTarget.style.background = 'rgba(167,139,250,0.22)')}
                        onMouseOut={e => (e.currentTarget.style.background = 'rgba(167,139,250,0.12)')}
                      >
                        Review Posts →
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Links */}
              <div className="db-card">
                <div className="db-card-header">
                  <span className="db-card-title">Quick Access</span>
                </div>
                <div className="db-card-body" style={{ padding: '12px 14px' }}>
                  {[
                    { label: 'Search for Venues',    tab: 'venue-database', color: '#3a7fc1' },
                    { label: 'Start a New Run',       tab: 'campaigns',      color: '#22c55e' },
                    { label: 'Email Templates',       tab: 'emails',         color: '#f59e0b' },
                    { label: 'View Calendar',         tab: 'calendar',       color: '#a78bfa' },
                  ].map((link, i) => (
                    <button
                      key={i}
                      onClick={() => onNavigate?.(link.tab)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', padding: '11px 14px', marginBottom: 6,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(74,133,200,0.1)',
                        borderRadius: 9, cursor: 'pointer',
                        fontFamily: "'Nunito', sans-serif",
                        fontSize: 13, fontWeight: 700, color: '#e8f1f8',
                        textAlign: 'left',
                        transition: 'background .15s, border-color .15s',
                      }}
                      onMouseOver={e => {
                        e.currentTarget.style.background = `rgba(${link.color === '#3a7fc1' ? '58,127,193' : link.color === '#22c55e' ? '34,197,94' : link.color === '#f59e0b' ? '245,158,11' : '167,139,250'},0.1)`;
                        e.currentTarget.style.borderColor = `${link.color}44`;
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                        e.currentTarget.style.borderColor = 'rgba(74,133,200,0.1)';
                      }}
                    >
                      <span>{link.label}</span>
                      <span style={{ color: link.color, fontSize: 14 }}>→</span>
                    </button>
                  ))}
                </div>
              </div>

            </div>{/* end sidebar */}
          </div>{/* end main grid */}
        </div>
      </div>
    </>
  );
}
