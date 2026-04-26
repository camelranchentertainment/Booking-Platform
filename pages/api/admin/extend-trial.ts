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

  const { userId, days = 14 } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  const service = getServiceClient();
  const { data: profile } = await service.from('user_profiles').select('trial_ends_at').eq('id', userId).single();

  const base = profile?.trial_ends_at
    ? Math.max(new Date(profile.trial_ends_at).getTime(), Date.now())
    : Date.now();
  const newEnd = new Date(base + days * 86_400_000).toISOString();

  await service.from('user_profiles').update({
    trial_ends_at: newEnd,
    subscription_status: 'trialing',
  }).eq('id', userId);

  return res.json({ ok: true, trial_ends_at: newEnd });
}
