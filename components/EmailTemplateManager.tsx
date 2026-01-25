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
        alert('Template updated successfully!');
      } else {
        await createEmailTemplate(formData);
        alert('Template created successfully!');
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
    if (confirm(`Delete template "${name}"?`)) {
      try {
        await deleteEmailTemplate(id);
        loadTemplates();
        alert('Template deleted successfully!');
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

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'initial_contact':
        return '#5D4E37';
      case 'follow_up':
        return '#B7410E';
      case 'confirmation':
        return '#87AE73';
      default:
        return '#708090';
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h2 style={{ color: '#5D4E37', margin: 0 }}>Email Templates</h2>
          <p style={{ color: '#708090', margin: '0.5rem 0 0 0' }}>
            Create and manage reusable email templates for venue outreach
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
            padding: '0.75rem 1.5rem',
            background: showCreateForm ? '#708090' : '#5D4E37',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '1rem'
          }}
        >
          {showCreateForm ? 'Cancel' : '+ New Template'}
        </button>
      </div>

      {/* Create/Edit Form */}
      {showCreateForm && (
        <div style={{
          background: '#F5F5F0',
          padding: '2rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          border: '2px solid #5D4E37'
        }}>
          <h3 style={{ color: '#5D4E37', marginTop: 0 }}>
            {editingTemplate ? 'Edit Template' : 'Create New Template'}
          </h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Template Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g., Initial Contact - Arkansas Venues"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    border: '1px solid #D3D3D3'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                    Sender Email *
                  </label>
                  <select
                    value={formData.sender_email}
                    onChange={(e) => setFormData({...formData, sender_email: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '4px',
                      border: '1px solid #D3D3D3'
                    }}
                  >
                    <option value="scott@camelranchbooking.com">scott@camelranchbooking.com</option>
                    <option value="jake@camelranchbooking.com">jake@camelranchbooking.com</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                    Template Type *
                  </label>
                  <select
                    value={formData.template_type}
                    onChange={(e) => setFormData({...formData, template_type: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '4px',
                      border: '1px solid #D3D3D3'
                    }}
                  >
                    <option value="initial_contact">Initial Contact</option>
                    <option value="follow_up">Follow Up</option>
                    <option value="confirmation">Confirmation</option>
                    <option value="thank_you">Thank You</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Email Subject *
                </label>
                <input
                  type="text"
                  required
                  value={formData.subject}
                  onChange={(e) => setFormData({...formData, subject: e.target.value})}
                  placeholder="e.g., Booking Inquiry - Better Than Nothin' Band"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    border: '1px solid #D3D3D3'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#5D4E37', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Email Body *
                </label>
                <textarea
                  required
                  value={formData.body}
                  onChange={(e) => setFormData({...formData, body: e.target.value})}
                  rows={12}
                  placeholder="Hi [Venue Name],

I hope this message finds you well! My name is Scott with Better Than Nothin', a country/honky-tonk band based out of Northwest Arkansas...

Use [Venue Name], [City], [State] as placeholders"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    border: '1px solid #D3D3D3',
                    fontFamily: 'monospace',
                    fontSize: '0.95rem'
                  }}
                />
                <p style={{ color: '#708090', fontSize: '0.85rem', margin: '0.5rem 0 0 0' }}>
                  💡 Tip: Use [Venue Name], [City], [State], [Date] as placeholders that will be replaced automatically
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button
                type="submit"
                style={{
                  padding: '0.75rem 2rem',
                  background: '#5D4E37',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '1rem'
                }}
              >
                {editingTemplate ? 'Update Template' : 'Create Template'}
              </button>
              {editingTemplate && (
                <button
                  type="button"
                  onClick={resetForm}
                  style={{
                    padding: '0.75rem 2rem',
                    background: '#708090',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '1rem'
                  }}
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Templates List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#708090' }}>
          Loading templates...
        </div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#708090' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>✉️</div>
          <p>No email templates yet. Create your first template to streamline venue outreach!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {templates.map((template) => (
            <div
              key={template.id}
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                border: '2px solid #D3D3D3',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ color: '#5D4E37', margin: '0 0 0.5rem 0' }}>{template.name || 'Untitled Template'}</h3>
                  <div style={{ display: 'flex', gap: '1.5rem', color: '#708090', fontSize: '0.9rem' }}>
                    <span>📧 {template.sender_email || 'No sender'}</span>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      background: getTypeColor(template.template_type || 'general'),
                      color: 'white',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      textTransform: 'uppercase'
                    }}>
                      {template.template_type ? template.template_type.replace('_', ' ') : 'General'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleEdit(template)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#5D4E37',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(template.id, template.name || 'this template')}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#C33',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div style={{
                background: '#F5F5F0',
                padding: '1rem',
                borderRadius: '4px',
                marginTop: '1rem'
              }}>
                <p style={{ color: '#5D4E37', fontWeight: '600', margin: '0 0 0.5rem 0' }}>
                  Subject: {template.subject || 'No subject'}
                </p>
                <div style={{
                  color: '#708090',
                  fontSize: '0.9rem',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  maxHeight: '200px',
                  overflow: 'auto',
                  lineHeight: '1.6'
                }}>
                  {template.body || 'No body content'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
