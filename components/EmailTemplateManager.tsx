'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  created_at: string;
  user_id: string;
}

interface Venue {
  id: string;
  name: string;
  email: string;
  city: string;
  state: string;
  address: string;
  phone: string;
}

interface BandInfo {
  band_name: string;
  contact_email: string;
  contact_phone: string;
  website: string;
}

export default function EmailTemplateManager() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [band, setBand] = useState<BandInfo | null>(null);
  
  // Send Email Modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [venueSearchQuery, setVenueSearchQuery] = useState('');
  const [showVenueDropdown, setShowVenueDropdown] = useState(false);
  const [sendForm, setSendForm] = useState({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: ''
  });
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  // Fixed template list
  const TEMPLATE_TILES = [
    { 
      id: 'initial', 
      name: 'Initial Venue Inquiry', 
      icon: '👋',
      color: '#5D4E37'
    },
    { 
      id: 'followup', 
      name: 'Follow Up on Booking Inquiry', 
      icon: '🔔',
      color: '#B7410E'
    },
    { 
      id: 'confirmation', 
      name: 'Booking Confirmation', 
      icon: '✅',
      color: '#87AE73'
    },
    { 
      id: 'thankyou', 
      name: 'Post-Show Thank You', 
      icon: '🙏',
      color: '#6B8E5C'
    }
  ];

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadUserData();
      loadTemplates();
      loadVenues();
    }
  }, [user]);

  const checkAuth = async () => {
    try {
      const loggedInUser = localStorage.getItem('loggedInUser');
      if (loggedInUser) {
        setUser(JSON.parse(loggedInUser));
      }
    } catch (error) {
      console.error('Auth error:', error);
    }
  };

  const loadUserData = async () => {
    if (!user) return;
    
    try {
      // Load profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();
      
      setProfile(profileData);

      // Load band info
      const { data: memberData } = await supabase
        .from('band_members')
        .select('band_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (memberData) {
        const { data: bandData } = await supabase
          .from('bands')
          .select('band_name, contact_email, contact_phone, website')
          .eq('id', memberData.band_id)
          .maybeSingle();
        
        setBand(bandData);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const loadTemplates = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadVenues = async () => {
    try {
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, email, city, state, address, phone')
        .order('name');

      if (error) throw error;
      setVenues(data || []);
    } catch (error) {
      console.error('Error loading venues:', error);
    }
  };

  const getTemplateByType = (tileId: string): EmailTemplate | null => {
    // Map tile IDs to template names
    const nameMap: Record<string, string> = {
      'initial': 'Initial Venue Inquiry',
      'followup': 'Follow Up on Booking Inquiry',
      'confirmation': 'Booking Confirmation',
      'thankyou': 'Post-Show Thank You'
    };
    
    const templateName = nameMap[tileId];
    return templates.find(t => t.name === templateName) || null;
  };

  const getAutoFillValue = (variable: string): string => {
    // Auto-fill from band/profile data
    switch (variable) {
      case 'Your Name':
        return profile?.display_name || '';
      case 'Band Name':
        return band?.band_name || '';
      case 'Phone Number':
        return band?.contact_phone || '';
      case 'Email':
        return band?.contact_email || user?.email || '';
      case 'Website':
        return band?.website || '';
      // Venue-specific (will be filled when venue selected)
      case 'Venue Name':
        return selectedVenue?.name || '';
      case 'Venue Address':
        return selectedVenue?.address || '';
      case 'City':
        return selectedVenue?.city || '';
      case 'State':
        return selectedVenue?.state || '';
      default:
        return '';
    }
  };

  const handleTileClick = (tileId: string) => {
    const template = getTemplateByType(tileId);
    
    if (!template) {
      alert('Template not found in database. Please ensure templates are created.');
      return;
    }

    setSelectedTemplate(template);
    setSelectedVenue(null); // Reset venue selection
    setVenueSearchQuery(''); // Reset search query
    setShowVenueDropdown(false);
    setSendForm({
      to: '',
      cc: '',
      bcc: '',
      subject: template.subject,
      body: template.body
    });
    
    // Initialize variable values with AUTO-FILL
    const initialValues: Record<string, string> = {};
    (template.variables || []).forEach(v => {
      initialValues[v] = getAutoFillValue(v);
    });
    setVariableValues(initialValues);
    
    setShowSendModal(true);
  };

  const handleVenueSelect = (venueId: string) => {
    const venue = venues.find(v => v.id === venueId);
    setSelectedVenue(venue || null);
    
    if (venue) {
      // Update recipient email
      setSendForm(prev => ({
        ...prev,
        to: venue.email || ''
      }));
      
      // Update venue-related variables
      setVariableValues(prev => ({
        ...prev,
        'Venue Name': venue.name || '',
        'Venue Address': venue.address || '',
        'City': venue.city || '',
        'State': venue.state || ''
      }));
    }
  };

  // Filter venues based on search query
  const filteredVenues = venues.filter(venue => {
    const searchLower = venueSearchQuery.toLowerCase();
    return (
      venue.name.toLowerCase().includes(searchLower) ||
      venue.city.toLowerCase().includes(searchLower) ||
      venue.state.toLowerCase().includes(searchLower)
    );
  });

  const replaceVariables = (text: string, values: Record<string, string>) => {
    let result = text;
    Object.keys(values).forEach(key => {
      const regex = new RegExp(`\\[${key}\\]`, 'g');
      result = result.replace(regex, values[key] || `[${key}]`);
    });
    return result;
  };

  const updateEmailPreview = () => {
    if (!selectedTemplate) return;
    
    const updatedSubject = replaceVariables(selectedTemplate.subject, variableValues);
    const updatedBody = replaceVariables(selectedTemplate.body, variableValues);
    
    setSendForm(prev => ({
      ...prev,
      subject: updatedSubject,
      body: updatedBody
    }));
  };

  useEffect(() => {
    if (selectedTemplate) {
      updateEmailPreview();
    }
  }, [variableValues]);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      alert('Please log in to send emails');
      return;
    }

    if (!sendForm.to) {
      alert('Please select a venue or enter a recipient email address');
      return;
    }

    setSending(true);

    try {
      const response = await fetch('/api/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          to: sendForm.to,
          cc: sendForm.cc || undefined,
          bcc: sendForm.bcc || undefined,
          subject: sendForm.subject,
          body: sendForm.body
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email');
      }

      alert('✅ Email sent successfully!');
      setShowSendModal(false);
      setSelectedTemplate(null);
      setSelectedVenue(null);
      
    } catch (error: any) {
      console.error('Send email error:', error);
      alert(`Failed to send email: ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: '#708090' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
        <p>Loading templates...</p>
      </div>
    );
  }

  return (
    <>
      <style jsx>{`
        * { box-sizing: border-box; }
        .page-container {
          background: linear-gradient(135deg, #F5F5F0 0%, #E8E6E1 100%);
          min-height: 100vh;
          padding: 1rem;
        }
        .template-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.5rem;
        }
        .tile {
          background: white;
          border-radius: 16px;
          padding: 2.5rem 2rem;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }
        .tile:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        }
        @media (max-width: 767px) {
          .template-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="page-container">
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#5D4E37', margin: '0 0 0.5rem 0' }}>
              ✉️ Email Templates
            </h1>
            <p style={{ color: '#708090', margin: 0 }}>
              Select a template to send a professional booking inquiry
            </p>
          </div>

          {/* Template Tiles */}
          <div className="template-grid">
            {TEMPLATE_TILES.map((tile) => (
              <div
                key={tile.id}
                className="tile"
                onClick={() => handleTileClick(tile.id)}
                style={{
                  borderTop: `6px solid ${tile.color}`
                }}
              >
                <div style={{ 
                  fontSize: '3.5rem', 
                  marginBottom: '1rem',
                  lineHeight: 1
                }}>
                  {tile.icon}
                </div>
                <h3 style={{ 
                  fontSize: '1.3rem', 
                  fontWeight: '700', 
                  color: '#5D4E37',
                  margin: '0 0 0.75rem 0',
                  lineHeight: '1.3'
                }}>
                  {tile.name}
                </h3>
                <div style={{
                  display: 'inline-block',
                  padding: '0.5rem 1.5rem',
                  background: tile.color,
                  color: 'white',
                  borderRadius: '24px',
                  fontSize: '0.9rem',
                  fontWeight: '600'
                }}>
                  Click to Edit
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Send Email Modal */}
        {showSendModal && selectedTemplate && (
          <div
            onClick={() => setShowSendModal(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '1rem',
              overflow: 'auto'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'white',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '900px',
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
              }}
            >
              {/* Modal Header */}
              <div style={{
                padding: '1.5rem 2rem',
                borderBottom: '2px solid #E8E6E1',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                position: 'sticky',
                top: 0,
                background: 'white',
                zIndex: 1
              }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#5D4E37', margin: 0 }}>
                  📧 {selectedTemplate.name}
                </h2>
                <button
                  onClick={() => setShowSendModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    color: '#708090'
                  }}
                >
                  ×
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSendEmail} style={{ padding: '2rem' }}>
                {/* Venue Selection - Searchable Input */}
                <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#F5F5F0', borderRadius: '12px' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#5D4E37', marginBottom: '1rem' }}>
                    Select Venue
                  </h3>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={venueSearchQuery}
                      onChange={(e) => setVenueSearchQuery(e.target.value)}
                      onFocus={() => setShowVenueDropdown(true)}
                      placeholder="Type to search venues..."
                      style={{
                        width: '100%',
                        padding: '0.875rem',
                        borderRadius: '8px',
                        border: selectedVenue ? '2px solid #87AE73' : '2px solid #5D4E37',
                        fontSize: '1rem',
                        background: 'white'
                      }}
                    />
                    
                    {/* Dropdown Results */}
                    {showVenueDropdown && venueSearchQuery && filteredVenues.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '2px solid #5D4E37',
                        borderTop: 'none',
                        borderRadius: '0 0 8px 8px',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        zIndex: 10,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                      }}>
                        {filteredVenues.slice(0, 10).map(venue => (
                          <div
                            key={venue.id}
                            onClick={() => {
                              handleVenueSelect(venue.id);
                              setVenueSearchQuery(`${venue.name} - ${venue.city}, ${venue.state}`);
                              setShowVenueDropdown(false);
                            }}
                            style={{
                              padding: '0.875rem',
                              cursor: 'pointer',
                              borderBottom: '1px solid #E8E6E1',
                              transition: 'background 0.15s ease'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F0'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                          >
                            <div style={{ fontWeight: '600', color: '#5D4E37', marginBottom: '0.25rem' }}>
                              {venue.name}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#708090' }}>
                              📍 {venue.city}, {venue.state}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* No results message */}
                    {showVenueDropdown && venueSearchQuery && filteredVenues.length === 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '2px solid #5D4E37',
                        borderTop: 'none',
                        borderRadius: '0 0 8px 8px',
                        padding: '1rem',
                        color: '#708090',
                        fontSize: '0.9rem',
                        zIndex: 10
                      }}>
                        No venues found matching "{venueSearchQuery}"
                      </div>
                    )}
                  </div>
                  
                  {selectedVenue && (
                    <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(135, 174, 115, 0.1)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.9rem', color: '#87AE73', fontWeight: '600', marginBottom: '0.5rem' }}>
                        ✓ Venue selected - Email will be sent to:
                      </div>
                      <div style={{ fontSize: '0.95rem', color: '#5D4E37', fontWeight: '600' }}>
                        {selectedVenue.email || 'No email on file'}
                      </div>
                      {selectedVenue.phone && (
                        <div style={{ fontSize: '0.85rem', color: '#708090', marginTop: '0.25rem' }}>
                          📞 {selectedVenue.phone}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Variables Section */}
                {selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                  <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#F5F5F0', borderRadius: '12px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#5D4E37', marginBottom: '0.5rem' }}>
                      Email Details
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: '#87AE73', margin: '0 0 1.5rem 0' }}>
                      ✓ Band info auto-filled • Venue info from database
                    </p>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                      {selectedTemplate.variables.map((variable) => {
                        const isAutoFilled = ['Your Name', 'Band Name', 'Phone Number', 'Email', 'Website', 'Venue Name', 'Venue Address', 'City', 'State'].includes(variable);
                        const isVenueField = ['Venue Name', 'Venue Address', 'City', 'State'].includes(variable);
                        
                        return (
                          <div key={variable}>
                            <label style={{ 
                              display: 'flex', 
                              color: '#5D4E37', 
                              marginBottom: '0.5rem', 
                              fontWeight: '600',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              {variable}
                              {isAutoFilled && (
                                <span style={{ 
                                  fontSize: '0.75rem', 
                                  color: isVenueField ? '#5D9CEC' : '#87AE73',
                                  background: isVenueField ? 'rgba(93, 156, 236, 0.2)' : 'rgba(135, 174, 115, 0.2)',
                                  padding: '0.125rem 0.5rem',
                                  borderRadius: '4px'
                                }}>
                                  {isVenueField ? 'from venue' : 'auto-filled'}
                                </span>
                              )}
                            </label>
                            <input
                              type="text"
                              value={variableValues[variable] || ''}
                              onChange={(e) => setVariableValues({
                                ...variableValues,
                                [variable]: e.target.value
                              })}
                              placeholder={`Enter ${variable}`}
                              style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '6px',
                                border: isAutoFilled ? '2px solid #87AE73' : '2px solid #E8E6E1',
                                background: isAutoFilled ? 'rgba(135, 174, 115, 0.05)' : 'white',
                                fontSize: '1rem'
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Email Fields */}
                <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                      To <span style={{color: '#C33'}}>*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={sendForm.to}
                      onChange={(e) => setSendForm({...sendForm, to: e.target.value})}
                      placeholder="venue@example.com"
                      disabled={!!selectedVenue}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '6px',
                        border: '2px solid #E8E6E1',
                        fontSize: '1rem',
                        background: selectedVenue ? '#F5F5F0' : 'white',
                        cursor: selectedVenue ? 'not-allowed' : 'text'
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                        CC
                      </label>
                      <input
                        type="email"
                        value={sendForm.cc}
                        onChange={(e) => setSendForm({...sendForm, cc: e.target.value})}
                        placeholder="Optional"
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          borderRadius: '6px',
                          border: '2px solid #E8E6E1',
                          fontSize: '1rem'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                        BCC
                      </label>
                      <input
                        type="email"
                        value={sendForm.bcc}
                        onChange={(e) => setSendForm({...sendForm, bcc: e.target.value})}
                        placeholder="Optional"
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          borderRadius: '6px',
                          border: '2px solid #E8E6E1',
                          fontSize: '1rem'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                      Subject
                    </label>
                    <input
                      type="text"
                      required
                      value={sendForm.subject}
                      onChange={(e) => setSendForm({...sendForm, subject: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '6px',
                        border: '2px solid #E8E6E1',
                        fontSize: '1rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                      Message
                    </label>
                    <textarea
                      required
                      value={sendForm.body}
                      onChange={(e) => setSendForm({...sendForm, body: e.target.value})}
                      rows={14}
                      style={{
                        width: '100%',
                        padding: '1rem',
                        borderRadius: '6px',
                        border: '2px solid #E8E6E1',
                        fontSize: '1rem',
                        lineHeight: '1.6',
                        resize: 'vertical',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowSendModal(false)}
                    disabled={sending}
                    style={{
                      padding: '0.875rem 2rem',
                      background: '#E8E6E1',
                      color: '#708090',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: sending ? 'not-allowed' : 'pointer',
                      fontWeight: '600',
                      fontSize: '1rem'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sending}
                    style={{
                      padding: '0.875rem 2rem',
                      background: sending ? '#708090' : 'linear-gradient(135deg, #87AE73 0%, #6B8E5C 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: sending ? 'not-allowed' : 'pointer',
                      fontWeight: '700',
                      fontSize: '1rem'
                    }}
                  >
                    {sending ? '📤 Sending...' : '📧 Send Email'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
