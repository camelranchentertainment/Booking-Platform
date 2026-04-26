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
  if (req.method !== 'DELETE') return res.status(405).end();
  const admin = await getAuthedSuperadmin(req);
  if (!admin) return res.status(403).json({ error: 'Superadmin only' });

  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const service = getServiceClient();

  // Guard: never delete a superadmin
  const { data: target } = await service.from('user_profiles').select('role').eq('id', userId).single();
  if (target?.role === 'superadmin') {
    return res.status(403).json({ error: 'Cannot delete superadmin' });
  }

  // Delete from auth (cascades to user_profiles via FK trigger)
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) {
    // Fallback: delete profile if auth delete fails
    await service.from('user_profiles').delete().eq('id', userId);
  }
  return res.json({ ok: true });
}
