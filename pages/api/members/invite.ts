// pages/api/members/invite.ts
//
// POST { actId, email, role, personnel_id? } → { ok: true, emailSent }
// Invites someone to a band. Band admins (or a superadmin) only; the invite
// logic itself lives in lib/server/memberInvite (shared with the agent).
import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { isBandAdminRole } from '../../../lib/server/requireBandAdmin';
import { createAndSendInvite, InviteError, normalizeInviteEmail } from '../../../lib/server/memberInvite';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token || '');
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { actId, email: rawEmail, role: rawRole, personnel_id: personnelId } = req.body ?? {};
  // Roster invites are always member — enforced server-side regardless of what the client sends.
  const role = personnelId ? 'member' : rawRole;
  if (!actId || !rawEmail || !role) return res.status(400).json({ error: 'actId, email, role required' });
  if (!['band_admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const email = normalizeInviteEmail(rawEmail);
  if (!email) return res.status(400).json({ error: "That email address doesn't look right." });

  // Service client bypasses RLS: the caller must be an admin of this band.
  const { data: callerProfile } = await service
    .from('profiles')
    .select('display_name, agency_name, act_id, role')
    .eq('id', user.id)
    .single();
  if (!callerProfile || !isBandAdminRole(callerProfile.role)) return res.status(403).json({ error: 'Forbidden' });
  if (callerProfile.role !== 'superadmin' && callerProfile.act_id !== actId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (personnelId) {
    const { data: person } = await service
      .from('act_personnel').select('id').eq('id', personnelId).eq('act_id', actId).maybeSingle();
    if (!person) return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    // No duplicate check here on purpose: re-inviting someone resends their link.
    const { emailSent } = await createAndSendInvite(service, {
      actId,
      inviterId: user.id,
      inviterName: callerProfile.agency_name || callerProfile.display_name || user.email || 'Someone',
      email,
      role,
      personnelId: personnelId || null,
    });
    return res.status(200).json({ ok: true, emailSent });
  } catch (err) {
    if (err instanceof InviteError) return res.status(err.status).json({ error: err.message });
    console.error('[members/invite] failed:', err);
    return res.status(500).json({ error: 'Could not send the invite. Try again.' });
  }
}
