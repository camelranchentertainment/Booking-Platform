'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Campaign {
  id: string;
  name: string;
  status: string;
  cities: string[];
  radius: number;
  date_range_start?: string;
  date_range_end?: string;
  total_venues?: number;
  contacted?: number;
  confirmed?: number;
  pending?: number;
}

interface CampaignVenue {
  id: string;
  status: string;
  venue: {
    id: string;
    name: string;
    city: string;
    state: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    venue_type?: string;
  };
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  'contact?':  { label: 'To Contact',  bg: 'rgba(74,133,200,0.1)',  text: '#6baed6',  border: 'rgba(74,133,200,0.3)'  },
  'pending':   { label: 'Pending',     bg: 'rgba(245,158,11,0.1)',  text: '#f59e0b',  border: 'rgba(245,158,11,0.3)'  },
  'declined':  { label: 'Declined',    bg: 'rgba(248,113,113,0.1)', text: '#f87171',  border: 'rgba(248,113,113,0.3)' },
  'booked':    { label: 'Booked',      bg: 'rgba(34,197,94,0.1)',   text: '#22c55e',  border: 'rgba(34,197,94,0.3)'   },
  'responded': { label: 'Responded',   bg: 'rgba(167,139,250,0.1)', text: '#a78bfa',  border: 'rgba(167,139,250,0.3)' },
};

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

interface CampaignManagerProps { initialData?: any; }

