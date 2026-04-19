import { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';
import { getServiceClient } from '../../../lib/supabase';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.RESEND_FROM_EMAIL || 'booking@mail.camelranchbooking.com';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, subject, html, bookingId, venueId, contactId, actId, templateId } = req.body;
  if (!to || !subject || !html) return res.status(400).json({ error: 'to, subject, html required' });

  const supabase = getServiceClient();

  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) return res.status(500).json({ error: error.message });

    // Log to email_log (agent_id pulled from auth token if provided)
    let agentId: string | null = null;
    try {
      const authHeader = req.headers.authorization?.replace('Bearer ', '');
      if (authHeader) {
        const { data: { user } } = await supabase.auth.getUser(authHeader);
        agentId = user?.id || null;
      }
    } catch {}

    await supabase.from('email_log').insert({
      agent_id:    agentId,
      booking_id:  bookingId  || null,
      venue_id:    venueId    || null,
      contact_id:  contactId  || null,
      act_id:      actId      || null,
      template_id: templateId || null,
      resend_id:   data?.id   || null,
      subject,
      recipient:   to,
      status:      'sent',
    });

    return res.status(200).json({ ok: true, id: data?.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
