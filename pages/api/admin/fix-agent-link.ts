import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

async function getAuthedSuperadmin(req: NextApiRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await service.from('user_profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'superadmin' ? user : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const admin = await getAuthedSuperadmin(req);
  if (!admin) return res.status(403).json({ error: 'Superadmin only' });

  const { actId, agentId } = req.body;
  if (!actId) return res.status(400).json({ error: 'actId required' });

  const service = getServiceClient();
  await service.from('acts').update({ agent_id: agentId || null }).eq('id', actId);
  return res.json({ ok: true });
}