export default function CampaignManager({ initialData }: CampaignManagerProps) {
  const [campaigns, setCampaigns]             = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignVenues, setCampaignVenues]   = useState<CampaignVenue[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [isDiscovering, setIsDiscovering]     = useState(false);
  const [showCreate, setShowCreate]           = useState(false);
  const [statusMenuOpen, setStatusMenuOpen]   = useState<string | null>(null);

  const [newRun, setNewRun] = useState({
    name: '',
    date_range_start: '',
    date_range_end: '',
    locations: [{ city: '', state: 'AR' }],
    radius: 25,
  });

  useEffect(() => { loadCampaigns(); }, []);

  useEffect(() => {
    if (initialData?.campaignId && campaigns.length > 0) {
      const c = campaigns.find(c => c.id === initialData.campaignId);
      if (c) openCampaignDetail(c);
    }
  }, [initialData, campaigns]);

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('campaigns')
        .select(`*, campaign_venues(id, status, venue:venues(id, name, email))`)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const enriched = (data || []).map((c: any) => {
        const cvs = c.campaign_venues || [];
        return {
          ...c,
          total_venues: cvs.length,
          contacted:    cvs.filter((v: any) => v.status && v.status !== 'contact?').length,
          confirmed:    cvs.filter((v: any) => v.status === 'booked').length,
          pending:      cvs.filter((v: any) => v.status === 'pending').length,
        };
      });
      setCampaigns(enriched);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const openCampaignDetail = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    const { data } = await supabase
      .from('campaign_venues')
      .select(`id, status, venue:venues(id, name, city, state, address, phone, email, website, venue_type)`)
      .eq('campaign_id', campaign.id)
      .order('status');
    setCampaignVenues((data as unknown as CampaignVenue[]) || []);
  };

  // ── Create run ───────────────────────────────────────────────────────────
  const createRun = async () => {
    if (!newRun.name.trim()) return;
    const validLocs = newRun.locations.filter(l => l.city.trim());
    if (validLocs.length === 0) return;

    try {
      const local = localStorage.getItem('loggedInUser');
      const userId = local ? JSON.parse(local).id : null;
      const cities = validLocs.map(l => `${l.city.trim()}, ${l.state}`);

      const { data, error } = await supabase
        .from('campaigns')
        .insert([{
          name: newRun.name.trim(),
          status: 'active',
          cities,
          radius: newRun.radius,
          date_range_start: newRun.date_range_start || null,
          date_range_end:   newRun.date_range_end   || null,
          user_id: userId,
        }])
        .select().single();

      if (error) throw error;
      setShowCreate(false);
      setNewRun({ name: '', date_range_start: '', date_range_end: '', locations: [{ city: '', state: 'AR' }], radius: 25 });
      await loadCampaigns();
      if (data) openCampaignDetail(data);
    } catch (err) { console.error(err); }
  };

  // ── Discover venues ──────────────────────────────────────────────────────
  const discoverVenues = async () => {
    if (!selectedCampaign) return;
    setIsDiscovering(true);
    try {
      const res = await fetch(`/api/campaigns/${selectedCampaign.id}/discover-venues`, { method: 'POST' });
      const result = await res.json();
      if (result.venues) {
        const toInsert = result.venues
          .filter((v: any) => !v.in_campaign)
          .map((v: any) => ({ campaign_id: selectedCampaign.id, venue_id: v.id, status: 'contact?' }));
        if (toInsert.length > 0) {
          await supabase.from('campaign_venues').upsert(toInsert, { onConflict: 'campaign_id,venue_id' });
        }
      }
      await openCampaignDetail(selectedCampaign);
    } catch (err) { console.error(err); }
    finally { setIsDiscovering(false); }
  };

  // ── Venue actions ────────────────────────────────────────────────────────
  const updateStatus = async (cvId: string, status: string) => {
    await supabase.from('campaign_venues').update({ status }).eq('id', cvId);
    setStatusMenuOpen(null);
    if (selectedCampaign) openCampaignDetail(selectedCampaign);
  };

  const removeVenue = async (cvId: string) => {
    if (!confirm('Remove this venue from the run?')) return;
    await supabase.from('campaign_venues').delete().eq('id', cvId);
    if (selectedCampaign) openCampaignDetail(selectedCampaign);
  };

  const deleteCampaign = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await supabase.from('campaign_venues').delete().eq('campaign_id', id);
    await supabase.from('campaigns').delete().eq('id', id);
    setSelectedCampaign(null);
    loadCampaigns();
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  const venuesByStatus = (status: string) => campaignVenues.filter(cv => cv.status === status);
  const statuses = ['contact?', 'pending', 'responded', 'booked', 'declined'];

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:400, background:'#030d18', fontFamily:"'Nunito',sans-serif",
      color:'#3d6285', fontSize:15 }}>Loading runs…</div>
  );

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .cm-wrap {
          background: #030d18; min-height: 100vh;
          padding: 2rem; font-family: 'Nunito', sans-serif;
        }
        /* ── Run cards ── */
        .run-card {
          background: rgba(9,24,40,0.8);
          border: 1px solid rgba(74,133,200,0.12);
          border-radius: 14px; padding: 1.5rem;
          cursor: pointer; position: relative;
          transition: border-color .18s, transform .18s, box-shadow .18s;
        }
        .run-card:hover {
          border-color: rgba(74,133,200,0.38);
          transform: translateY(-3px);
          box-shadow: 0 12px 36px rgba(0,0,0,0.3);
        }
        /* ── Buttons ── */
        .cm-btn-primary {
          background: linear-gradient(135deg,#3a7fc1,#2563a8);
          border:none; border-radius:9px; color:#e8f1f8;
          font-family:'Nunito',sans-serif; font-weight:800; font-size:14px;
          padding:10px 22px; cursor:pointer;
          box-shadow:0 4px 16px rgba(37,99,168,0.35);
          transition: transform .15s, box-shadow .15s;
        }
        .cm-btn-primary:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 8px 24px rgba(37,99,168,0.5); }
        .cm-btn-primary:disabled { opacity:.55; cursor:not-allowed; }
        .cm-btn-ghost {
          background:transparent; border:1px solid rgba(74,133,200,0.28);
          border-radius:8px; color:#6baed6;
          font-family:'Nunito',sans-serif; font-size:13px; font-weight:700;
          padding:8px 18px; cursor:pointer; transition:background .15s;
        }
        .cm-btn-ghost:hover { background:rgba(74,133,200,0.1); }
        .cm-btn-danger {
          background:transparent; border:1px solid rgba(248,113,113,0.28);
          border-radius:8px; color:#f87171;
          font-family:'Nunito',sans-serif; font-size:12px; font-weight:700;
          padding:6px 14px; cursor:pointer; transition:background .15s;
        }
        .cm-btn-danger:hover { background:rgba(248,113,113,0.1); }
        /* ── Form inputs ── */
        .cm-input {
          background:rgba(9,24,40,0.95); border:1px solid rgba(74,133,200,0.22);
          border-radius:8px; padding:10px 14px; color:#e8f1f8;
          font-family:'Nunito',sans-serif; font-size:14px; outline:none;
          width:100%; transition:border-color .2s;
        }
        .cm-input::placeholder { color:#3d6285; }
        .cm-input:focus { border-color:rgba(74,133,200,0.55); }
        .cm-select {
          background:rgba(9,24,40,0.95); border:1px solid rgba(74,133,200,0.22);
          border-radius:8px; padding:10px 12px; color:#e8f1f8;
          font-family:'Nunito',sans-serif; font-size:14px; outline:none; cursor:pointer;
        }
        /* ── Status badge ── */
        .cm-status {
          display:inline-flex; align-items:center; gap:5px;
          padding:4px 12px; border-radius:99px; font-size:11px;
          font-weight:700; border:1px solid; cursor:pointer;
          transition:opacity .15s; white-space:nowrap;
          font-family:'Nunito',sans-serif;
        }
        .cm-status:hover { opacity:.8; }
        /* ── Status dropdown ── */
        .cm-status-menu {
          position:absolute; top:calc(100% + 4px); left:0; z-index:60;
          background:#091828; border:1px solid rgba(74,133,200,0.2);
          border-radius:10px; padding:6px; min-width:160px;
          box-shadow:0 12px 32px rgba(0,0,0,0.5);
        }
        .cm-status-opt {
          display:block; width:100%; padding:8px 12px;
          border:none; border-radius:7px; background:transparent;
          font-family:'Nunito',sans-serif; font-size:13px; font-weight:700;
          text-align:left; cursor:pointer; transition:background .12s;
        }
        .cm-status-opt:hover { background:rgba(74,133,200,0.1); }
        /* ── Venue row ── */
        .venue-row {
          background:rgba(9,24,40,0.7); border:1px solid rgba(74,133,200,0.08);
          border-radius:10px; padding:14px 16px;
          display:flex; align-items:flex-start; gap:14px;
          transition:background .15s, border-color .15s;
        }
        .venue-row:hover {
          background:rgba(9,24,40,1);
          border-color:rgba(74,133,200,0.22);
        }
        /* ── Modal ── */
        .cm-modal-overlay {
          position:fixed; inset:0; z-index:200;
          background:rgba(3,13,24,0.88); backdrop-filter:blur(12px);
          display:flex; align-items:center; justify-content:center; padding:1rem;
        }
        .cm-modal {
          background:#091828; border:1px solid rgba(74,133,200,0.2);
          border-radius:18px; padding:2rem; width:100%; max-width:520px;
          box-shadow:0 24px 80px rgba(0,0,0,0.6); max-height:90vh; overflow-y:auto;
        }
        /* ── Kanban column ── */
        .kanban-col {
          background:rgba(9,24,40,0.5); border:1px solid rgba(74,133,200,0.08);
          border-radius:12px; padding:14px; min-width:240px; flex:1;
        }
        .kanban-header {
          font-size:11px; font-weight:800; text-transform:uppercase;
          letter-spacing:0.1em; padding:0 4px 10px;
          border-bottom:1px solid rgba(74,133,200,0.1); margin-bottom:10px;
        }
        label.cm-label {
          display:block; color:#7aa5c4; font-size:12px;
          font-weight:700; margin-bottom:6px; letter-spacing:0.04em;
        }
        @media(max-width:900px) {
          .cm-wrap { padding:1rem; }
        }
      `}</style>

      <div className="cm-wrap">
        <div style={{ maxWidth:1400, margin:'0 auto' }}>

          {/* ── List view ──────────────────────────────────────────────────── */}
          {!selectedCampaign && (
            <>
              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.75rem', flexWrap:'wrap', gap:12 }}>
                <div>
                  <h1 style={{ fontFamily:"'Bebas Neue',cursive", fontWeight:400,
                    fontSize:'clamp(1.8rem,3vw,2.4rem)', letterSpacing:'0.06em',
                    color:'#ffffff', margin:0, lineHeight:1 }}>Runs & Tours</h1>
                  <p style={{ color:'#3d6285', margin:'5px 0 0', fontSize:13, fontWeight:600 }}>
                    {campaigns.length} run{campaigns.length !== 1 ? 's' : ''} total
                  </p>
                </div>
                <button className="cm-btn-primary" onClick={() => setShowCreate(true)}>
                  + Create Run
                </button>
              </div>

              {/* Campaign grid */}
              {campaigns.length === 0 ? (
                <div style={{ textAlign:'center', padding:'5rem 2rem',
                  border:'1px dashed rgba(74,133,200,0.15)', borderRadius:16 }}>
                  <div style={{ fontSize:40, marginBottom:16 }}>🛣️</div>
                  <div style={{ color:'#ffffff', fontWeight:800, fontSize:16, marginBottom:8 }}>No runs yet</div>
                  <p style={{ color:'#3d6285', fontSize:14, margin:'0 0 20px' }}>
                    Create your first run to start organising venue outreach.
                  </p>
                  <button className="cm-btn-primary" onClick={() => setShowCreate(true)}>Create First Run</button>
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:18 }}>
                  {campaigns.map(campaign => {
                    const total  = campaign.total_venues || 0;
                    const booked = campaign.confirmed || 0;
                    const pct    = total > 0 ? Math.round((booked / total) * 100) : 0;
                    const sc     = campaign.status === 'active'
                      ? { bg:'rgba(34,197,94,0.1)', text:'#22c55e', border:'rgba(34,197,94,0.25)' }
                      : { bg:'rgba(100,116,139,0.1)', text:'#94a3b8', border:'rgba(100,116,139,0.25)' };

                    return (
                      <div key={campaign.id} className="run-card" onClick={() => openCampaignDetail(campaign)}>
                        {/* Status + delete */}
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                          <span style={{ background:sc.bg, color:sc.text, border:`1px solid ${sc.border}`,
                            borderRadius:99, padding:'3px 12px', fontSize:11, fontWeight:700, fontFamily:"'Nunito',sans-serif" }}>
                            {campaign.status}
                          </span>
                          <button className="cm-btn-danger"
                            style={{ padding:'4px 10px', fontSize:11 }}
                            onClick={e => { e.stopPropagation(); deleteCampaign(campaign.id, campaign.name); }}>
                            Delete
                          </button>
                        </div>

                        {/* Name */}
                        <div style={{ color:'#ffffff', fontWeight:800, fontSize:16, marginBottom:6 }}>
                          {campaign.name}
                        </div>

                        {/* Meta */}
                        {(campaign.date_range_start || campaign.date_range_end) && (
                          <div style={{ color:'#3d6285', fontSize:12, fontWeight:600, marginBottom:4 }}>
                            {fmtDate(campaign.date_range_start)} {campaign.date_range_end ? `→ ${fmtDate(campaign.date_range_end)}` : ''}
                          </div>
                        )}
                        {campaign.cities?.length > 0 && (
                          <div style={{ color:'#3d6285', fontSize:12, fontWeight:600, marginBottom:14 }}>
                            {campaign.cities.join(' · ')} · {campaign.radius}mi
                          </div>
                        )}

                        {/* Progress bar */}
                        <div style={{ height:4, background:'rgba(255,255,255,0.06)', borderRadius:99, overflow:'hidden', marginBottom:12 }}>
                          <div style={{ height:'100%', width:`${pct}%`, borderRadius:99,
                            background:'linear-gradient(90deg,#3a7fc1,#22c55e)', transition:'width .4s' }} />
                        </div>

                        {/* Mini stats */}
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
                          {[
                            { label:'Total',     val:total,                     color:'#e8f1f8' },
                            { label:'Contacted', val:campaign.contacted || 0,   color:'#6baed6' },
                            { label:'Pending',   val:campaign.pending || 0,     color:'#f59e0b' },
                            { label:'Booked',    val:booked,                    color:'#22c55e' },
                          ].map(s => (
                            <div key={s.label} style={{ textAlign:'center' }}>
                              <div style={{ color:s.color, fontWeight:800, fontSize:18, lineHeight:1 }}>{s.val}</div>
                              <div style={{ color:'#3d6285', fontSize:10, fontWeight:700,
                                textTransform:'uppercase', letterSpacing:'0.08em', marginTop:3 }}>{s.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── Campaign detail view ──────────────────────────────────────── */}
          {selectedCampaign && (
            <>
              {/* Detail header */}
              <div style={{ display:'flex', alignItems:'center', gap:16,
                flexWrap:'wrap', marginBottom:'1.5rem' }}>
                <button className="cm-btn-ghost"
                  onClick={() => { setSelectedCampaign(null); setCampaignVenues([]); }}>
                  ← Back
                </button>
                <div style={{ flex:1 }}>
                  <h1 style={{ fontFamily:"'Bebas Neue',cursive", fontWeight:400,
                    fontSize:'clamp(1.6rem,3vw,2.2rem)', letterSpacing:'0.06em',
                    color:'#ffffff', margin:0, lineHeight:1 }}>
                    {selectedCampaign.name}
                  </h1>
                  <p style={{ color:'#3d6285', margin:'4px 0 0', fontSize:13, fontWeight:600 }}>
                    {selectedCampaign.cities?.join(' · ')} · {selectedCampaign.radius}mi radius
                    {selectedCampaign.date_range_start && ` · ${fmtDate(selectedCampaign.date_range_start)}${selectedCampaign.date_range_end ? ` → ${fmtDate(selectedCampaign.date_range_end)}` : ''}`}
                  </p>
                </div>
                <button className="cm-btn-primary" onClick={discoverVenues}
                  disabled={isDiscovering}>
                  {isDiscovering ? 'Discovering…' : '🔍 Discover Venues'}
                </button>
              </div>

              {/* Summary bar */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',
                gap:12, marginBottom:'1.5rem' }}>
                {[
                  { label:'Total Venues', val:campaignVenues.length,                          color:'#e8f1f8', border:'rgba(74,133,200,0.2)'  },
                  { label:'To Contact',   val:venuesByStatus('contact?').length,               color:'#6baed6', border:'rgba(74,133,200,0.2)'  },
                  { label:'Pending',      val:venuesByStatus('pending').length,                color:'#f59e0b', border:'rgba(245,158,11,0.2)'  },
                  { label:'Responded',    val:venuesByStatus('responded').length,              color:'#a78bfa', border:'rgba(167,139,250,0.2)' },
                  { label:'Booked',       val:venuesByStatus('booked').length,                 color:'#22c55e', border:'rgba(34,197,94,0.2)'   },
                  { label:'Declined',     val:venuesByStatus('declined').length,               color:'#f87171', border:'rgba(248,113,113,0.2)' },
                ].map(s => (
                  <div key={s.label} style={{ background:'rgba(9,24,40,0.8)', border:`1px solid ${s.border}`,
                    borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
                    <div style={{ color:s.color, fontWeight:800, fontSize:22, lineHeight:1 }}>{s.val}</div>
                    <div style={{ color:'#3d6285', fontSize:10, fontWeight:700,
                      textTransform:'uppercase', letterSpacing:'0.08em', marginTop:4 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Discovering spinner */}
              {isDiscovering && (
                <div style={{ textAlign:'center', padding:'2rem',
                  background:'rgba(9,24,40,0.8)', borderRadius:12, marginBottom:'1.5rem',
                  border:'1px solid rgba(74,133,200,0.15)', color:'#6baed6',
                  fontWeight:700, fontSize:14 }}>
                  Discovering venues in {selectedCampaign.cities?.join(', ')}…
                </div>
              )}

              {/* Kanban board */}
              {campaignVenues.length === 0 && !isDiscovering ? (
                <div style={{ textAlign:'center', padding:'4rem 2rem',
                  border:'1px dashed rgba(74,133,200,0.15)', borderRadius:14 }}>
                  <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
                  <div style={{ color:'#ffffff', fontWeight:800, fontSize:15, marginBottom:8 }}>No venues yet</div>
                  <p style={{ color:'#3d6285', fontSize:13, margin:'0 0 18px' }}>
                    Click "Discover Venues" to automatically find live music spots in your cities.
                  </p>
                  <button className="cm-btn-primary" onClick={discoverVenues}>
                    🔍 Discover Venues
                  </button>
                </div>
              ) : (
                <div style={{ display:'flex', gap:14, overflowX:'auto', paddingBottom:8, alignItems:'flex-start' }}>
                  {statuses.map(status => {
                    const cfg   = STATUS_CONFIG[status];
                    const group = venuesByStatus(status);
                    return (
                      <div key={status} className="kanban-col">
                        <div className="kanban-header" style={{ color:cfg.text }}>
                          {cfg.label}
                          <span style={{ marginLeft:8, background:cfg.bg, border:`1px solid ${cfg.border}`,
                            borderRadius:99, padding:'1px 9px', fontSize:10, color:cfg.text }}>
                            {group.length}
                          </span>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                          {group.map(cv => (
                            <VenueCard key={cv.id} cv={cv} cfg={cfg}
                              statuses={statuses}
                              statusMenuOpen={statusMenuOpen}
                              setStatusMenuOpen={setStatusMenuOpen}
                              onStatusChange={updateStatus}
                              onRemove={removeVenue}
                            />
                          ))}
                          {group.length === 0 && (
                            <div style={{ color:'#3d6285', fontSize:12, fontStyle:'italic',
                              padding:'12px 8px', textAlign:'center' }}>—</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Create Run Modal ──────────────────────────────────────────────── */}
      {showCreate && (
        <div className="cm-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="cm-modal">
            <h2 style={{ fontFamily:"'Bebas Neue',cursive", fontWeight:400,
              fontSize:'1.9rem', letterSpacing:'0.06em', color:'#ffffff', margin:'0 0 4px' }}>
              New Run
            </h2>
            <p style={{ color:'#3d6285', fontSize:13, margin:'0 0 1.5rem', fontWeight:600 }}>
              Plan a tour stretch and discover venues along the way.
            </p>

            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* Name */}
              <div>
                <label className="cm-label">Run Name *</label>
                <input className="cm-input" placeholder="e.g. Ozark Spring Run 2026"
                  value={newRun.name} onChange={e => setNewRun({ ...newRun, name: e.target.value })} />
              </div>

              {/* Dates */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label className="cm-label">Start Date</label>
                  <input className="cm-input" type="date"
                    value={newRun.date_range_start}
                    onChange={e => setNewRun({ ...newRun, date_range_start: e.target.value })} />
                </div>
                <div>
                  <label className="cm-label">End Date</label>
                  <input className="cm-input" type="date"
                    value={newRun.date_range_end}
                    onChange={e => setNewRun({ ...newRun, date_range_end: e.target.value })} />
                </div>
              </div>

              {/* Cities */}
              <div>
                <label className="cm-label">Cities *</label>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {newRun.locations.map((loc, i) => (
                    <div key={i} style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <input className="cm-input" placeholder="City"
                        style={{ flex:2 }} value={loc.city}
                        onChange={e => {
                          const locs = [...newRun.locations];
                          locs[i].city = e.target.value;
                          setNewRun({ ...newRun, locations: locs });
                        }} />
                      <select className="cm-select" style={{ width:80 }} value={loc.state}
                        onChange={e => {
                          const locs = [...newRun.locations];
                          locs[i].state = e.target.value;
                          setNewRun({ ...newRun, locations: locs });
                        }}>
                        {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {newRun.locations.length > 1 && (
                        <button style={{ background:'transparent', border:'1px solid rgba(248,113,113,0.3)',
                          borderRadius:7, color:'#f87171', padding:'8px 10px',
                          cursor:'pointer', fontWeight:700, fontSize:13 }}
                          onClick={() => setNewRun({ ...newRun, locations: newRun.locations.filter((_,idx) => idx !== i) })}>
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button style={{ alignSelf:'flex-start', background:'transparent',
                    border:'1px solid rgba(74,133,200,0.28)', borderRadius:8,
                    color:'#6baed6', fontFamily:"'Nunito',sans-serif",
                    fontSize:13, fontWeight:700, padding:'7px 16px', cursor:'pointer' }}
                    onClick={() => setNewRun({ ...newRun, locations: [...newRun.locations, { city:'', state:'AR' }] })}>
                    + Add City
                  </button>
                </div>
              </div>

              {/* Radius */}
              <div>
                <label className="cm-label">Search Radius</label>
                <select className="cm-select" value={newRun.radius}
                  onChange={e => setNewRun({ ...newRun, radius: Number(e.target.value) })}>
                  {[10,15,25,35,50].map(r => <option key={r} value={r}>{r} miles</option>)}
                </select>
              </div>

              {/* Actions */}
              <div style={{ display:'flex', gap:10, marginTop:6 }}>
                <button className="cm-btn-ghost" style={{ flex:1 }} onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button className="cm-btn-primary" style={{ flex:2 }}
                  disabled={!newRun.name.trim() || newRun.locations.every(l => !l.city.trim())}
                  onClick={createRun}>
                  Create Run
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Venue card (kanban) ──────────────────────────────────────────────────────
function VenueCard({ cv, cfg, statuses, statusMenuOpen, setStatusMenuOpen, onStatusChange, onRemove }: {
  cv: CampaignVenue;
  cfg: { label: string; bg: string; text: string; border: string };
  statuses: string[];
  statusMenuOpen: string | null;
  setStatusMenuOpen: (id: string | null) => void;
  onStatusChange: (cvId: string, status: string) => void;
  onRemove: (cvId: string) => void;
}) {
  const isOpen = statusMenuOpen === cv.id;
  return (
    <div style={{ background:'rgba(9,24,40,0.85)', border:'1px solid rgba(74,133,200,0.1)',
      borderRadius:10, padding:'12px 14px',
      transition:'border-color .15s', position:'relative' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(74,133,200,0.28)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(74,133,200,0.1)')}>

      {/* Remove */}
      <button onClick={() => onRemove(cv.id)}
        style={{ position:'absolute', top:8, right:8, background:'transparent',
          border:'none', color:'#3d6285', fontSize:14, cursor:'pointer',
          lineHeight:1, padding:'2px 5px', borderRadius:4,
          transition:'color .15s' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
        onMouseLeave={e => (e.currentTarget.style.color = '#3d6285')}
        title="Remove">✕</button>

      {/* Venue name */}
      <div style={{ color:'#ffffff', fontWeight:800, fontSize:13,
        lineHeight:1.3, marginBottom:6, paddingRight:20 }}>
        {cv.venue.name}
      </div>

      {/* Location */}
      <div style={{ color:'#3d6285', fontSize:11, fontWeight:600, marginBottom:8 }}>
        {cv.venue.city}, {cv.venue.state}
        {cv.venue.venue_type && ` · ${cv.venue.venue_type}`}
      </div>

      {/* Contact info */}
      <div style={{ fontSize:11, marginBottom:10 }}>
        {cv.venue.email
          ? <span style={{ color:'#22c55e' }}>✉ {cv.venue.email}</span>
          : <span style={{ color:'#3d6285', fontStyle:'italic' }}>No email</span>}
        {cv.venue.phone && <span style={{ color:'#4a85c8', marginLeft:8 }}>☎ {cv.venue.phone}</span>}
      </div>

      {/* Status badge / dropdown */}
      <div style={{ position:'relative', display:'inline-block' }}>
        <button className="cm-status"
          style={{ background:cfg.bg, color:cfg.text, borderColor:cfg.border }}
          onClick={() => setStatusMenuOpen(isOpen ? null : cv.id)}>
          {cfg.label} <span style={{ fontSize:9 }}>▼</span>
        </button>
        {isOpen && (
          <>
            <div style={{ position:'fixed', inset:0, zIndex:59 }}
              onClick={() => setStatusMenuOpen(null)} />
            <div className="cm-status-menu">
              {statuses.map(s => {
                const c = STATUS_CONFIG[s];
                return (
                  <button key={s} className="cm-status-opt" style={{ color:c.text }}
                    onClick={() => onStatusChange(cv.id, s)}>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Website link */}
      {cv.venue.website && (
        <a href={cv.venue.website} target="_blank" rel="noopener noreferrer"
          style={{ display:'block', color:'#4a85c8', fontSize:11,
            marginTop:8, textDecoration:'none' }}
          onClick={e => e.stopPropagation()}>
          Website ↗
        </a>
      )}
    </div>
  );
}
