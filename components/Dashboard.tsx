'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface NavigationFilter {
  campaignId?: string;
}

interface CampaignVenueRow {
  id: string;
  status: string;
  venue?: { id: string; name: string; email?: string };
}

interface CampaignWithStats {
  id: string;
  name: string;
  campaign_venues: CampaignVenueRow[];
  total_venues: number;
  contacted: number;
  confirmed: number;
  pending: number;
  needEmail: number;
}

interface PendingAction {
  type: string;
  message: string;
  action: string;
  urgency: 'high' | 'medium' | 'low';
}

// ── Email modal types ──────────────────────────────────────────────────────────
interface MissingEmailVenue {
  venueId: string;
  campaignVenueId: string;
  name: string;
  city: string;
  state: string;
  campaignName: string;
  email: string;
  phone: string;
  saved: boolean; // turns on green check after a field is saved
}

interface DashboardProps {
  onNavigate?: (tab: string, filter?: NavigationFilter) => void;
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
  const [campaigns, setCampaigns]         = useState<CampaignWithStats[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [loading, setLoading]             = useState(true);

  // ── Email modal state ────────────────────────────────────────────────────────
  const [showEmailModal, setShowEmailModal]         = useState(false);
  const [emailVenues, setEmailVenues]               = useState<MissingEmailVenue[]>([]);
  const [emailModalLoading, setEmailModalLoading]   = useState(false);
  // Track which (venueId, field) is actively being edited inside the modal
  const [modalEdit, setModalEdit] = useState<{ venueId: string; field: 'email' | 'phone'; value: string } | null>(null);
  const modalCommitting = useRef(false);

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
        const contacted = venues.filter((cv: CampaignVenueRow) => cv.status && cv.status !== 'contact?').length;
        const confirmed = venues.filter((cv: CampaignVenueRow) => cv.status === 'booked').length;
        const pending   = venues.filter((cv: CampaignVenueRow) => cv.status === 'pending').length;
        const needEmail = venues.filter((cv: CampaignVenueRow) => !cv.venue?.email).length;
        return { ...campaign, total_venues: venues.length, contacted, confirmed, pending, needEmail };
      });

      setCampaigns(campaignsWithStats);

      const totalConfirmed     = campaignsWithStats.reduce((s, c) => s + c.confirmed, 0);
      const totalPending       = campaignsWithStats.reduce((s, c) => s + c.pending, 0);
      const totalContacted     = campaignsWithStats.reduce((s, c) => s + c.contacted, 0);
      const venuesNeedingEmail = campaignsWithStats.reduce((s, c) => s + c.needEmail, 0);
      const responseRate       = totalContacted > 0
        ? Math.round(((totalConfirmed + totalPending) / totalContacted) * 100) : 0;

      const { data: postsData } = await supabase
        .from('social_media_posts').select('*').eq('status', 'draft').order('created_at', { ascending: false });

      setStats({ activeCampaigns: campaignsWithStats.length, totalConfirmed, totalPending,
        totalContacted, venuesNeedingEmail, socialPostsPending: (postsData || []).length, responseRate });

      const actions: PendingAction[] = [];
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

  // ── Open email modal: fetch venues missing emails from active campaigns ───────
  const openEmailModal = async () => {
    setShowEmailModal(true);
    setEmailModalLoading(true);
    setModalEdit(null);
    modalCommitting.current = false;
    try {
      // Fetch campaign_venues joined with venues and campaigns — only where email IS NULL
      const { data } = await supabase
        .from('campaign_venues')
        .select(`
          id,
          venue:venues(id, name, city, state, phone, email),
          campaign:campaigns(id, name, status)
        `)
        .filter('campaign.status', 'eq', 'active')
        .not('campaign', 'is', null);

      const rows: MissingEmailVenue[] = [];
      for (const cv of (data || [])) {
        // Supabase FK joins can return object or array — normalise to object
        const venue    = Array.isArray(cv.venue)    ? cv.venue[0]    : cv.venue;
        const campaign = Array.isArray(cv.campaign) ? cv.campaign[0] : cv.campaign;
        if (!venue || !campaign) continue;
        if (venue.email) continue; // skip venues that already have email
        // Deduplicate by venueId (same venue might be in multiple campaigns)
        if (rows.find(r => r.venueId === venue.id)) continue;
        rows.push({
          venueId:          venue.id,
          campaignVenueId:  cv.id,
          name:             venue.name,
          city:             venue.city,
          state:            venue.state,
          campaignName:     campaign.name,
          email:            '',
          phone:            venue.phone || '',
          saved:            false,
        });
      }
      setEmailVenues(rows);
    } catch (err) {
      console.error('Error loading missing-email venues:', err);
    } finally {
      setEmailModalLoading(false);
    }
  };

  // ── Save a field in the modal ─────────────────────────────────────────────────
  const commitModalEdit = useCallback(async () => {
    if (modalCommitting.current) return;
    if (!modalEdit) return;

    const { venueId, field, value } = modalEdit;
    const trimmed = value.trim();

    // Get current value from state
    const current = emailVenues.find(v => v.venueId === venueId);
    if (!current) { setModalEdit(null); return; }
    if ((current[field] || '') === trimmed) { setModalEdit(null); return; }

    modalCommitting.current = true;
    setModalEdit(null);

    try {
      const { error } = await supabase
        .from('venues')
        .update({ [field]: trimmed || null })
        .eq('id', venueId);
      if (error) throw error;

      setEmailVenues(prev => prev.map(v => {
        if (v.venueId !== venueId) return v;
        const updated = { ...v, [field]: trimmed, saved: true };
        return updated;
      }));

      // If email was saved (and is non-empty), decrement the live badge count
      if (field === 'email' && trimmed) {
        setStats(prev => ({
          ...prev,
          venuesNeedingEmail: Math.max(0, prev.venuesNeedingEmail - 1),
        }));
        setPendingActions(prev => prev.map(a => {
          if (a.type !== 'email_needed') return a;
          const newCount = Math.max(0, parseInt(a.message) - 1);
          return newCount === 0
            ? { ...a, message: '0 venues need email addresses' }
            : { ...a, message: `${newCount} venues need email addresses` };
        }).filter(a => {
          if (a.type === 'email_needed') {
            // Remove the action if count is now 0
            return parseInt(a.message) > 0;
          }
          return true;
        }));
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      modalCommitting.current = false;
    }
  }, [modalEdit, emailVenues]);

  // ── Loading ──────────────────────────────────────────────────────────────────
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

  // ── Stat card data ────────────────────────────────────────────────────────────
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

  const urgencyColor  = { high: '#f87171', medium: '#f59e0b', low: '#6baed6' };
  const urgencyBg     = { high: 'rgba(248,113,113,0.08)', medium: 'rgba(245,158,11,0.08)', low: 'rgba(107,174,214,0.08)' };
  const urgencyBorder = { high: 'rgba(248,113,113,0.22)', medium: 'rgba(245,158,11,0.22)', low: 'rgba(107,174,214,0.22)' };

  // Count how many modal venues still need email (for the modal header badge)
  const stillMissingEmail = emailVenues.filter(v => !v.email || !v.saved || !emailVenues.find(x => x.venueId === v.venueId && x.email)).length;

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

        /* ── Email modal ── */
        .em-overlay {
          position: fixed; inset: 0; z-index: 300;
          background: rgba(3,13,24,0.88); backdrop-filter: blur(14px);
          display: flex; align-items: center; justify-content: center; padding: 1rem;
        }
        .em-modal {
          background: #07111e;
          border: 1px solid rgba(74,133,200,0.22);
          border-radius: 20px;
          width: 100%; max-width: 520px;
          max-height: 88vh;
          display: flex; flex-direction: column;
          box-shadow: 0 32px 96px rgba(0,0,0,0.7);
        }
        .em-modal-header {
          padding: 1.5rem 1.75rem 1rem;
          border-bottom: 1px solid rgba(74,133,200,0.1);
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          flex-shrink: 0;
        }
        .em-modal-body {
          overflow-y: auto; padding: 1.25rem 1.75rem; flex: 1;
        }
        .em-modal-footer {
          padding: 1rem 1.75rem;
          border-top: 1px solid rgba(74,133,200,0.1);
          flex-shrink: 0;
        }
        .em-venue-card {
          background: rgba(9,24,40,0.7);
          border: 1px solid rgba(74,133,200,0.1);
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 10px;
          transition: border-color .15s;
        }
        .em-venue-card.has-email {
          border-color: rgba(34,197,94,0.3);
          background: rgba(34,197,94,0.04);
        }
        .em-field-input {
          width: 100%;
          background: rgba(9,24,40,0.95);
          border: 1px solid rgba(74,133,200,0.35);
          border-radius: 7px;
          padding: 7px 10px;
          color: #e8f1f8;
          font-family: 'Nunito', sans-serif;
          font-size: 13px;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .em-field-input:focus {
          border-color: rgba(74,133,200,0.7);
          box-shadow: 0 0 0 3px rgba(74,133,200,0.14);
        }
        .em-field-display {
          cursor: text;
          border-radius: 6px;
          padding: 5px 8px;
          min-height: 30px;
          display: flex; align-items: center;
          transition: background .15s;
          font-size: 13px;
        }
        .em-field-display:hover { background: rgba(74,133,200,0.1); }
        .em-field-display.empty { color: #3d6285; font-style: italic; }
        .em-field-display.empty:hover::after {
          content: '+ Add';
          color: #4a85c8; font-style: normal; font-weight: 700;
          font-size: 12px; margin-left: 4px;
        }

        @media (max-width: 1100px) {
          .db-stats { grid-template-columns: repeat(2,1fr); }
          .db-main  { grid-template-columns: 1fr; }
        }
        @media (max-width: 767px) {
          .db-wrap { padding: 1rem; }
          .db-stats { grid-template-columns: repeat(2,1fr); gap: 10px; }
          .db-card-body { padding: 12px 14px 16px; }
          .stat-tile { padding: 16px 14px 14px; }
          .campaign-mini-val { font-size: 1.15rem; }
          .action-row { min-height: 44px; }
          .em-modal { max-width: 100%; border-radius: 16px; }
          .em-modal-header { padding: 1rem 1.25rem 0.75rem; }
          .em-modal-body { padding: 1rem 1.25rem; }
          .em-modal-footer { padding: 0.75rem 1.25rem; }
        }
        @media (max-width: 480px) {
          .db-stats { grid-template-columns: repeat(2,1fr); gap: 8px; }
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
                          if (action.type === 'email_needed')        openEmailModal();
                          else if (action.type === 'social_approval') onNavigate?.('social');
                          else                                         onNavigate?.('campaigns');
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

      {/* ── Missing Email Modal ────────────────────────────────────────────────── */}
      {showEmailModal && (
        <>
          {/* Click-away backdrop */}
          <div className="em-overlay" onClick={e => { if (e.target === e.currentTarget) setShowEmailModal(false); }}>
            <div className="em-modal" onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="em-modal-header">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontFamily: "'Bebas Neue', cursive", fontSize: '1.35rem',
                      letterSpacing: '0.05em', color: '#ffffff',
                    }}>Missing Contact Info</span>
                    {emailVenues.length > 0 && (
                      <span style={{
                        background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)',
                        borderRadius: 99, padding: '2px 10px',
                        color: '#f87171', fontSize: 12, fontWeight: 700,
                      }}>
                        {emailVenues.filter(v => !v.email).length} left
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#3d6285', fontSize: 13, margin: '4px 0 0', fontWeight: 600 }}>
                    Click any field to add email or phone. Saves automatically.
                  </p>
                </div>
                <button
                  onClick={() => setShowEmailModal(false)}
                  style={{
                    background: 'rgba(74,133,200,0.1)', border: '1px solid rgba(74,133,200,0.2)',
                    borderRadius: 8, padding: '6px 14px', color: '#6baed6',
                    fontFamily: "'Nunito', sans-serif", fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="em-modal-body">
                {emailModalLoading ? (
                  <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#3d6285', fontSize: 14 }}>
                    Loading venues…
                  </div>
                ) : emailVenues.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '3rem 1rem',
                    border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12,
                    background: 'rgba(34,197,94,0.05)',
                  }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                    <p style={{ color: '#22c55e', fontWeight: 700, fontSize: 14, margin: 0 }}>
                      All venues in active runs have email addresses!
                    </p>
                  </div>
                ) : (
                  emailVenues.map(venue => {
                    const emailEditing = modalEdit?.venueId === venue.venueId && modalEdit.field === 'email';
                    const phoneEditing = modalEdit?.venueId === venue.venueId && modalEdit.field === 'phone';
                    const hasEmail = !!venue.email;

                    return (
                      <div
                        key={venue.venueId}
                        className={`em-venue-card${hasEmail ? ' has-email' : ''}`}
                      >
                        {/* Top row: name + campaign + checkmark */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <div style={{ color: '#ffffff', fontWeight: 800, fontSize: 14, marginBottom: 2 }}>
                              {venue.name}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ color: '#7aa5c4', fontSize: 12 }}>
                                📍 {venue.city}, {venue.state}
                              </span>
                              <span style={{
                                background: 'rgba(74,133,200,0.1)', border: '1px solid rgba(74,133,200,0.2)',
                                borderRadius: 99, padding: '1px 8px',
                                color: '#6baed6', fontSize: 11, fontWeight: 700,
                              }}>
                                {venue.campaignName}
                              </span>
                            </div>
                          </div>
                          {hasEmail && venue.saved && (
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#22c55e', fontSize: 14, flexShrink: 0,
                            }}>✓</div>
                          )}
                        </div>

                        {/* Fields row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          {/* Email field */}
                          <div>
                            <div style={{ color: '#3d6285', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                              Email ✦
                            </div>
                            {emailEditing ? (
                              <input
                                className="em-field-input"
                                autoFocus
                                type="email"
                                value={modalEdit.value}
                                placeholder="email@venue.com"
                                onChange={e => setModalEdit(prev => prev ? { ...prev, value: e.target.value } : null)}
                                onBlur={commitModalEdit}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); commitModalEdit(); }
                                  if (e.key === 'Escape') { setModalEdit(null); }
                                }}
                              />
                            ) : (
                              <div
                                className={`em-field-display${!venue.email ? ' empty' : ''}`}
                                style={{ color: venue.email ? '#e8f1f8' : undefined }}
                                onClick={() => {
                                  modalCommitting.current = false;
                                  setModalEdit({ venueId: venue.venueId, field: 'email', value: venue.email });
                                }}
                              >
                                {venue.email || ''}
                              </div>
                            )}
                          </div>

                          {/* Phone field */}
                          <div>
                            <div style={{ color: '#3d6285', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                              Phone
                            </div>
                            {phoneEditing ? (
                              <input
                                className="em-field-input"
                                autoFocus
                                type="tel"
                                value={modalEdit.value}
                                placeholder="(555) 000-0000"
                                onChange={e => setModalEdit(prev => prev ? { ...prev, value: e.target.value } : null)}
                                onBlur={commitModalEdit}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); commitModalEdit(); }
                                  if (e.key === 'Escape') { setModalEdit(null); }
                                }}
                              />
                            ) : (
                              <div
                                className={`em-field-display${!venue.phone ? ' empty' : ''}`}
                                style={{ color: venue.phone ? '#e8f1f8' : undefined }}
                                onClick={() => {
                                  modalCommitting.current = false;
                                  setModalEdit({ venueId: venue.venueId, field: 'phone', value: venue.phone });
                                }}
                              >
                                {venue.phone || ''}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="em-modal-footer">
                <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#3d6285', fontSize: 12, fontWeight: 600 }}>
                    {emailVenues.filter(v => !!v.email).length} of {emailVenues.length} have emails
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => onNavigate?.('contact-info')}
                      style={{
                        background: 'transparent', border: '1px solid rgba(74,133,200,0.25)',
                        borderRadius: 8, padding: '8px 16px', color: '#6baed6',
                        fontFamily: "'Nunito', sans-serif", fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', transition: 'background .15s',
                      }}
                    >
                      Open Full Venue List
                    </button>
                    <button
                      onClick={() => setShowEmailModal(false)}
                      style={{
                        background: 'linear-gradient(135deg, #3a7fc1, #2563a8)',
                        border: 'none', borderRadius: 8, padding: '8px 20px',
                        color: '#e8f1f8', fontFamily: "'Nunito', sans-serif",
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(37,99,168,0.4)',
                      }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </>
      )}
    </>
  );
}
