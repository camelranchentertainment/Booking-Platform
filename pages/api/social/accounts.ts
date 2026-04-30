import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Resolve act IDs this user can manage (agent or owner)
  const { data: acts } = await service
    .from('acts')
    .select('id')
    .eq('owner_id', user.id);
  const actIds = (acts || []).map((a: any) => a.id);

  if (req.method === 'GET') {
    const { actId } = req.query;
    if (actId && !actIds.includes(actId as string))
      return res.status(403).json({ error: 'Forbidden' });

    const query = service
      .from('social_accounts')
      .select('id, act_id, platform, handle, updated_at')
      .in('act_id', actId ? [actId] : actIds);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data || []);
  }

  if (req.method === 'POST') {
    const { actId, platform, credentials, handle } = req.body;
    if (!actId || !platform) return res.status(400).json({ error: 'actId and platform required' });
    if (!actIds.includes(actId)) return res.status(403).json({ error: 'Forbidden' });

    const { data, error } = await service
      .from('social_accounts')
      .upsert(
        { act_id: actId, platform, credentials, handle: handle || null, updated_at: new Date().toISOString() },
        { onConflict: 'act_id,platform' }
      )
      .select('id, act_id, platform, handle, updated_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { actId, platform } = req.body;
    if (!actId || !platform) return res.status(400).json({ error: 'actId and platform required' });
    if (!actIds.includes(actId)) return res.status(403).json({ error: 'Forbidden' });

    const { error } = await service
      .from('social_accounts')
      .delete()
      .eq('act_id', actId)
      .eq('platform', platform);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
