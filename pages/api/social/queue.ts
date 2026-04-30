import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: acts } = await service
    .from('acts')
    .select('id')
    .eq('owner_id', user.id);

  const actIds = (acts || []).map((a: any) => a.id);
  if (actIds.length === 0) return res.status(200).json([]);

  if (req.method === 'GET') {
    const { status } = req.query;
    let query = service
      .from('social_queue')
      .select('*, act:acts(act_name), venue:venues(name, city, state)')
      .in('act_id', actIds)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status as string);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const { id, status, content } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });

    const { data: post } = await service.from('social_queue').select('act_id').eq('id', id).maybeSingle();
    if (!post || !actIds.includes(post.act_id)) return res.status(403).json({ error: 'Forbidden' });

    const update: any = {};
    if (status) update.status = status;
    if (content !== undefined) update.content = content;

    const { data, error } = await service.from('social_queue').update(update).eq('id', id).select('*').single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
