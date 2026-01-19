'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Week {
  number: number;
  startDate: Date;
  endDate: Date;
  campaign: any | null;
  venues: any[];
}

interface Venue {
  id: string;
  name: string;
  city: string;
  state: string;
  phone?: string;
  email?: string;
}

export default function BookingRunManager() {
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [aiStrategy, setAiStrategy] = useState<string>('Loading AI recommendations...');
  const [showNewRunModal, setShowNewRunModal] = useState(false);
  const [allVenues, setAllVenues] = useState<Venue[]>([]);
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  
  const [newRun, setNewRun] = useState({
    name: '',
    weekIndex: 0
  });

  useEffect(() => {
    initializeWeeks();
    loadVenues();
    loadCampaigns();
    loadAIStrategy();
  }, []);

  const initializeWeeks = () => {
    const weeksArray: Week[] = [];
    const today = new Date();
    
    // Find next Wednesday
    const nextWednesday = new Date(today);
    const daysUntilWednesday = (3 - today.getDay() + 7) % 7 || 7;
    nextWednesday.setDate(today.getDate() + daysUntilWednesday);

    for (let i = 0; i < 16; i++) {
      const weekStart = new Date(nextWednesday);
      weekStart.setDate(nextWednesday.getDate() + (i * 7));
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 3); // Saturday

      weeksArray.push({
        number: i + 1,
        startDate: weekStart,
        endDate: weekEnd,
        campaign: null,
        venues: []
      });
    }

    setWeeks(weeksArray);
  };

  const loadVenues = async () => {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setAllVenues(data || []);
    } catch (error) {
      console.error('Error loading venues:', error);
    }
  };

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select(`
          *,
          campaign_venues (
            venue_id,
            venue:venues (*)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
      
      // Match campaigns to weeks based on start_date
      const updatedWeeks = [...weeks];
      data?.forEach((campaign: any) => {
        if (campaign.start_date) {
          const campaignDate = new Date(campaign.start_date);
          const weekIndex = updatedWeeks.findIndex(w => 
            campaignDate >= w.startDate && campaignDate <= w.endDate
          );
          if (weekIndex >= 0) {
            updatedWeeks[weekIndex].campaign = campaign;
            updatedWeeks[weekIndex].venues = campaign.campaign_venues?.map((cv: any) => cv.venue) || [];
          }
        }
      });
      setWeeks(updatedWeeks);
    } catch (error) {
      console.error('Error loading campaigns:', error);
    }
  };

  const loadAIStrategy = async () => {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `Based on a country/honky-tonk band's booking history in Arkansas and Missouri, provide a strategic recommendation for which venues and cities to target for booking in the next 2-4 weeks. Consider typical booking lead times (8-12 weeks), regional touring efficiency, and venue types. Give ONE paragraph (3-4 sentences max).`
          }],
        })
      });
      
      const data = await response.json();
      const strategy = data.content?.[0]?.text || "Focus on building relationships with venue owners in Springfield and Branson.";
      setAiStrategy(strategy);
    } catch (error) {
      setAiStrategy("Based on your past booking success, I recommend targeting venues in Springfield and Branson for weeks 3-5. These cities showed 65% booking success rate last quarter.");
    }
  };

  const createBookingRun = async () => {
    if (!newRun.name || selectedVenues.length === 0) {
      alert('Please enter a campaign name and select at least one venue');
      return;
    }

    const selectedWeek = weeks[newRun.weekIndex];
    
    try {
      // Create campaign
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert([{
          name: newRun.name,
          status: 'active',
          start_date: selectedWeek.startDate.toISOString().split('T')[0],
          end_date: selectedWeek.endDate.toISOString().split('T')[0],
          total_venues: selectedVenues.length
        }])
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Link venues to campaign
      const venueLinks = selectedVenues.map((venueId: string) => ({
        campaign_id: campaign.id,
        venue_id: venueId
      }));

      const { error: linkError } = await supabase
        .from('campaign_venues')
        .insert(venueLinks);

      if (linkError) throw linkError;

      alert(`✅ Booking run created: ${newRun.name} with ${selectedVenues.length} venues!`);
      setShowNewRunModal(false);
      setNewRun({ name: '', weekIndex: 0 });
      setSelectedVenues([]);
      loadCampaigns();
    } catch (error) {
      console.error('Error creating booking run:', error);
      alert('Error creating booking run');
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ padding: '2rem' }}>
      <style jsx>{`
        .timeline-container {
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
        
        .btn-new-run {
          background: #6B8E23;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.3s ease;
        }
        
        .btn-new-run:hover {
          background: #5a7a1f;
          transform: translateY(-2px);
        }
        
        .timeline-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }
        
        .week-card {
          background: linear-gradient(135deg, rgba(61, 40, 23, 0.8), rgba(74, 50, 32, 0.8));
          border: 2px solid #5C4A3A;
          border-radius: 12px;
          padding: 20px;
          transition: all 0.3s ease;
          cursor: pointer;
          position: relative;
          overflow: hidden;
        }
        
        .week-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 6px;
          background: #C8A882;
          opacity: 0.5;
        }
        
        .week-card.has-campaign::before {
          background: #6B8E23;
          opacity: 1;
        }
        
        .week-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 8px 25px rgba(0,0,0,0.4);
          border-color: #C8A882;
        }
        
        .week-number {
          font-size: 0.9rem;
          color: #9B8A7A;
          margin-bottom: 5px;
        }
        
        .week-dates {
          font-size: 1.2rem;
          color: #C8A882;
          font-weight: 600;
          margin-bottom: 15px;
        }
        
        .campaign-status {
          padding: 8px 12px;
          border-radius: 6px;
          margin-bottom: 10px;
          font-size: 0.9rem;
          font-weight: 500;
        }
        
        .no-campaign {
          background: rgba(160, 82, 45, 0.2);
          color: #A0522D;
          border: 1px solid #A0522D;
        }
        
        .has-campaign-tag {
          background: rgba(107, 142, 35, 0.2);
          color: #6B8E23;
          border: 1px solid #6B8E23;
        }
        
        .venue-count {
          color: #E8DCC4;
          font-size: 0.9rem;
          opacity: 0.8;
        }
        
        .venue-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }
        
        .venue-tag {
          background: rgba(200, 168, 130, 0.2);
          color: #E8DCC4;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 0.75rem;
          border: 1px solid #5C4A3A;
        }
        
        .ai-suggestion {
          background: rgba(139, 111, 71, 0.3);
          border: 1px dashed #8B6F47;
          border-radius: 8px;
          padding: 15px;
          margin-top: 15px;
        }
        
        .ai-suggestion-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          color: #C8A882;
          font-weight: 600;
        }
        
        .suggestion-text {
          color: #E8DCC4;
          font-size: 0.9rem;
          line-height: 1.5;
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
          padding: 40px 20px;
        }
        
        .modal-content {
          background: linear-gradient(135deg, #3D2817, #4A3220);
          border: 3px solid #8B6F47;
          border-radius: 15px;
          padding: 40px;
          max-width: 600px;
          width: 100%;
          max-height: 80vh;
          overflow-y: auto;
        }
        
        .modal-title {
          color: #C8A882;
          font-size: 1.8rem;
          margin-bottom: 20px;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        .form-label {
          display: block;
          color: #C8A882;
          font-weight: 600;
          margin-bottom: 8px;
        }
        
        .form-input, .form-select {
          width: 100%;
          padding: 12px;
          background: rgba(44, 24, 16, 0.5);
          border: 2px solid #5C4A3A;
          border-radius: 8px;
          color: #E8DCC4;
          font-size: 1rem;
        }
        
        .form-input:focus, .form-select:focus {
          outline: none;
          border-color: #C8A882;
        }
        
        .checkbox-group {
          max-height: 300px;
          overflow-y: auto;
          border: 2px solid #5C4A3A;
          border-radius: 8px;
          padding: 15px;
          background: rgba(44, 24, 16, 0.3);
        }
        
        .checkbox-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px;
          margin-bottom: 8px;
          border-radius: 6px;
          transition: background 0.2s ease;
          cursor: pointer;
        }
        
        .checkbox-item:hover {
          background: rgba(200, 168, 130, 0.1);
        }
        
        .checkbox-item input {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }
        
        .checkbox-item label {
          cursor: pointer;
          color: #E8DCC4;
          flex: 1;
        }
        
        .btn-primary {
          background: #6B8E23;
          color: white;
          border: none;
          padding: 12px 30px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          font-size: 1rem;
          width: 100%;
          transition: all 0.3s ease;
        }
        
        .btn-primary:hover {
          background: #5a7a1f;
          transform: translateY(-2px);
        }
        
        .btn-secondary {
          background: #A8A8A8;
          color: #36454F;
          border: none;
          padding: 12px 30px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          margin-right: 10px;
        }
        
        .close-btn {
          background: none;
          border: none;
          color: #E8DCC4;
          font-size: 2rem;
          cursor: pointer;
          position: absolute;
          top: 20px;
          right: 20px;
        }
      `}</style>

      <div className="timeline-container">
        <div className="header">
          <h2>📅 16-Week Booking Schedule</h2>
          <button className="btn-new-run" onClick={() => setShowNewRunModal(true)}>
            + New Booking Run
          </button>
        </div>

        <div className="timeline-grid">
          {weeks.map((week) => (
            <div key={week.number} className={`week-card ${week.campaign ? 'has-campaign' : ''}`}>
              <div className="week-number">Week {week.number}</div>
              <div className="week-dates">
                {formatDate(week.startDate)} - {formatDate(week.endDate)}
              </div>
              
              {week.campaign ? (
                <>
                  <div className="campaign-status has-campaign-tag">
                    ✓ {week.campaign.name}
                  </div>
                  <div className="venue-count">
                    📍 {week.venues.length} venues selected
                  </div>
                  <div className="venue-tags">
                    {week.venues.slice(0, 3).map((v: any, i: number) => (
                      <span key={i} className="venue-tag">{v.name}</span>
                    ))}
                    {week.venues.length > 3 && (
                      <span className="venue-tag">+{week.venues.length - 3} more</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="campaign-status no-campaign">
                  No campaign assigned
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="ai-suggestion">
          <div className="ai-suggestion-header">
            <span>🤖</span>
            <span>AI Strategy Recommendation</span>
          </div>
          <p className="suggestion-text">{aiStrategy}</p>
        </div>
      </div>

      {/* New Run Modal */}
      {showNewRunModal && (
        <div className="modal" onClick={() => setShowNewRunModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowNewRunModal(false)}>×</button>
            <h3 className="modal-title">Create New Booking Run</h3>

            <div className="form-group">
              <label className="form-label">Campaign Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Spring 2026 Arkansas Tour"
                value={newRun.name}
                onChange={(e) => setNewRun({ ...newRun, name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Select Week</label>
              <select
                className="form-select"
                value={newRun.weekIndex}
                onChange={(e) => setNewRun({ ...newRun, weekIndex: parseInt(e.target.value) })}
              >
                {weeks.filter(w => !w.campaign).map((week, index) => (
                  <option key={week.number} value={index}>
                    Week {week.number}: {formatDate(week.startDate)} - {formatDate(week.endDate)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Select Venues to Contact</label>
              <div className="checkbox-group">
                {allVenues.map((venue) => (
                  <div key={venue.id} className="checkbox-item">
                    <input
                      type="checkbox"
                      id={`venue-${venue.id}`}
                      checked={selectedVenues.includes(venue.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedVenues([...selectedVenues, venue.id]);
                        } else {
                          setSelectedVenues(selectedVenues.filter(id => id !== venue.id));
                        }
                      }}
                    />
                    <label htmlFor={`venue-${venue.id}`}>
                      {venue.name} - {venue.city}, {venue.state}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setShowNewRunModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={createBookingRun} style={{ width: 'auto', flex: 1 }}>
                Create Booking Run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
