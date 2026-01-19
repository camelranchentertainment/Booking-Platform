'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  from_email: 'scott@camelranchbooking.com' | 'jake@camelranchbooking.com';
  is_default: boolean;
  created_at: string;
}

export default function EmailTemplateManager() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isNewTemplate, setIsNewTemplate] = useState(false);
  const [editedTemplate, setEditedTemplate] = useState<Partial<EmailTemplate>>({
    name: '',
    subject: '',
    body: '',
    from_email: 'scott@camelranchbooking.com',
    is_default: false
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  const createTemplate = async () => {
    try {
      const { error } = await supabase
        .from('email_templates')
        .insert([editedTemplate]);

      if (error) throw error;

      alert('✅ Template created successfully!');
      setIsNewTemplate(false);
      setEditedTemplate({
        name: '',
        subject: '',
        body: '',
        from_email: 'scott@camelranchbooking.com',
        is_default: false
      });
      loadTemplates();
    } catch (error) {
      console.error('Error creating template:', error);
      alert('Error creating template');
    }
  };

  const updateTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      const { error } = await supabase
        .from('email_templates')
        .update({
          name: editedTemplate.name,
          subject: editedTemplate.subject,
          body: editedTemplate.body,
          from_email: editedTemplate.from_email,
          is_default: editedTemplate.is_default
        })
        .eq('id', selectedTemplate.id);

      if (error) throw error;

      alert('✅ Template updated successfully!');
      setIsEditMode(false);
      setSelectedTemplate(null);
      loadTemplates();
    } catch (error) {
      console.error('Error updating template:', error);
      alert('Error updating template');
    }
  };

  const deleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;

      alert('✅ Template deleted successfully!');
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Error deleting template');
    }
  };

  const startNewTemplate = () => {
    setIsNewTemplate(true);
    setIsEditMode(false);
    setSelectedTemplate(null);
    setEditedTemplate({
      name: '',
      subject: '',
      body: '',
      from_email: 'scott@camelranchbooking.com',
      is_default: false
    });
  };

  const startEditTemplate = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setEditedTemplate(template);
    setIsEditMode(true);
    setIsNewTemplate(false);
  };

  const cancelEdit = () => {
    setIsEditMode(false);
    setIsNewTemplate(false);
    setSelectedTemplate(null);
    setEditedTemplate({
      name: '',
      subject: '',
      body: '',
      from_email: 'scott@camelranchbooking.com',
      is_default: false
    });
  };

  // Default template suggestions
  const insertDefaultTemplate = (type: 'initial' | 'followup') => {
    if (type === 'initial') {
      setEditedTemplate({
        ...editedTemplate,
        name: 'Initial Booking Request',
        subject: 'Booking Inquiry - Better Than Nothin\' Band',
        body: `Hi there,

My name is [Your Name] and I'm the booking manager for Better Than Nothin', an Ozark Country/Red Dirt/Honky Tonk band based out of Northwest Arkansas.

We're currently booking dates for [Month/Year] and would love to perform at [Venue Name]. We play high-energy country music that keeps the dance floor packed and the crowd engaged.

Our band features:
- Original songs and crowd-favorite covers
- Professional sound and lighting
- Experienced performers who know how to read a room

Would you have availability for a show on [Date Range]? We're flexible on dates and would love to discuss what works best for your venue.

You can check us out at: www.betterthannothin.com

Looking forward to hearing from you!

Best regards,
[Your Name]
Better Than Nothin'
[Phone Number]`
      });
    } else {
      setEditedTemplate({
        ...editedTemplate,
        name: 'Follow-up Email',
        subject: 'Following Up - Better Than Nothin\' Booking',
        body: `Hi there,

I wanted to follow up on my previous email about booking Better Than Nothin' at [Venue Name].

We're still very interested in performing at your venue and have some upcoming dates available. Our band has been getting great feedback from venues in the area, and we think your crowd would really enjoy our high-energy country music.

Would you have a few minutes to discuss potential dates? I'm happy to work with your schedule.

Thanks for your time!

Best regards,
[Your Name]
Better Than Nothin'
[Phone Number]`
      });
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <style jsx>{`
        .template-container {
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
        
        .header p {
          color: #9B8A7A;
          margin: 0.5rem 0 0 0;
        }
        
        .btn-new {
          background: #6B8E23;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 700;
          transition: all 0.3s ease;
        }
        
        .btn-new:hover {
          background: #5a7a1f;
          transform: translateY(-2px);
        }
        
        .templates-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }
        
        .template-card {
          background: linear-gradient(135deg, rgba(61, 40, 23, 0.9), rgba(74, 50, 32, 0.9));
          border: 2px solid #5C4A3A;
          border-radius: 12px;
          padding: 25px;
          transition: all 0.3s ease;
          cursor: pointer;
        }
        
        .template-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 25px rgba(0,0,0,0.4);
          border-color: #C8A882;
        }
        
        .template-card.default {
          border-color: #6B8E23;
          border-width: 3px;
        }
        
        .template-name {
          color: #C8A882;
          font-size: 1.3rem;
          font-weight: 700;
          margin-bottom: 10px;
        }
        
        .template-from {
          color: #9B8A7A;
          font-size: 0.9rem;
          margin-bottom: 15px;
        }
        
        .template-subject {
          color: #E8DCC4;
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 10px;
        }
        
        .template-preview {
          color: #9B8A7A;
          font-size: 0.85rem;
          line-height: 1.5;
          max-height: 80px;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 15px;
        }
        
        .template-actions {
          display: flex;
          gap: 10px;
        }
        
        .btn-edit {
          flex: 1;
          background: #8B7355;
          color: white;
          border: none;
          padding: 10px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
        }
        
        .btn-delete {
          background: #C84630;
          color: white;
          border: none;
          padding: 10px 15px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
        }
        
        .form-container {
          background: linear-gradient(135deg, rgba(61, 40, 23, 0.9), rgba(74, 50, 32, 0.9));
          border: 3px solid #8B6F47;
          border-radius: 12px;
          padding: 30px;
          max-width: 900px;
          margin: 0 auto;
        }
        
        .form-title {
          color: #C8A882;
          font-size: 1.8rem;
          margin-bottom: 25px;
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
        
        .form-input, .form-select, .form-textarea {
          width: 100%;
          padding: 12px 20px;
          background: rgba(44, 24, 16, 0.5);
          border: 2px solid #5C4A3A;
          border-radius: 8px;
          color: #E8DCC4;
          font-size: 1rem;
          font-family: inherit;
        }
        
        .form-textarea {
          min-height: 300px;
          resize: vertical;
          font-family: 'Courier New', monospace;
          line-height: 1.6;
        }
        
        .form-input:focus, .form-select:focus, .form-textarea:focus {
          outline: none;
          border-color: #C8A882;
        }
        
        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #E8DCC4;
          cursor: pointer;
        }
        
        .checkbox-label input {
          width: 20px;
          height: 20px;
          cursor: pointer;
        }
        
        .btn-group {
          display: flex;
          gap: 10px;
          margin-top: 30px;
        }
        
        .btn-cancel {
          flex: 1;
          background: #A8A8A8;
          color: #36454F;
          border: none;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
        }
        
        .btn-save {
          flex: 2;
          background: #6B8E23;
          color: white;
          border: none;
          padding: 12px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 700;
          font-size: 1.1rem;
        }
        
        .template-helpers {
          background: rgba(139, 111, 71, 0.2);
          border: 2px solid #8B6F47;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
        }
        
        .helper-title {
          color: #C8A882;
          font-weight: 600;
          margin-bottom: 10px;
        }
        
        .helper-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        
        .btn-helper {
          background: rgba(200, 168, 130, 0.2);
          color: #C8A882;
          border: 2px solid #C8A882;
          padding: 8px 15px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.9rem;
        }
        
        .empty-state {
          background: rgba(61, 40, 23, 0.5);
          padding: 4rem;
          text-align: center;
          color: #9B8A7A;
          border-radius: 12px;
          border: 2px dashed #5C4A3A;
        }
      `}</style>

      <div className="template-container">
        {!isNewTemplate && !isEditMode ? (
          <>
            <div className="header">
              <div>
                <h2>📧 Email Template Management</h2>
                <p>Create and manage booking email templates</p>
              </div>
              <button className="btn-new" onClick={startNewTemplate}>
                + New Template
              </button>
            </div>

            {templates.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📧</div>
                <p style={{ fontSize: '1.1rem', fontWeight: '600', color: '#C8A882', marginBottom: '1rem' }}>
                  No email templates yet
                </p>
                <p>Create your first template to streamline venue outreach!</p>
              </div>
            ) : (
              <div className="templates-grid">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`template-card ${template.is_default ? 'default' : ''}`}
                  >
                    {template.is_default && (
                      <div style={{
                        background: '#6B8E23',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        display: 'inline-block',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        marginBottom: '10px',
                        textTransform: 'uppercase',
                        letterSpacing: '1px'
                      }}>
                        ⭐ Default
                      </div>
                    )}
                    <div className="template-name">{template.name}</div>
                    <div className="template-from">From: {template.from_email}</div>
                    <div className="template-subject">Subject: {template.subject}</div>
                    <div className="template-preview">{template.body}</div>
                    <div className="template-actions">
                      <button
                        className="btn-edit"
                        onClick={() => startEditTemplate(template)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="btn-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTemplate(template.id);
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="form-container">
            <h3 className="form-title">
              {isNewTemplate ? '📝 Create New Template' : '✏️ Edit Template'}
            </h3>

            {isNewTemplate && (
              <div className="template-helpers">
                <div className="helper-title">Quick Start Templates:</div>
                <div className="helper-buttons">
                  <button
                    className="btn-helper"
                    onClick={() => insertDefaultTemplate('initial')}
                  >
                    📩 Initial Booking Request
                  </button>
                  <button
                    className="btn-helper"
                    onClick={() => insertDefaultTemplate('followup')}
                  >
                    🔄 Follow-up Email
                  </button>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Template Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Initial Booking Request"
                value={editedTemplate.name}
                onChange={(e) => setEditedTemplate({ ...editedTemplate, name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">From Email *</label>
              <select
                className="form-select"
                value={editedTemplate.from_email}
                onChange={(e) => setEditedTemplate({
                  ...editedTemplate,
                  from_email: e.target.value as 'scott@camelranchbooking.com' | 'jake@camelranchbooking.com'
                })}
              >
                <option value="scott@camelranchbooking.com">scott@camelranchbooking.com</option>
                <option value="jake@camelranchbooking.com">jake@camelranchbooking.com</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Email Subject *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Booking Inquiry - Better Than Nothin' Band"
                value={editedTemplate.subject}
                onChange={(e) => setEditedTemplate({ ...editedTemplate, subject: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Body *</label>
              <textarea
                className="form-textarea"
                placeholder="Write your email template here..."
                value={editedTemplate.body}
                onChange={(e) => setEditedTemplate({ ...editedTemplate, body: e.target.value })}
              />
              <p style={{ color: '#9B8A7A', fontSize: '0.85rem', marginTop: '8px' }}>
                Tip: Use placeholders like [Venue Name], [Your Name], [Date Range] that you can fill in when sending
              </p>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={editedTemplate.is_default || false}
                  onChange={(e) => setEditedTemplate({ ...editedTemplate, is_default: e.target.checked })}
                />
                <span>Set as default template</span>
              </label>
            </div>

            <div className="btn-group">
              <button className="btn-cancel" onClick={cancelEdit}>
                Cancel
              </button>
              <button
                className="btn-save"
                onClick={isNewTemplate ? createTemplate : updateTemplate}
              >
                {isNewTemplate ? '✅ Create Template' : '✅ Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
