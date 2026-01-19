import { NextApiRequest, NextApiResponse } from 'next';
import nodemailer from 'nodemailer';
import { supabase, logEmail, updateVenueContactStatus } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { venueId, campaignId, templateId, customizations } = req.body;

    // Fetch venue details
    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .select('*')
      .eq('id', venueId)
      .single();

    if (venueError || !venue) {
      return res.status(404).json({ error: 'Venue not found' });
    }

    // Fetch email template
    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Email template not found' });
    }

    // Replace template variables
    let subject = template.subject;
    let body = template.body;

    const replacements: { [key: string]: string } = {
      venue_name: venue.name,
      city: venue.city,
      state: venue.state,
      booking_contact: venue.booking_contact || 'Booking Manager',
      season: customizations?.season || 'the upcoming season',
      ...customizations
    };

    // Replace all variables in subject and body
    Object.keys(replacements).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, replacements[key]);
      body = body.replace(regex, replacements[key]);
    });

    // Create email transporter
    // Note: You'll need to configure these environment variables
    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail', // 'gmail' or 'outlook'
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD, // For Gmail, use App Password
      },
    });

    // Send email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: venue.email,
      subject: subject,
      text: body,
      html: body.replace(/\n/g, '<br>'), // Basic HTML conversion
    };

    await transporter.sendMail(mailOptions);

    // Log the email
    await logEmail({
      venue_id: venueId,
      campaign_id: campaignId,
      email_template_id: templateId,
      sent_at: new Date().toISOString()
    });

    // Update venue status
    await updateVenueContactStatus(venueId, 'awaiting_response');

    return res.status(200).json({ 
      success: true, 
      message: 'Email sent successfully',
      venue: venue.name
    });
  } catch (error: any) {
    console.error('Email sending error:', error);
    return res.status(500).json({ error: error.message || 'Failed to send email' });
  }
}
