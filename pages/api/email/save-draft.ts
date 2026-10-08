import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { isBandAdminRole } from '../../../lib/server/requireBandAdmin';
import { attachmentListSchema } from '../../../lib/emailAttachments';
import { buildDraftPayload } from '../../../lib/server/draftPayload';
import { ownedVenueId, ownedContactId } from '../../../lib/server/actOwnership';

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

  // Drop venue/contact ids that belong to another band (service role bypasses RLS).
  let safeVenueId: string | null;
  let safeContactId: string | null;
  try {
    [safeVenueId, safeContactId] = await Promise.all([
      ownedVenueId(service, profile.act_id, venueId),
      ownedContactId(service, profile.act_id, contactId),
    ]);
  } catch (err) {
    console.error('[email/save-draft] ownership check failed:', err);
    return res.status(500).json({ error: 'Could not save the draft. Try again.' });
  }

  // No sent_at here: the column is NOT NULL (default now()), see buildDraftPayload.
  const payload = buildDraftPayload(
    { venueId: safeVenueId, tourVenueId, bookingId, contactId: safeContactId, recipient, subject, body, category },
    user.id,
    profile.act_id,
    parsedAttachments.data,
  );

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
