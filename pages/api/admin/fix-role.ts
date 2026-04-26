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

const VALID_ROLES = ['agent', 'act_admin', 'member'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const admin = await getAuthedSuperadmin(req);
  if (!admin) return res.status(403).json({ error: 'Superadmin only' });

  const { userId, newRole } = req.body;
  if (!userId || !newRole) return res.status(400).json({ error: 'userId and newRole required' });
  if (!VALID_ROLES.includes(newRole)) return res.status(400).json({ error: 'Invalid role' });

  const service = getServiceClient();

  // Never allow changing a superadmin's role
  const { data: target } = await service.from('user_profiles').select('role').eq('id', userId).single();
  if (target?.role === 'superadmin') {
    return res.status(403).json({ error: 'Cannot change superadmin role' });
  }

  await service.from('user_profiles').update({ role: newRole }).eq('id', userId);
  return res.json({ ok: true });
}
