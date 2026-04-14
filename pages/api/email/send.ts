import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getTransporter, getUserFromToken, logSentEmail } from '../../../lib/emailHelper';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let userId: string;
    try {
      const authedUser = await getUserFromToken(req.headers.authorization);
      userId = authedUser.id;
    } catch {
      const bodyUserId = req.body?.userId as string | undefined;
      if (!bodyUserId) throw new Error('Not authenticated');
      userId = bodyUserId;
    }

    const { venueId, campaignId, templateId, customSubject, customBody } = req.body;

    if (!venueId) return res.status(400).json({ error: 'venueId is required' });

    // ── Load venue ────────────────────────────────────────────────────────────
    const { data: venue, error: venueErr } = await supabase
      .from('venues')
      .select('*')
      .eq('id', venueId)
      .single();

    if (venueErr || !venue) return res.status(404).json({ error: 'Venue not found' });
    if (!venue.email)       return res.status(400).json({ error: 'This venue has no email address on file' });

    // ── Resolve subject + body (template or custom) ───────────────────────────
    let subject = customSubject ?? '';
    let body    = customBody    ?? '';

    if (templateId && (!customSubject || !customBody)) {
      const { data: template, error: tplErr } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (tplErr || !template) return res.status(404).json({ error: 'Template not found' });

      subject = subject || template.subject;
      body    = body    || template.body;
    }

    if (!subject || !body) return res.status(400).json({ error: 'Email subject and body are required' });

    // ── Replace template variables ────────────────────────────────────────────
    const vars: Record<string, string> = {
      venue_name:      venue.name       ?? '',
      city:            venue.city       ?? '',
      state:           venue.state      ?? '',
      booking_contact: venue.booking_contact ?? 'Booking Manager',
    };
    Object.entries(vars).forEach(([k, v]) => {
      subject = subject.replace(new RegExp(`{{${k}}}`, 'g'), v);
      body    = body.replace(new RegExp(`{{${k}}}`, 'g'), v);
    });

    // ── Build transporter from user's saved settings ──────────────────────────
    const { transporter, settings } = await getTransporter(userId);

    // ── Send ──────────────────────────────────────────────────────────────────
    const info = await transporter.sendMail({
      from:    `"${settings.display_name}" <${settings.email_address}>`,
      to:      venue.email,
      subject,
      text:    body,
      html:    body.replace(/\n/g, '<br>'),
    });

    // ── Log to email_logs ─────────────────────────────────────────────────────
    await logSentEmail({
      userId,
      venueId,
      campaignId,
      templateId,
      toAddress:  venue.email,
      subject,
      body,
      messageId:  info.messageId,
    });

    // ── Update venue contact status ───────────────────────────────────────────
    await supabase
      .from('venues')
      .update({ contact_status: 'awaiting_response', last_contacted: new Date().toISOString() })
      .eq('id', venueId);

    return res.status(200).json({
      success: true,
      message: `Email sent to ${venue.name}`,
      messageId: info.messageId,
    });

  } catch (error: any) {
    console.error('Send email error:', error);

    // Surface friendly messages for common auth failures
    if (error.message?.includes('No email account connected')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'EAUTH' || error.responseCode === 535) {
      return res.status(400).json({ error: 'Email authentication failed. Check your credentials in Settings → Email Account.' });
    }

    return res.status(500).json({ error: error.message || 'Failed to send email' });
  }
}
