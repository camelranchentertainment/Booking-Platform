'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Booking {
  id: string;
  venue_id: string;
  booking_date?: string; // YYYY-MM-DD show date, stored on campaign_venues row
  venue: {
    id: string;
    name: string;
    city: string;
    state: string;
    website?: string;
  };
  campaign?: { name: string };
  status: string;
}

interface SocialPost {
  id: string;
  booking_id: string;
  platform: 'facebook' | 'instagram' | 'twitter';
  post_text: string;
  post_date: string;
  hashtags: string[];
  mentions: string[];
  image_prompt?: string;
  status: 'draft' | 'scheduled' | 'posted';
}

// ─── Config ───────────────────────────────────────────────────────────────────
const PLATFORM_CFG = {
  facebook:  { label: 'Facebook',  color: '#4a85c8', bg: 'rgba(74,133,200,0.1)',  border: 'rgba(74,133,200,0.25)'  },
  instagram: { label: 'Instagram', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)' },
  twitter:   { label: 'X / Twitter', color: '#7aa5c4', bg: 'rgba(122,165,196,0.1)', border: 'rgba(122,165,196,0.25)' },
};

const STATUS_CFG = {
  draft:     { label: 'Draft',     color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)'  },
  scheduled: { label: 'Scheduled', color: '#3a7fc1', bg: 'rgba(58,127,193,0.1)',  border: 'rgba(58,127,193,0.25)'  },
  posted:    { label: 'Posted',    color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.25)'   },
};

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// ─── Component ────────────────────────────────────────────────────────────────
export default function SocialMediaCampaign() {
  const [bookings, setBookings]             = useState<Booking[]>([]);
  const [loading, setLoading]               = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [posts, setPosts]                   = useState<SocialPost[]>([]);
  const [loadingPosts, setLoadingPosts]     = useState(false);
  const [isGenerating, setIsGenerating]     = useState(false);
  const [generateMsg, setGenerateMsg]       = useState('');
  const [copiedId, setCopiedId]             = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string>('ALL');
  const [filterStatus, setFilterStatus]     = useState<string>('ALL');

  useEffect(() => { loadBookings(); }, []);

  // ── Load confirmed bookings ──────────────────────────────────────────────
  const loadBookings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('campaign_venues')
        .select(`*, venue:venues(*), campaign:campaigns(name)`)
        .in('status', ['booked', 'confirmed'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBookings(data || []);
    } catch (err) {
      console.error('Error loading bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Load posts for a booking ─────────────────────────────────────────────
  const loadPosts = async (bookingId: string) => {
    setLoadingPosts(true);
    try {
      const { data } = await supabase
        .from('social_media_posts')
        .select('*')
        .eq('booking_id', bookingId)
        .order('post_date', { ascending: true });
      setPosts(data || []);
    } catch (err) {
      console.error('Error loading posts:', err);
    } finally {
      setLoadingPosts(false);
    }
  };

  const selectBooking = (b: Booking) => {
    setSelectedBooking(b);
    loadPosts(b.id);
    setFilterPlatform('ALL');
    setFilterStatus('ALL');
    setGenerateMsg('');
  };

  // ── Generate posts via Anthropic API ────────────────────────────────────
  const generateCampaign = async (booking: Booking) => {
    setIsGenerating(true);
    setGenerateMsg('');
    try {
      const showDate  = fmtDate(booking.booking_date);
      const venue     = booking.venue.name;
      const city      = booking.venue.city;
      const state     = booking.venue.state;
      const campaign  = booking.campaign?.name || '';

      const res = await fetch('/api/social/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue, city, state, showDate, campaign }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Generation failed (${res.status})`);
      }

      const data   = await res.json();
      const parsed: Array<Record<string, unknown>> = data.posts;

      const showDateObj = new Date(booking.booking_date || Date.now());
      const toInsert = parsed.map((p: Record<string, unknown>) => {
        const d = new Date(showDateObj);
        d.setDate(d.getDate() - ((p.days_before as number) || 0));
        return {
          booking_id:   booking.id,
          platform:     p.platform as string,
          post_text:    p.post_text as string,
          post_date:    d.toISOString(),
          hashtags:     (p.hashtags as string[]) || [],
          mentions:     (p.mentions as string[]) || [],
          image_prompt: (p.image_prompt as string) || null,
          status:       'draft',
        };
      });

      const { error } = await supabase.from('social_media_posts').insert(toInsert);
      if (error) throw error;

      setGenerateMsg(`Generated ${toInsert.length} posts`);
      await loadPosts(booking.id);
    } catch (err: unknown) {
      console.error('Generate error:', err);
      setGenerateMsg('error: ' + (err instanceof Error ? err.message : 'Generation failed'));
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Post actions ─────────────────────────────────────────────────────────
  const updateStatus = async (postId: string, status: SocialPost['status']) => {
    await supabase.from('social_media_posts').update({ status }).eq('id', postId);
    if (selectedBooking) loadPosts(selectedBooking.id);
  };

  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post?')) return;
    await supabase.from('social_media_posts').delete().eq('id', postId);
    if (selectedBooking) loadPosts(selectedBooking.id);
  };

  const copyPost = (post: SocialPost) => {
    const text = post.post_text + (post.hashtags?.length ? '\n\n' + post.hashtags.join(' ') : '');
    navigator.clipboard.writeText(text);
    setCopiedId(post.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const visiblePosts = posts.filter(p => {
    if (filterPlatform !== 'ALL' && p.platform !== filterPlatform) return false;
    if (filterStatus   !== 'ALL' && p.status   !== filterStatus)   return false;
    return true;
  });

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:400, background:'#030d18', fontFamily:"'Nunito',sans-serif",
      color:'#3d6285', fontSize:15 }}>Loading…</div>
  );

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .sm-wrap {
          background: #030d18; min-height: 100vh;
          padding: 2rem; font-family: 'Nunito', sans-serif;
        }
        .sm-btn-primary {
          background: linear-gradient(135deg,#3a7fc1,#2563a8);
          border:none; border-radius:9px; color:#e8f1f8;
          font-family:'Nunito',sans-serif; font-weight:800; font-size:14px;
          padding:10px 22px; cursor:pointer;
          box-shadow:0 4px 16px rgba(37,99,168,0.35);
          transition:transform .15s,box-shadow .15s;
        }
        .sm-btn-primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 24px rgba(37,99,168,0.5);}
        .sm-btn-primary:disabled{opacity:.5;cursor:not-allowed;}
        .sm-btn-ghost {
          background:transparent; border:1px solid rgba(74,133,200,0.28);
          border-radius:8px; color:#6baed6;
          font-family:'Nunito',sans-serif; font-size:13px; font-weight:700;
          padding:7px 16px; cursor:pointer; transition:background .15s;
        }
        .sm-btn-ghost:hover{background:rgba(74,133,200,0.1);}
        .sm-btn-xs {
          background:transparent; border:1px solid rgba(74,133,200,0.2);
          border-radius:7px; color:#7aa5c4;
          font-family:'Nunito',sans-serif; font-size:11px; font-weight:700;
          padding:5px 12px; cursor:pointer; transition:all .15s; white-space:nowrap;
        }
        .sm-btn-xs:hover{background:rgba(74,133,200,0.1);border-color:rgba(74,133,200,0.4);}
        .booking-card {
          background:rgba(9,24,40,0.8); border:1px solid rgba(74,133,200,0.1);
          border-radius:12px; padding:16px 18px; cursor:pointer;
          transition:border-color .18s,transform .18s,box-shadow .18s;
        }
        .booking-card:hover{
          border-color:rgba(74,133,200,0.35);
          transform:translateY(-3px);
          box-shadow:0 12px 36px rgba(0,0,0,0.3);
        }
        .booking-card.active{
          border-color:rgba(74,133,200,0.5);
          background:rgba(9,24,40,1);
        }
        .post-card {
          background:rgba(9,24,40,0.75); border:1px solid rgba(74,133,200,0.1);
          border-radius:12px; padding:18px;
          transition:border-color .15s;
        }
        .post-card:hover{border-color:rgba(74,133,200,0.25);}
        .filter-pill {
          padding:6px 16px; border-radius:99px;
          border:1px solid rgba(74,133,200,0.2);
          background:transparent; color:#3d6285;
          font-family:'Nunito',sans-serif; font-size:12px; font-weight:700;
          cursor:pointer; transition:all .15s; white-space:nowrap;
        }
        .filter-pill:hover,.filter-pill.active{
          background:rgba(58,127,193,0.15);
          border-color:rgba(74,133,200,0.4);
          color:#e8f1f8;
        }
        .tag-chip {
          display:inline-block; padding:2px 9px; border-radius:99px;
          font-size:11px; font-weight:700; margin:2px;
        }
        @media(max-width:1023px){
          .sm-wrap{padding:1.25rem;}
          .sm-main-grid{grid-template-columns:260px 1fr!important;}
        }
        @media(max-width:767px){
          .sm-wrap{padding:1rem;}
          .sm-main-grid{grid-template-columns:1fr!important;}
          .sm-btn-primary,.sm-btn-ghost{min-height:44px;}
          .booking-card{padding:12px 14px;}
        }
      `}</style>

      <div className="sm-wrap">
        <div style={{ maxWidth:1400, margin:'0 auto' }}>

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div style={{ marginBottom:'1.75rem' }}>
            <h1 style={{ fontFamily:"'Bebas Neue',cursive", fontWeight:400,
              fontSize:'clamp(1.8rem,3vw,2.4rem)', letterSpacing:'0.06em',
              color:'#ffffff', margin:0, lineHeight:1 }}>Social Media</h1>
            <p style={{ color:'#3d6285', margin:'5px 0 0', fontSize:13, fontWeight:600 }}>
              Generate and manage social posts for confirmed bookings
            </p>
          </div>

          {bookings.length === 0 ? (
            /* ── Empty state ────────────────────────────────────────────── */
            <div style={{ textAlign:'center', padding:'5rem 2rem',
              border:'1px dashed rgba(74,133,200,0.15)', borderRadius:16 }}>
              <div style={{ fontSize:40, marginBottom:16 }}>📣</div>
              <div style={{ color:'#ffffff', fontWeight:800, fontSize:16, marginBottom:8 }}>
                No confirmed bookings yet
              </div>
              <p style={{ color:'#3d6285', fontSize:14, margin:0 }}>
                Once you mark venues as Booked in your Runs, they'll appear here for social promotion.
              </p>
            </div>
          ) : (
            <div className="sm-main-grid" style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:20 }}>

              {/* ── LEFT: Booking list ────────────────────────────────────── */}
              <div>
                <div style={{ color:'#ffffff', fontWeight:800, fontSize:13,
                  marginBottom:12, letterSpacing:'0.04em' }}>
                  CONFIRMED BOOKINGS
                  <span style={{ color:'#3d6285', fontWeight:600, marginLeft:8 }}>
                    {bookings.length}
                  </span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {bookings.map(b => {
                    const isActive = selectedBooking?.id === b.id;
                    return (
                      <div key={b.id}
                        className={`booking-card${isActive?' active':''}`}
                        onClick={() => selectBooking(b)}>
                        <div style={{ color:'#ffffff', fontWeight:800, fontSize:14,
                          marginBottom:4, lineHeight:1.3 }}>
                          {b.venue.name}
                        </div>
                        <div style={{ color:'#3d6285', fontSize:12, fontWeight:600 }}>
                          {b.venue.city}, {b.venue.state}
                        </div>
                        {b.booking_date && (
                          <div style={{ color:'#4a85c8', fontSize:12, fontWeight:700, marginTop:4 }}>
                            {fmtDate(b.booking_date)}
                          </div>
                        )}
                        {b.campaign?.name && (
                          <div style={{ marginTop:6 }}>
                            <span style={{ background:'rgba(74,133,200,0.1)',
                              border:'1px solid rgba(74,133,200,0.2)',
                              borderRadius:99, padding:'2px 10px',
                              color:'#6baed6', fontSize:11, fontWeight:700 }}>
                              {b.campaign.name}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── RIGHT: Post manager ───────────────────────────────────── */}
              <div>
                {!selectedBooking ? (
                  <div style={{ textAlign:'center', padding:'5rem 2rem',
                    border:'1px dashed rgba(74,133,200,0.12)', borderRadius:14 }}>
                    <div style={{ fontSize:36, marginBottom:12 }}>←</div>
                    <div style={{ color:'#ffffff', fontWeight:800, fontSize:15, marginBottom:6 }}>
                      Select a booking
                    </div>
                    <p style={{ color:'#3d6285', fontSize:13, margin:0 }}>
                      Choose a confirmed show from the list to generate or manage its social posts.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Booking header */}
                    <div style={{ background:'rgba(9,24,40,0.8)',
                      border:'1px solid rgba(74,133,200,0.12)',
                      borderRadius:14, padding:'1.25rem',
                      marginBottom:16,
                      display:'flex', alignItems:'center',
                      justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
                      <div>
                        <div style={{ color:'#ffffff', fontWeight:800, fontSize:16, marginBottom:2 }}>
                          {selectedBooking.venue.name}
                        </div>
                        <div style={{ color:'#3d6285', fontSize:13, fontWeight:600 }}>
                          {selectedBooking.venue.city}, {selectedBooking.venue.state}
                          {selectedBooking.booking_date && ` · ${fmtDate(selectedBooking.booking_date)}`}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                        {generateMsg && (
                          <span style={{
                            color: generateMsg.startsWith('error') ? '#f87171' : '#22c55e',
                            fontSize:13, fontWeight:700,
                          }}>
                            {generateMsg.startsWith('error')
                              ? `✕ ${generateMsg.replace('error:','')}`
                              : `✓ ${generateMsg}`}
                          </span>
                        )}
                        <button className="sm-btn-primary"
                          onClick={() => generateCampaign(selectedBooking)}
                          disabled={isGenerating}>
                          {isGenerating ? 'Generating…' : posts.length > 0 ? '↺ Regenerate' : '✦ Generate Posts'}
                        </button>
                      </div>
                    </div>

                    {loadingPosts ? (
                      <div style={{ textAlign:'center', padding:'3rem',
                        color:'#3d6285', fontSize:14, fontWeight:600 }}>
                        Loading posts…
                      </div>
                    ) : posts.length === 0 ? (
                      <div style={{ textAlign:'center', padding:'4rem 2rem',
                        border:'1px dashed rgba(74,133,200,0.12)', borderRadius:14 }}>
                        <div style={{ fontSize:32, marginBottom:12 }}>✦</div>
                        <div style={{ color:'#ffffff', fontWeight:800, fontSize:15, marginBottom:6 }}>
                          No posts generated yet
                        </div>
                        <p style={{ color:'#3d6285', fontSize:13, margin:'0 0 20px' }}>
                          Click "Generate Posts" to create AI-written social content for this show — Facebook, Instagram, and X posts timed from announcement through show day.
                        </p>
                        <button className="sm-btn-primary"
                          onClick={() => generateCampaign(selectedBooking)}
                          disabled={isGenerating}>
                          {isGenerating ? 'Generating…' : '✦ Generate Posts'}
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Filter bar */}
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap',
                          alignItems:'center', marginBottom:16 }}>
                          {/* Platform filters */}
                          {['ALL','facebook','instagram','twitter'].map(p => (
                            <button key={p}
                              className={`filter-pill${filterPlatform===p?' active':''}`}
                              onClick={() => setFilterPlatform(p)}>
                              {p==='ALL' ? `All (${posts.length})` : PLATFORM_CFG[p as keyof typeof PLATFORM_CFG].label}
                            </button>
                          ))}
                          <div style={{ width:1, height:20, background:'rgba(74,133,200,0.2)', margin:'0 4px' }}/>
                          {/* Status filters */}
                          {['ALL','draft','scheduled','posted'].map(s => (
                            <button key={s}
                              className={`filter-pill${filterStatus===s?' active':''}`}
                              onClick={() => setFilterStatus(s)}>
                              {s==='ALL' ? 'All Statuses' : STATUS_CFG[s as keyof typeof STATUS_CFG].label}
                            </button>
                          ))}
                          {/* Stats */}
                          <div style={{ marginLeft:'auto', display:'flex', gap:10 }}>
                            {['draft','scheduled','posted'].map(s => {
                              const cnt = posts.filter(p=>p.status===s).length;
                              const sc  = STATUS_CFG[s as keyof typeof STATUS_CFG];
                              return cnt > 0 ? (
                                <span key={s} style={{ background:sc.bg, border:`1px solid ${sc.border}`,
                                  borderRadius:99, padding:'3px 12px',
                                  color:sc.color, fontSize:11, fontWeight:700 }}>
                                  {cnt} {sc.label}
                                </span>
                              ) : null;
                            })}
                          </div>
                        </div>

                        {/* Post grid */}
                        <div style={{ display:'grid',
                          gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',
                          gap:14 }}>
                          {visiblePosts.map(post => {
                            const pc = PLATFORM_CFG[post.platform] || PLATFORM_CFG.facebook;
                            const sc = STATUS_CFG[post.status]     || STATUS_CFG.draft;
                            return (
                              <div key={post.id} className="post-card">
                                {/* Post header */}
                                <div style={{ display:'flex', alignItems:'center',
                                  justifyContent:'space-between', marginBottom:10, gap:8 }}>
                                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                                    <span style={{ background:pc.bg, border:`1px solid ${pc.border}`,
                                      borderRadius:99, padding:'3px 12px',
                                      color:pc.color, fontSize:11, fontWeight:700 }}>
                                      {pc.label}
                                    </span>
                                    <span style={{ background:sc.bg, border:`1px solid ${sc.border}`,
                                      borderRadius:99, padding:'3px 12px',
                                      color:sc.color, fontSize:11, fontWeight:700 }}>
                                      {sc.label}
                                    </span>
                                  </div>
                                  <span style={{ color:'#3d6285', fontSize:11, fontWeight:600,
                                    whiteSpace:'nowrap' }}>
                                    {fmtDate(post.post_date)}
                                  </span>
                                </div>

                                {/* Post text */}
                                <div style={{ color:'#e8f1f8', fontSize:13,
                                  lineHeight:1.7, marginBottom:10,
                                  whiteSpace:'pre-wrap' }}>
                                  {post.post_text}
                                </div>

                                {/* Hashtags */}
                                {post.hashtags?.length > 0 && (
                                  <div style={{ marginBottom:10 }}>
                                    {post.hashtags.map((h,i) => (
                                      <span key={i} className="tag-chip"
                                        style={{ background:pc.bg, color:pc.color,
                                          border:`1px solid ${pc.border}` }}>
                                        {h}
                                      </span>
                                    ))}
                                    {post.mentions?.map((m,i) => (
                                      <span key={i} className="tag-chip"
                                        style={{ background:'rgba(74,133,200,0.08)',
                                          color:'#6baed6', border:'1px solid rgba(74,133,200,0.18)' }}>
                                        {m}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Image prompt */}
                                {post.image_prompt && (
                                  <div style={{ background:'rgba(74,133,200,0.05)',
                                    border:'1px solid rgba(74,133,200,0.12)',
                                    borderRadius:8, padding:'8px 12px', marginBottom:12 }}>
                                    <div style={{ color:'#3d6285', fontSize:10, fontWeight:700,
                                      textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:3 }}>
                                      Image Idea
                                    </div>
                                    <div style={{ color:'#7aa5c4', fontSize:12 }}>
                                      {post.image_prompt}
                                    </div>
                                  </div>
                                )}

                                {/* Actions */}
                                <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
                                  <button className="sm-btn-xs"
                                    style={ copiedId===post.id
                                      ? { borderColor:'rgba(34,197,94,0.4)', color:'#22c55e' }
                                      : {} }
                                    onClick={() => copyPost(post)}>
                                    {copiedId===post.id ? '✓ Copied' : 'Copy'}
                                  </button>
                                  {post.status !== 'scheduled' && (
                                    <button className="sm-btn-xs"
                                      style={{ borderColor:'rgba(58,127,193,0.3)', color:'#6baed6' }}
                                      onClick={() => updateStatus(post.id,'scheduled')}>
                                      Mark Scheduled
                                    </button>
                                  )}
                                  {post.status !== 'posted' && (
                                    <button className="sm-btn-xs"
                                      style={{ borderColor:'rgba(34,197,94,0.3)', color:'#22c55e' }}
                                      onClick={() => updateStatus(post.id,'posted')}>
                                      Mark Posted
                                    </button>
                                  )}
                                  <button className="sm-btn-xs"
                                    style={{ marginLeft:'auto', borderColor:'rgba(248,113,113,0.25)',
                                      color:'#f87171' }}
                                    onClick={() => deletePost(post.id)}>
                                    Delete
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {visiblePosts.length === 0 && (
                          <div style={{ textAlign:'center', padding:'3rem',
                            color:'#3d6285', fontSize:13, fontWeight:600 }}>
                            No posts match the current filters.
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
