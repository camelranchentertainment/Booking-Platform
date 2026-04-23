import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token || '');
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { inviteId } = req.body;
  if (!inviteId) return res.status(400).json({ error: 'inviteId required' });

  // Verify the invite belongs to this user's email before declining
  const { data: invite } = await service
    .from('act_invitations')
    .select('id, email')
    .eq('id', inviteId)
    .eq('status', 'pending')
    .maybeSingle();

  if (!invite) return res.status(404).json({ error: 'Invite not found or already resolved' });
  if (invite.email !== user.email) return res.status(403).json({ error: 'Forbidden' });

  await service.from('act_invitations').update({ status: 'declined' }).eq('id', inviteId);

  return res.status(200).json({ ok: true });
}
