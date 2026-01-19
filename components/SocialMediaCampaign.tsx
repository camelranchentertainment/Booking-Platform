'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Booking {
  id: string;
  venue_id: string;
  venue: any;
  show_date: string;
  status: string;
  campaign_id?: string;
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
  created_at: string;
}

export default function SocialMediaCampaign() {
  const [confirmedBookings, setConfirmedBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);

  useEffect(() => {
    loadConfirmedBookings();
  }, []);

  const loadConfirmedBookings = async () => {
    try {
      // Get bookings with status 'booked' or 'confirmed'
      const { data, error } = await supabase
        .from('campaign_venues')
        .select(`
          *,
          venue:venues(*),
          campaign:campaigns(*)
        `)
        .in('status', ['booked', 'confirmed'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConfirmedBookings(data || []);
    } catch (error) {
      console.error('Error loading bookings:', error);
    }
  };

  const loadSocialPosts = async (bookingId: string) => {
    try {
      const { data, error } = await supabase
        .from('social_media_posts')
        .select('*')
        .eq('booking_id', bookingId)
        .order('post_date', { ascending: true });

      if (error) throw error;
      setSocialPosts(data || []);
    } catch (error) {
      console.error('Error loading social posts:', error);
    }
  };

  const generateSocialCampaign = async (booking: Booking) => {
    setIsGenerating(true);
    
    try {
      const showDate = new Date(booking.venue.show_date || Date.now());
      const venueName = booking.venue.name;
      const city = booking.venue.city;
      const state = booking.venue.state;

      // Call Anthropic API to generate social media posts
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `Create a social media campaign for a country/honky-tonk band called "Better Than Nothin'" performing at ${venueName} in ${city}, ${state} on ${showDate.toLocaleDateString()}.

Generate 4 social media posts (announcement, 1 week before, day before, day of show) in JSON format:

[
  {
    "platform": "facebook",
    "timing": "announcement",
    "days_before": 14,
    "post_text": "Engaging Facebook post with emojis",
    "hashtags": ["#BetterThanNothin", "#CountryMusic", "#LiveMusic"],
    "mentions": ["@VenueName"],
    "image_prompt": "Description for AI image generation"
  }
]

Make posts exciting, use emojis, include local hashtags for ${city} and ${state}, mention the venue, and promote the band's website www.betterthannothin.com. Return ONLY the JSON array, no other text.`
          }],
        })
      });

      const data = await response.json();
      
      if (data.content && data.content[0]) {
        const text = data.content[0].text.trim();
        const cleanJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const posts = JSON.parse(cleanJson);

        // Save posts to database
        const postsToInsert = posts.map((post: any) => {
          const postDate = new Date(showDate);
          postDate.setDate(postDate.getDate() - post.days_before);

          return {
            booking_id: booking.id,
            platform: post.platform,
            post_text: post.post_text,
            post_date: postDate.toISOString(),
            hashtags: post.hashtags,
            mentions: post.mentions,
            image_prompt: post.image_prompt,
            status: 'draft'
          };
        });

        const { error } = await supabase
          .from('social_media_posts')
          .insert(postsToInsert);

        if (error) throw error;

        alert(`✅ Generated ${posts.length} social media posts for this show!`);
        loadSocialPosts(booking.id);
      }
    } catch (error) {
      console.error('Error generating campaign:', error);
      alert('Error generating social media campaign');
    } finally {
      setIsGenerating(false);
    }
  };

  const updatePostStatus = async (postId: string, status: 'draft' | 'scheduled' | 'posted') => {
    try {
      const { error } = await supabase
        .from('social_media_posts')
        .update({ status })
        .eq('id', postId);

      if (error) throw error;
      
      if (selectedBooking) {
        loadSocialPosts(selectedBooking.id);
      }
    } catch (error) {
      console.error('Error updating post status:', error);
    }
  };

  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post?')) return;

    try {
      const { error } = await supabase
        .from('social_media_posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;
      
      if (selectedBooking) {
        loadSocialPosts(selectedBooking.id);
      }
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  const openCampaignModal = (booking: Booking) => {
    setSelectedBooking(booking);
    loadSocialPosts(booking.id);
    setShowCampaignModal(true);
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'facebook': return '📘';
      case 'instagram': return '📷';
      case 'twitter': return '🐦';
      default: return '📱';
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: { [key: string]: React.CSSProperties } = {
      draft: { background: '#A8A8A8', color: 'white' },
      scheduled: { background: '#B7410E', color: 'white' },
      posted: { background: '#6B8E23', color: 'white' }
    };

    return (
      <span style={{
        ...styles[status],
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: '700',
        textTransform: 'uppercase'
      }}>
        {status}
      </span>
    );
  };

  return (
    <div style={{ padding: '2rem' }}>
      <style jsx>{`
        .campaign-container {
          background: linear-gradient(135deg, #2C1810 0%, #3D2817 50%, #2C1810 100%);
          min-height: 100vh;
          padding: 2rem;
        }
        
        .header {
          margin-bottom: 2rem;
        }
        
        .header h2 {
          color: #C8A882;
          font-size: 1.8rem;
          margin: 0 0 0.5rem 0;
        }
        
        .header p {
          color: #9B8A7A;
          margin: 0;
        }
        
        .bookings-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 20px;
        }
        
        .booking-card {
          background: linear-gradient(135deg, rgba(61, 40, 23, 0.9), rgba(74, 50, 32, 0.9));
          border: 2px solid #5C4A3A;
          border-radius: 12px;
          padding: 25px;
          transition: all 0.3s ease;
          cursor: pointer;
        }
        
        .booking-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 25px rgba(0,0,0,0.4);
          border-color: #C8A882;
        }
        
        .booking-card.has-campaign {
          border-color: #6B8E23;
          border-width: 3px;
        }
        
        .venue-name {
          color: #C8A882;
          font-size: 1.4rem;
          font-weight: 700;
          margin-bottom: 10px;
        }
        
        .venue-location {
          color: #E8DCC4;
          font-size: 1rem;
          margin-bottom: 15px;
        }
        
        .show-date {
          color: #B7410E;
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 20px;
        }
        
        .campaign-status {
          background: rgba(107, 142, 35, 0.2);
          border: 1px solid #6B8E23;
          color: #6B8E23;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 0.9rem;
          font-weight: 600;
          display: inline-block;
          margin-bottom: 15px;
        }
        
        .btn-generate {
          width: 100%;
          background: #6B8E23;
          color: white;
          border: none;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 700;
          transition: all 0.3s ease;
        }
        
        .btn-generate:hover {
          background: #5a7a1f;
          transform: translateY(-2px);
        }
        
        .btn-view {
          width: 100%;
          background: #8B7355;
          color: white;
          border: none;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 700;
        }
        
        .modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.8);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          padding: 20px;
          overflow-y: auto;
        }
        
        .modal-content {
          background: linear-gradient(135deg, #3D2817, #4A3220);
          border: 3px solid #8B6F47;
          border-radius: 15px;
          padding: 40px;
          max-width: 1200px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
        }
        
        .modal-title {
          color: #C8A882;
          font-size: 1.8rem;
          margin-bottom: 25px;
        }
        
        .posts-timeline {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        .post-card {
          background: rgba(61, 40, 23, 0.6);
          border: 2px solid #5C4A3A;
          border-radius: 12px;
          padding: 20px;
        }
        
        .post-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }
        
        .platform-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 1.2rem;
          color: #C8A882;
          font-weight: 700;
        }
        
        .post-date {
          color: #9B8A7A;
          font-size: 0.9rem;
        }
        
        .post-text {
          color: #E8DCC4;
          font-size: 1rem;
          line-height: 1.6;
          margin-bottom: 15px;
          white-space: pre-wrap;
        }
        
        .post-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 15px;
        }
        
        .tag {
          background: rgba(200, 168, 130, 0.2);
          color: #C8A882;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 0.85rem;
          border: 1px solid rgba(200, 168, 130, 0.3);
        }
        
        .post-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        
        .btn-small {
          background: #8B7355;
          color: white;
          border: none;
          padding: 8px 15px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.85rem;
        }
        
        .btn-delete {
          background: #C84630;
        }
        
        .close-btn {
          background: none;
          border: none;
          color: #E8DCC4;
          font-size: 2rem;
          cursor: pointer;
          position: absolute;
          top: 20px;
          right: 30px;
        }
        
        .empty-state {
          background: rgba(61, 40, 23, 0.5);
          padding: 4rem;
          text-align: center;
          color: #9B8A7A;
          border-radius: 12px;
          border: 2px dashed #5C4A3A;
        }
        
        .info-box {
          background: rgba(107, 142, 35, 0.2);
          border: 2px solid #6B8E23;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 30px;
        }
        
        .info-box-title {
          color: #6B8E23;
          font-weight: 700;
          margin-bottom: 10px;
          font-size: 1.1rem;
        }
        
        .info-box-text {
          color: #E8DCC4;
          line-height: 1.6;
        }
      `}</style>

      <div className="campaign-container">
        <div className="header">
          <h2>📱 Social Media Campaigns</h2>
          <p>Auto-generate social media promotion for confirmed bookings</p>
        </div>

        <div className="info-box">
          <div className="info-box-title">🤖 How It Works:</div>
          <div className="info-box-text">
            When a booking is confirmed, automatically generate a complete social media campaign! 
            The AI creates multiple posts for Facebook, Instagram, and Twitter/X, scheduled from announcement 
            through show day. Each post includes venue tags, city/state hashtags, and engaging content to 
            promote your show. Posts can be exported and scheduled using free tools like Buffer, Hootsuite, 
            or Meta Business Suite.
          </div>
        </div>

        {confirmedBookings.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎸</div>
            <p style={{ fontSize: '1.1rem', fontWeight: '600', color: '#C8A882', marginBottom: '1rem' }}>
              No confirmed bookings yet
            </p>
            <p>Once you confirm bookings in your campaigns, they'll appear here for social media promotion!</p>
          </div>
        ) : (
          <div className="bookings-grid">
            {confirmedBookings.map((booking) => (
              <div
                key={booking.id}
                className={`booking-card ${socialPosts.length > 0 ? 'has-campaign' : ''}`}
              >
                <div className="venue-name">{booking.venue.name}</div>
                <div className="venue-location">
                  📍 {booking.venue.city}, {booking.venue.state}
                </div>
                <div className="show-date">
                  📅 Show Date: {new Date(booking.venue.show_date || Date.now()).toLocaleDateString()}
                </div>

                {socialPosts.length > 0 ? (
                  <>
                    <div className="campaign-status">
                      ✅ Campaign Generated ({socialPosts.length} posts)
                    </div>
                    <button
                      className="btn-view"
                      onClick={() => openCampaignModal(booking)}
                    >
                      📱 View Campaign
                    </button>
                  </>
                ) : (
                  <button
                    className="btn-generate"
                    onClick={() => {
                      setSelectedBooking(booking);
                      generateSocialCampaign(booking);
                    }}
                    disabled={isGenerating}
                  >
                    {isGenerating ? '⏳ Generating...' : '🤖 Generate Social Campaign'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Campaign Modal */}
      {showCampaignModal && selectedBooking && (
        <div className="modal" onClick={() => setShowCampaignModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowCampaignModal(false)}>×</button>
            
            <h3 className="modal-title">
              📱 Social Campaign: {selectedBooking.venue.name}
            </h3>

            <div style={{ marginBottom: '30px' }}>
              <p style={{ color: '#E8DCC4', marginBottom: '10px' }}>
                <strong>Show Date:</strong> {new Date(selectedBooking.venue.show_date || Date.now()).toLocaleDateString()}
              </p>
              <p style={{ color: '#9B8A7A', fontSize: '0.9rem' }}>
                💡 Copy these posts and schedule them using free tools like Buffer, Hootsuite, or Meta Business Suite
              </p>
            </div>

            <div className="posts-timeline">
              {socialPosts.map((post) => (
                <div key={post.id} className="post-card">
                  <div className="post-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <div className="platform-badge">
                        {getPlatformIcon(post.platform)}
                        {post.platform.charAt(0).toUpperCase() + post.platform.slice(1)}
                      </div>
                      {getStatusBadge(post.status)}
                    </div>
                    <div className="post-date">
                      📅 {new Date(post.post_date).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="post-text">{post.post_text}</div>

                  <div className="post-tags">
                    {post.hashtags?.map((tag, i) => (
                      <span key={i} className="tag">{tag}</span>
                    ))}
                    {post.mentions?.map((mention, i) => (
                      <span key={i} className="tag">{mention}</span>
                    ))}
                  </div>

                  {post.image_prompt && (
                    <div style={{
                      background: 'rgba(139, 111, 71, 0.2)',
                      padding: '10px',
                      borderRadius: '6px',
                      marginBottom: '15px'
                    }}>
                      <strong style={{ color: '#C8A882' }}>🎨 Image Idea:</strong>
                      <p style={{ color: '#E8DCC4', margin: '5px 0 0 0', fontSize: '0.9rem' }}>
                        {post.image_prompt}
                      </p>
                    </div>
                  )}

                  <div className="post-actions">
                    <button
                      className="btn-small"
                      onClick={() => {
                        navigator.clipboard.writeText(post.post_text + '\n\n' + post.hashtags.join(' '));
                        alert('📋 Copied to clipboard!');
                      }}
                    >
                      📋 Copy Text
                    </button>
                    <button
                      className="btn-small"
                      onClick={() => updatePostStatus(post.id, 'scheduled')}
                    >
                      📅 Mark Scheduled
                    </button>
                    <button
                      className="btn-small"
                      onClick={() => updatePostStatus(post.id, 'posted')}
                    >
                      ✅ Mark Posted
                    </button>
                    <button
                      className="btn-small btn-delete"
                      onClick={() => deletePost(post.id)}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => generateSocialCampaign(selectedBooking)}
              disabled={isGenerating}
              style={{
                width: '100%',
                marginTop: '30px',
                background: '#6B8E23',
                color: 'white',
                border: 'none',
                padding: '15px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '1.1rem'
              }}
            >
              {isGenerating ? '⏳ Regenerating...' : '🔄 Regenerate Campaign'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
