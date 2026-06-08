import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // NEVER delete a superadmin
  const { data: profile } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'superadmin') {
    return res.status(403).json({ error: 'Superadmin accounts cannot be deleted through this endpoint.' });
  }

  // Delete auth user (cascades to profiles via RLS and DB constraints)
  const { error } = await service.auth.admin.deleteUser(user.id);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
