'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface EmailComposerProps {
  venue: {
    id: string;
    name: string;
    city: string;
    state: string;
    email?: string;
    booking_contact?: string;
  };
  campaignId: string;
  onClose: () => void;
  onSent: () => void;
}

export default function EmailComposer({ venue, campaignId, onClose, onSent }: EmailComposerProps) {
  const [template, setTemplate] = useState<any>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadTemplate();
  }, []);

  const loadTemplate = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .limit(1)
        .single();

      if (error) throw error;

      if (data) {
        setTemplate(data);
        // Personalize the template
        const personalizedSubject = data.subject
          .replace('{{venue_name}}', venue.name);
        
        const personalizedBody = data.body
          .replace(/{{booking_contact}}/g, venue.booking_contact || 'there')
          .replace(/{{venue_name}}/g, venue.name)
          .replace(/{{city}}/g, venue.city)
          .replace(/{{season}}/g, 'upcoming season');

        setSubject(personalizedSubject);
        setBody(personalizedBody);
      }
    } catch (error) {
      console.error('Error loading template:', error);
      // Set default template
      setSubject(`Live Music Booking Inquiry - Better Than Nothin'`);
      setBody(`Hello,

I hope this message finds you well! My name is Scott, and I represent Better Than Nothin', an Ozark Country band based in Northwest Arkansas.

We're currently booking shows and came across ${venue.name} in ${venue.city}. We love what you're doing with live music and think our high-energy country sound would be a great fit for your venue.

Better Than Nothin' delivers authentic Ozark Country with a mix of classic country covers and original songs. We typically play 3-4 hour sets and have experience playing venues ranging from intimate clubs to larger dancehalls.

Would you be interested in discussing available dates? We're flexible on scheduling and would love to bring our music to ${venue.name}.

Looking forward to hearing from you!

Best regards,
Scott
Better Than Nothin'
scott@camelranchbooking.com`);
    }
  };

  const sendEmail = async () => {
    if (!venue.email) {
      alert('This venue does not have an email address on file.');
      return;
    }

    setSending(true);

    try {
      // Log the email
      const { error: logError } = await supabase
        .from('email_logs')
        .insert([{
          venue_id: venue.id,
          campaign_id: campaignId,
          recipient_email: venue.email,
          subject: subject,
          status: 'sent'
        }]);

      if (logError) throw logError;

      // Update campaign_venues status
      const { error: updateError } = await supabase
        .from('campaign_venues')
        .update({
          sent_at: new Date().toISOString()
        })
        .eq('campaign_id', campaignId)
        .eq('venue_id', venue.id);

      if (updateError) throw updateError;

      // Update venue contact status
      const { error: venueError } = await supabase
        .from('venues')
        .update({
          contact_status: 'contacted',
          last_contacted: new Date().toISOString()
        })
        .eq('id', venue.id);

      if (venueError) throw venueError;

      // Update campaign contacted count
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('contacted')
        .eq('id', campaignId)
        .single();

      if (campaign) {
        await supabase
          .from('campaigns')
          .update({
            contacted: (campaign.contacted || 0) + 1
          })
          .eq('id', campaignId);
      }

      alert('✅ Email sent successfully!');
      onSent();
      onClose();
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Error sending email. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      padding: '2rem',
      animation: 'fadeIn 0.2s ease'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '2rem',
        maxWidth: '800px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(93, 78, 55, 0.2)',
        animation: 'slideUp 0.3s ease'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ marginBottom: '0.5rem', color: '#5D4E37' }}>📧 Contact Venue</h2>
            <p style={{ color: '#708090', margin: 0 }}>
              Sending to: <strong>{venue.name}</strong> in {venue.city}, {venue.state}
            </p>
            {venue.email && (
              <p style={{ color: '#5D4E37', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
                {venue.email}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#708090',
              padding: '0',
              lineHeight: '1'
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#36454F' }}>
            Subject Line
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #D3D3D3',
              borderRadius: '6px',
              fontSize: '1rem'
            }}
          />
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#36454F' }}>
            Message
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={15}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #D3D3D3',
              borderRadius: '6px',
              fontSize: '0.95rem',
              fontFamily: 'inherit',
              lineHeight: '1.6'
            }}
          />
        </div>

        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'flex-end',
          paddingTop: '1rem',
          borderTop: '1px solid #D3D3D3'
        }}>
          <button
            onClick={onClose}
            className="btn-secondary"
            disabled={sending}
          >
            Cancel
          </button>
          <button
            onClick={sendEmail}
            className="btn-primary"
            disabled={sending || !venue.email}
            style={{
              minWidth: '150px'
            }}
          >
            {sending ? '📤 Sending...' : '📧 Send Email'}
          </button>
        </div>

        {!venue.email && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: '#FFF8DC',
            border: '1px solid #D2B48C',
            borderRadius: '6px',
            color: '#5D4E37'
          }}>
            ⚠️ No email address on file for this venue. Please add one in the venue database first.
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
