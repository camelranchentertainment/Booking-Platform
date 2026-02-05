import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase';
import nodemailer from 'nodemailer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, to, subject, body, cc, bcc } = req.body;

    if (!userId || !to || !subject || !body) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get user's SMTP settings
    const { data: smtpSettings, error: smtpError } = await supabase
      .from('smtp_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (smtpError || !smtpSettings) {
      return res.status(400).json({ 
        error: 'Email not configured. Please set up your email in Settings.' 
      });
    }

    // Create nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: smtpSettings.smtp_host,
      port: smtpSettings.smtp_port,
      secure: smtpSettings.smtp_port === 465, // true for 465, false for other ports
      auth: {
        user: smtpSettings.smtp_email,
        pass: smtpSettings.smtp_password,
      },
    });

    // Send email
    const info = await transporter.sendMail({
      from: `"${smtpSettings.smtp_from_name || smtpSettings.smtp_email}" <${smtpSettings.smtp_email}>`,
      to: to,
      cc: cc,
      bcc: bcc,
      subject: subject,
      text: body,
      html: body.replace(/\n/g, '<br>'),
    });

    // Update last_used_at
    await supabase
      .from('smtp_settings')
      .update({ last_used_at: new Date().toISOString() })
      .eq('user_id', userId);

    return res.status(200).json({ 
      success: true, 
      messageId: info.messageId,
      message: 'Email sent successfully' 
    });

  } catch (error: any) {
    console.error('Email sending error:', error);
    return res.status(500).json({ 
      error: 'Failed to send email',
      details: error.message 
    });
  }
}
