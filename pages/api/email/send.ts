import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { sendActEmail, stripHtml } from '../../../lib/emailSend';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    to,
    subject,
    html,
    bookingId,
    tourVenueId,
    venueId,
    contactId,
    actId,
    templateId,
    category,
    bodyPreview,
  } = req.body;

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'to, subject, html required' });
  }

  const service = getServiceClient();

  // Authenticate sender
  let userId: string | null = null;
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const { data: { user } } = await service.auth.getUser(token);
      userId = user?.id || null;
    }
  } catch {}

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  // Resolve caller's act and validate body-supplied actId before any write.
  const { data: callerProfile } = await service
    .from('profiles')
    .select('act_id')
    .eq('id', userId)
    .single();

  if (!callerProfile?.act_id) return res.status(403).json({ error: 'Forbidden' });
  if (actId && actId !== callerProfile.act_id) return res.status(403).json({ error: 'Forbidden' });

  const effectiveActId = callerProfile.act_id;

  // Validate tourVenueId ownership before delegating to sendActEmail
  if (tourVenueId) {
    const { data: tvLookup } = await service
      .from('tour_venues')
      .select('tour_id')
      .eq('id', tourVenueId)
      .single();
    if (!tvLookup) return res.status(403).json({ error: 'Forbidden' });
    const { data: tourCheck } = await service
      .from('tours')
      .select('id')
      .eq('id', tvLookup.tour_id)
      .eq('act_id', effectiveActId)
      .single();
    if (!tourCheck) return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const { email_log_id } = await sendActEmail({
      actId: effectiveActId,
      sentBy: userId,
      recipient: to,
      subject,
      body: bodyPreview || stripHtml(html),
      bodyHtml: html,
      bookingId: bookingId || undefined,
      venueId: venueId || undefined,
      tourVenueId: tourVenueId || undefined,
      contactId: contactId || undefined,
      templateId: templateId || undefined,
      category: category || undefined,
    });

    return res.status(200).json({ ok: true, email_log_id });
  } catch (err: any) {
    console.error('[email/send] send failed:', err);
    return res.status(500).json({ error: err?.message || 'Email send failed' });
  }
}
