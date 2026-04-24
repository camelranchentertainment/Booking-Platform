import { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';
import { getServiceClient } from '../../../lib/supabase';

async function getResendConfig(service: ReturnType<typeof getServiceClient>) {
  if (process.env.RESEND_API_KEY) {
    return {
      apiKey: process.env.RESEND_API_KEY,
      from:   process.env.RESEND_FROM_EMAIL || 'booking@mail.camelranchbooking.com',
    };
  }
  const { data } = await service
    .from('platform_settings')
    .select('key, value')
    .in('key', ['resend_api_key', 'resend_from_email']);

  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key] = row.value;

  return {
    apiKey: map['resend_api_key'] || '',
    from:   map['resend_from_email'] || 'booking@mail.camelranchbooking.com',
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, subject, html, bookingId, tourVenueId, venueId, contactId, actId, templateId, category, bodyPreview } = req.body;
  if (!to || !subject || !html) return res.status(400).json({ error: 'to, subject, html required' });

  const service = getServiceClient();
  const { apiKey, from } = await getResendConfig(service);

  if (!apiKey) {
    return res.status(500).json({ error: 'Email not configured. Add your Resend API key in Settings.' });
  }

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({ from, to, subject, html });
    if (error) return res.status(500).json({ error: error.message });

    let agentId: string | null = null;
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const { data: { user } } = await service.auth.getUser(token);
        agentId = user?.id || null;
      }
    } catch {}

    await service.from('email_log').insert({
      sent_by:     agentId,
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

    // Update booking email stage if category provided
    if (bookingId && category) {
      await service.from('bookings').update({
        email_stage:       category,
        last_contact_date: new Date().toISOString(),
        follow_up_count:   category === 'follow_up_1' ? 1 : category === 'follow_up_2' ? 2 : undefined,
      }).eq('id', bookingId);

      await service.from('booking_emails').insert({
        booking_id:        bookingId,
        category,
        sent_at:           new Date().toISOString(),
        subject,
        body_preview:      bodyPreview ? bodyPreview.substring(0, 300) : null,
        resend_message_id: data?.id || null,
        sent_by:           agentId,
      });
    }

    // Update tour_venue status when emailing a prospect
    if (tourVenueId && category) {
      const statusMap: Record<string, string> = {
        target:       'pitched',
        follow_up_1:  'followup',
        follow_up_2:  'followup',
        confirmation: 'confirmed',
      };
      const newStatus = statusMap[category];
      if (newStatus) {
        await service.from('tour_venues').update({ status: newStatus }).eq('id', tourVenueId);
      }
    }

    return res.status(200).json({ ok: true, id: data?.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
