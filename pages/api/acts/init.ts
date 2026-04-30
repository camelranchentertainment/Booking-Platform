import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase, getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();

  const { data: profile } = await service
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'act_admin') {
    return res.status(403).json({ error: 'Only band admins can use this endpoint' });
  }

  const { act_name } = req.body;
  if (!act_name?.trim()) return res.status(400).json({ error: 'Band name is required' });

  // Prevent duplicates — check both owner_id and profile act_id
  const { data: existing } = await service.from('acts').select('id').eq('owner_id', user.id).limit(1);
  if (existing?.length) return res.status(400).json({ error: 'You already have a band profile' });

  const { data: prof } = await service.from('user_profiles').select('act_id').eq('id', user.id).single();
  if (prof?.act_id) return res.status(400).json({ error: 'You already have a band profile' });

  const { data: act, error } = await service.from('acts').insert({
    owner_id: user.id,
    act_name: act_name.trim(),
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ act });
}
