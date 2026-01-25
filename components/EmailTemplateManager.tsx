'use client';

import { useState, useEffect } from 'react';
import { getEmailTemplates, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate } from '../lib/supabase';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  sender_email: string;
  template_type: string;
  created_at: string;
}

export default function EmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    body: '',
    sender_email: 'scott@camelranchbooking.com',
    template_type: 'initial_contact'
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await getEmailTemplates();
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTemplate) {
        await updateEmailTemplate(editingTemplate.id, formData);
        alert('✅ Template updated!');
      } else {
        await createEmailTemplate(formData);
        alert('✅ Template created!');
      }
      
      resetForm();
      loadTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Error saving template');
    }
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name || '',
      subject: template.subject || '',
      body: template.body || '',
      sender_email: template.sender_email || 'scott@camelranchbooking.com',
      template_type: template.template_type || 'initial_contact'
    });
    setShowCreateForm(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete "${name}"?`)) {
      try {
        await deleteEmailTemplate(id);
        loadTemplates();
        alert('✅ Template deleted!');
      } catch (error) {
        console.error('Error deleting template:', error);
        alert('Error deleting template');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      subject: '',
      body: '',
      sender_email: 'scott@camelranchbooking.com',
      template_type: 'initial_contact'
    });
    setShowCreateForm(false);
    setEditingTemplate(null);
  };

  const getTypeInfo = (type: string) => {
    switch (type) {
      case 'initial_contact':
        return { color: '#5D4E37', icon: '👋', label: 'Initial Contact' };
      case 'follow_up':
        return { color: '#B7410E', icon: '🔔', label: 'Follow Up' };
      case 'confirmation':
        return { color: '#87AE73', icon: '✅', label: 'Confirmation' };
      case 'thank_you':
        return { color: '#6B8E5C', icon: '🙏', label: 'Thank You' };
      default:
        return { color: '#708090', icon: '📧', label: 'General' };
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #F5F5F0 0%, #E8E6E1 100%)',
      minHeight: '100vh',
      padding: '2rem'
    }}>
      {/* Modern Header */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        marginBottom: '2.5rem'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div>
            <h1 style={{
              fontSize: '2.2rem',
              fontWeight: '700',
              color: '#5D4E37',
              margin: 0,
              marginBottom: '0.5rem'
            }}>
              ✉️ Email Templates
            </h1>
            <p style={{
              fontSize: '1.05rem',
              color: '#708090',
              margin: 0
            }}>
              Save time with reusable email templates for venue outreach
            </p>
          </div>
          
          <button
            onClick={() => {
              if (showCreateForm) {
                resetForm();
              } else {
                setShowCreateForm(true);
              }
            }}
            style={{
              padding: '1rem 2rem',
              background: showCreateForm ? '#708090' : 'linear-gradient(135deg, #5D4E37 0%, #8B7355 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '1.05rem',
              boxShadow: '0 4px 12px rgba(93, 78, 55, 0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            {showCreateForm ? '✕ Cancel' : '+ New Template'}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Modern Create/Edit Form */}
        {showCreateForm && (
          <div style={{
            background: 'white',
            padding: '2.5rem',
            borderRadius: '16px',
            marginBottom: '2.5rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            border: '1px solid rgba(93, 78, 55, 0.1)'
          }}>
            <h2 style={{
              fontSize: '1.6rem',
              fontWeight: '700',
              color: '#5D4E37',
              margin: '0 0 1.5rem 0'
            }}>
              {editingTemplate ? '✏️ Edit Template' : '✨ Create New Template'}
            </h2>
            
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                {/* Template Name */}
                <div>
                  <label style={{
                    display: 'block',
                    color: '#5D4E37',
                    marginBottom: '0.5rem',
                    fontWeight: '600',
                    fontSize: '0.95rem'
                  }}>
                    Template Name
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g., Texas Venues - Initial Outreach"
                    style={{
                      width: '100%',
                      padding: '0.875rem',
                      borderRadius: '8px',
                      border: '2px solid #E8E6E1',
                      fontSize: '1rem',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#5D4E37'}
                    onBlur={(e) => e.target.style.borderColor = '#E8E6E1'}
                  />
                </div>

                {/* Sender & Type Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      color: '#5D4E37',
                      marginBottom: '0.5rem',
                      fontWeight: '600',
                      fontSize: '0.95rem'
                    }}>
                      From
                    </label>
                    <select
                      value={formData.sender_email}
                      onChange={(e) => setFormData({...formData, sender_email: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '0.875rem',
                        borderRadius: '8px',
                        border: '2px solid #E8E6E1',
                        fontSize: '1rem',
                        outline: 'none',
                        cursor: 'pointer',
                        background: 'white'
                      }}
                    >
                      <option value="scott@camelranchbooking.com">📧 Scott</option>
                      <option value="jake@camelranchbooking.com">📧 Jake</option>
                    </select>
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      color: '#5D4E37',
                      marginBottom: '0.5rem',
                      fontWeight: '600',
                      fontSize: '0.95rem'
                    }}>
                      Type
                    </label>
                    <select
                      value={formData.template_type}
                      onChange={(e) => setFormData({...formData, template_type: e.target.value})}
                      style={{
                        width: '100%',
                        padding: '0.875rem',
                        borderRadius: '8px',
                        border: '2px solid #E8E6E1',
                        fontSize: '1rem',
                        outline: 'none',
                        cursor: 'pointer',
                        background: 'white'
                      }}
                    >
                      <option value="initial_contact">👋 Initial Contact</option>
                      <option value="follow_up">🔔 Follow Up</option>
                      <option value="confirmation">✅ Confirmation</option>
                      <option value="thank_you">🙏 Thank You</option>
                    </select>
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label style={{
                    display: 'block',
                    color: '#5D4E37',
                    marginBottom: '0.5rem',
                    fontWeight: '600',
                    fontSize: '0.95rem'
                  }}>
                    Subject Line
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.subject}
                    onChange={(e) => setFormData({...formData, subject: e.target.value})}
                    placeholder="Booking Inquiry - Better Than Nothin' Band"
                    style={{
                      width: '100%',
                      padding: '0.875rem',
                      borderRadius: '8px',
                      border: '2px solid #E8E6E1',
                      fontSize: '1rem',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#5D4E37'}
                    onBlur={(e) => e.target.style.borderColor = '#E8E6E1'}
                  />
                </div>

                {/* Body */}
                <div>
                  <label style={{
                    display: 'block',
                    color: '#5D4E37',
                    marginBottom: '0.5rem',
                    fontWeight: '600',
                    fontSize: '0.95rem'
                  }}>
                    Message
                  </label>
                  <textarea
                    required
                    value={formData.body}
                    onChange={(e) => setFormData({...formData, body: e.target.value})}
                    rows={10}
                    placeholder="Hi [Venue Name],&#10;&#10;Hope you're doing well! I'm reaching out from Better Than Nothin', a country/honky-tonk band...&#10;&#10;Tip: Use [Venue Name], [City], [State] as placeholders"
                    style={{
                      width: '100%',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '2px solid #E8E6E1',
                      fontSize: '1rem',
                      lineHeight: '1.6',
                      outline: 'none',
                      resize: 'vertical',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#5D4E37'}
                    onBlur={(e) => e.target.style.borderColor = '#E8E6E1'}
                  />
                  <div style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    background: '#F5F5F0',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    color: '#708090'
                  }}>
                    💡 <strong>Pro Tip:</strong> Use placeholders like <code style={{ background: 'white', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>[Venue Name]</code>, <code style={{ background: 'white', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>[City]</code>, <code style={{ background: 'white', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>[State]</code> - they'll be replaced automatically!
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '1rem',
                    background: 'linear-gradient(135deg, #87AE73 0%, #6B8E5C 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '700',
                    fontSize: '1.05rem',
                    boxShadow: '0 4px 12px rgba(135, 174, 115, 0.3)',
                    transition: 'transform 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  {editingTemplate ? '💾 Update Template' : '✨ Create Template'}
                </button>
                
                {editingTemplate && (
                  <button
                    type="button"
                    onClick={resetForm}
                    style={{
                      padding: '1rem 2rem',
                      background: '#E8E6E1',
                      color: '#708090',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '1.05rem'
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Templates Grid */}
        {loading ? (
          <div style={{
            textAlign: 'center',
            padding: '4rem',
            color: '#708090'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
            <p style={{ fontSize: '1.1rem' }}>Loading templates...</p>
          </div>
        ) : templates.length === 0 ? (
          <div style={{
            background: 'white',
            padding: '4rem',
            borderRadius: '16px',
            textAlign: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📝</div>
            <h3 style={{ fontSize: '1.5rem', color: '#5D4E37', margin: '0 0 0.5rem 0' }}>
              No templates yet
            </h3>
            <p style={{ color: '#708090', fontSize: '1.05rem', margin: 0 }}>
              Create your first template to streamline venue outreach!
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
            gap: '1.5rem'
          }}>
            {templates.map((template) => {
              const typeInfo = getTypeInfo(template.template_type || 'general');
              return (
                <div
                  key={template.id}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    transition: 'all 0.3s ease',
                    border: '2px solid transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
                    e.currentTarget.style.borderColor = typeInfo.color;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                    e.currentTarget.style.borderColor = 'transparent';
                  }}
                >
                  {/* Card Header */}
                  <div style={{
                    background: typeInfo.color,
                    color: 'white',
                    padding: '1.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>{typeInfo.icon}</span>
                      <div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.9, fontWeight: '500' }}>
                          {typeInfo.label}
                        </div>
                        <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                          {template.sender_email?.split('@')[0] || 'Unknown'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div style={{ padding: '1.5rem' }}>
                    <h3 style={{
                      fontSize: '1.2rem',
                      fontWeight: '700',
                      color: '#5D4E37',
                      margin: '0 0 1rem 0',
                      lineHeight: '1.3'
                    }}>
                      {template.name || 'Untitled Template'}
                    </h3>

                    <div style={{
                      background: '#F5F5F0',
                      padding: '1rem',
                      borderRadius: '8px',
                      marginBottom: '1rem'
                    }}>
                      <div style={{
                        fontSize: '0.8rem',
                        color: '#708090',
                        fontWeight: '600',
                        marginBottom: '0.5rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Subject
                      </div>
                      <div style={{
                        color: '#5D4E37',
                        fontWeight: '600',
                        fontSize: '0.95rem'
                      }}>
                        {template.subject || 'No subject'}
                      </div>
                    </div>

                    <div style={{
                      fontSize: '0.9rem',
                      color: '#708090',
                      lineHeight: '1.6',
                      maxHeight: '100px',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      {template.body || 'No content'}
                      <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: '40px',
                        background: 'linear-gradient(transparent, white)'
                      }}></div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div style={{
                    padding: '1rem 1.5rem',
                    borderTop: '1px solid #E8E6E1',
                    display: 'flex',
                    gap: '0.75rem'
                  }}>
                    <button
                      onClick={() => handleEdit(template)}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        background: typeInfo.color,
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '0.9rem',
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDelete(template.id, template.name || 'this template')}
                      style={{
                        padding: '0.75rem 1rem',
                        background: '#FEE',
                        color: '#C33',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '0.9rem',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#FDD'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#FEE'}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
