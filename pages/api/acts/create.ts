import { NextApiRequest, NextApiResponse } from 'next';
import { supabase, getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { data: { user } } = await supabase.auth.getUser(
    req.headers.authorization?.replace('Bearer ', '')
  );
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { act_name, genre, bio, website, instagram, spotify } = req.body;
  if (!act_name?.trim()) return res.status(400).json({ error: 'act_name is required' });

  const service = getServiceClient();
  const { data, error } = await service.from('acts').insert({
    owner_id:  user.id,
    act_name:  act_name.trim(),
    genre:     genre     || null,
    bio:       bio       || null,
    website:   website   || null,
    instagram: instagram || null,
    spotify:   spotify   || null,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ act: data });
}
