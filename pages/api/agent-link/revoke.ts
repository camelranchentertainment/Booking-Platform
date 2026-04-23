// POST /api/agent-link/revoke
// Band admin revokes an agent's active access to their act.
// Sets link status → 'revoked' and clears acts.agent_id.
// The agent retains read-only visibility of historical bookings via the link record.

import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token || '');
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { linkId } = req.body;
  if (!linkId) return res.status(400).json({ error: 'linkId required' });

  // Load the link and verify the requesting user owns the act
  const { data: link } = await service
    .from('agent_act_links')
    .select('id, act_id, agent_id, status')
    .eq('id', linkId)
    .maybeSingle();

  if (!link) return res.status(404).json({ error: 'Link not found' });
  if (link.status !== 'active') return res.status(409).json({ error: 'Link is not currently active' });

  const { data: act } = await service
    .from('acts')
    .select('owner_id')
    .eq('id', link.act_id)
    .maybeSingle();

  if (act?.owner_id !== user.id) {
    return res.status(403).json({ error: 'Only the band owner can revoke agent access' });
  }

  // Revoke: update link status and strip acts.agent_id (removes write access)
  await Promise.all([
    service.from('agent_act_links').update({
      status:     'revoked',
      revoked_at: new Date().toISOString(),
    }).eq('id', linkId),
    service.from('acts').update({ agent_id: null }).eq('id', link.act_id),
  ]);

  return res.status(200).json({ ok: true });
}
