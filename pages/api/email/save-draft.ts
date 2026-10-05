import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { isBandAdminRole } from '../../../lib/server/requireBandAdmin';
import { attachmentListSchema } from '../../../lib/emailAttachments';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const service = getServiceClient();

  // Verify auth
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const {
    draftId,
    actId,
    venueId,
    tourVenueId,
    bookingId,
    contactId,
    recipient,
    subject,
    body,
    category,
    attachments,
  } = req.body;

  // The band comes from the caller's profile — the body's actId is only checked, never trusted.
  const { data: profile } = await service
    .from('profiles')
    .select('act_id, role')
    .eq('id', user.id)
    .single();
  if (!profile?.act_id || !isBandAdminRole(profile.role)) return res.status(403).json({ error: 'Forbidden' });
  if (actId && actId !== profile.act_id) return res.status(403).json({ error: 'Forbidden' });

  const parsedAttachments = attachmentListSchema.safeParse(attachments ?? []);
  if (!parsedAttachments.success) return res.status(400).json({ error: 'Attachments are not valid' });

  const payload = {
    sent_by:       user.id,
    act_id:        profile.act_id,
    venue_id:      venueId      || null,
    tour_venue_id: tourVenueId  || null,
    booking_id:    bookingId    || null,
    contact_id:    contactId    || null,
    recipient:     recipient    || null,
    subject:       subject      || null,
    body:          body         || null,
    category:      category     || null,
    attachments:   parsedAttachments.data,
    direction:     'sent',
    status:        'draft',
    is_draft:      true,
    sent_at:       null,
    updated_at:    new Date().toISOString(),
  };

  if (draftId) {
    // Update existing draft — verify ownership
    const { data: existing } = await service.from('email_log')
      .select('id, sent_by')
      .eq('id', draftId)
      .eq('is_draft', true)
      .maybeSingle();

    if (!existing) return res.status(404).json({ error: 'Draft not found' });
    if (existing.sent_by !== user.id) return res.status(403).json({ error: 'Forbidden' });

    const { data, error } = await service.from('email_log')
      .update(payload)
      .eq('id', draftId)
      .select('id')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ id: data.id });
  }

  // Insert new draft
  const { data, error } = await service.from('email_log')
    .insert(payload)
    .select('id')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ id: data.id });
}
