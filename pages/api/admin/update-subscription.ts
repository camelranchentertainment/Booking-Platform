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

// action: 'upgrade' | 'cancel' | 'refund'
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const admin = await getAuthedSuperadmin(req);
  if (!admin) return res.status(403).json({ error: 'Superadmin only' });

  const { userId, action, tier, note } = req.body;
  if (!userId || !action) return res.status(400).json({ error: 'userId and action required' });

  const service = getServiceClient();

  if (action === 'upgrade') {
    if (!tier) return res.status(400).json({ error: 'tier required for upgrade' });
    await service.from('user_profiles').update({
      subscription_tier: tier,
      subscription_status: 'active',
    }).eq('id', userId);
    return res.json({ ok: true });
  }

  if (action === 'cancel') {
    await service.from('user_profiles').update({
      subscription_status: 'cancelled',
    }).eq('id', userId);
    return res.json({ ok: true });
  }

  if (action === 'refund') {
    const existing = await service.from('user_profiles').select('admin_notes').eq('id', userId).single();
    const prev = (existing.data as any)?.admin_notes || '';
    const timestamp = new Date().toISOString().split('T')[0];
    const appended = prev ? `${prev}\n[${timestamp}] Refund: ${note}` : `[${timestamp}] Refund: ${note}`;
    await service.from('user_profiles').update({ admin_notes: appended }).eq('id', userId);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
