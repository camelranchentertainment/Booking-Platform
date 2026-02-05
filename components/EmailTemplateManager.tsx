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

interface BandInfo {
  band_name: string;
  contact_email: string;
  contact_phone: string;
  website: string;
}

export default function EmailTemplateManager() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [band, setBand] = useState<BandInfo | null>(null);
  
  // Send Email Modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [sendForm, setSendForm] = useState({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: ''
  });
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadUserData();
      loadTemplates();
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
      default:
        return '';
    }
  };

  const handleSendClick = (template: EmailTemplate) => {
    setSelectedTemplate(template);
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
      alert('Please enter a recipient email address');
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
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 1.5rem;
        }
        @media (max-width: 767px) {
          .template-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="page-container">
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#5D4E37', margin: '0 0 0.5rem 0' }}>
              ✉️ Email Templates
            </h1>
            <p style={{ color: '#708090', margin: 0 }}>
              Professional templates ready to send • Band info auto-fills
            </p>
          </div>

          {/* Templates Grid */}
          {templates.length === 0 ? (
            <div style={{ background: 'white', padding: '4rem', borderRadius: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📝</div>
              <h3 style={{ fontSize: '1.5rem', color: '#5D4E37', margin: '0 0 0.5rem 0' }}>No templates yet</h3>
              <p style={{ color: '#708090' }}>Templates will appear here</p>
            </div>
          ) : (
            <div className="template-grid">
              {templates.map((template) => (
                <div
                  key={template.id}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  {/* Header */}
                  <div style={{ background: '#5D4E37', color: 'white', padding: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0 }}>
                      {template.name}
                    </h3>
                  </div>

                  {/* Content */}
                  <div style={{ padding: '1.5rem', flex: 1 }}>
                    <div style={{ 
                      background: '#F5F5F0', 
                      padding: '1rem', 
                      borderRadius: '8px', 
                      marginBottom: '1rem' 
                    }}>
                      <div style={{ fontSize: '0.75rem', color: '#708090', fontWeight: '600', marginBottom: '0.5rem' }}>
                        SUBJECT
                      </div>
                      <div style={{ color: '#5D4E37', fontWeight: '600' }}>
                        {template.subject}
                      </div>
                    </div>

                    <div style={{ 
                      fontSize: '0.9rem', 
                      color: '#708090', 
                      lineHeight: '1.6', 
                      maxHeight: '120px', 
                      overflow: 'hidden' 
                    }}>
                      {template.body.substring(0, 200)}...
                    </div>

                    {template.variables && template.variables.length > 0 && (
                      <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #E8E6E1' }}>
                        <div style={{ fontSize: '0.75rem', color: '#87AE73', marginBottom: '0.5rem', fontWeight: '600' }}>
                          ✓ Auto-fills: Your Name, Band Name, Phone, Email, Website
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#708090', marginTop: '0.25rem' }}>
                          Manual: {template.variables.filter(v => !['Your Name', 'Band Name', 'Phone Number', 'Email', 'Website'].includes(v)).length} fields
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #E8E6E1' }}>
                    <button
                      onClick={() => handleSendClick(template)}
                      style={{
                        width: '100%',
                        padding: '0.875rem',
                        background: 'linear-gradient(135deg, #87AE73 0%, #6B8E5C 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '700',
                        fontSize: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <span>📧</span>
                      <span>Send Email</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
                maxWidth: '800px',
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
                  📧 Send: {selectedTemplate.name}
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
                {/* Variables Section */}
                {selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                  <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#F5F5F0', borderRadius: '8px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#5D4E37', marginBottom: '0.5rem' }}>
                      Fill in Template Variables
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: '#87AE73', margin: '0 0 1rem 0' }}>
                      ✓ Band info auto-filled from your profile
                    </p>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                      {selectedTemplate.variables.map((variable) => {
                        const isAutoFilled = ['Your Name', 'Band Name', 'Phone Number', 'Email', 'Website'].includes(variable);
                        return (
                          <div key={variable}>
                            <label style={{ 
                              display: 'block', 
                              color: '#5D4E37', 
                              marginBottom: '0.5rem', 
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              {variable}
                              {isAutoFilled && (
                                <span style={{ 
                                  fontSize: '0.75rem', 
                                  color: '#87AE73', 
                                  background: 'rgba(135, 174, 115, 0.2)',
                                  padding: '0.125rem 0.5rem',
                                  borderRadius: '4px'
                                }}>
                                  auto-filled
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
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: '6px',
                        border: '2px solid #E8E6E1',
                        fontSize: '1rem'
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
